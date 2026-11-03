package com.mstars.zcoderemote

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject

data class Task(
    val id: String,
    val text: String,
    val state: String,
    val workspace: String? = null,
    val result: String? = null,
    val outputTail: List<String> = emptyList(),
    val createdAt: String = "",
)

data class PermRequest(val permId: String, val tool: String, val summary: String, val taskId: String?)

// 单例仓库：REST + WebSocket + 状态流
object Repo {
    private lateinit var prefs: SharedPreferences
    private val ok = OkHttpClient.Builder().build()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var ws: WebSocket? = null

    var serverUrl: String = ""
        private set
    var phoneToken: String = ""
        private set

    val tasks = MutableStateFlow<List<Task>>(emptyList())
    val connected = MutableStateFlow(false)
    val pcOnline = MutableStateFlow(false)
    val pendingPerm = MutableStateFlow<PermRequest?>(null)
    val toast = MutableStateFlow<String?>(null)

    val configured: Boolean get() = serverUrl.isNotBlank() && phoneToken.isNotBlank()

    fun init(context: Context) {
        prefs = context.getSharedPreferences("zcode-remote", Context.MODE_PRIVATE)
        serverUrl = prefs.getString("serverUrl", "") ?: ""
        phoneToken = prefs.getString("phoneToken", "") ?: ""
        if (configured) {
            scope.launch { refresh(); connectLoop() }
        }
    }

    fun save(server: String, token: String, onDone: (ok: Boolean, msg: String) -> Unit) {
        scope.launch {
            val base = server.trim().removeSuffix("/")
            try {
                val req = Request.Builder().url("$base/health").build()
                ok.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        onDone(false, "health ${resp.code}")
                        return@launch
                    }
                }
                // health 通过后校验 token：GET /tasks
                val req2 = Request.Builder().url("$base/tasks")
                    .header("Authorization", "Bearer ${token.trim()}").build()
                ok.newCall(req2).execute().use { resp ->
                    if (resp.code == 401) {
                        onDone(false, "token 无效（401）")
                        return@launch
                    }
                }
                serverUrl = base
                phoneToken = token.trim()
                prefs.edit().putString("serverUrl", base).putString("phoneToken", phoneToken).apply()
                refresh()
                connectLoop()
                onDone(true, "已连接 $base")
            } catch (e: Exception) {
                onDone(false, "连接失败: ${e.message}")
            }
        }
    }

    private var connecting = false
    private fun connectLoop() {
        if (connecting || !configured) return
        connecting = true
        scope.launch {
            var backoff = 2000L
            while (true) {
                if (!configured) break
                val opened = openWs()
                if (opened) {
                    backoff = 2000L
                    // 等 WS 关闭（由 listener 置空）
                    while (ws != null) delay(500)
                }
                delay(backoff)
                backoff = (backoff * 3 / 2).coerceAtMost(30_000L)
            }
        }
    }

    private fun openWs(): Boolean {
        val httpUrl = serverUrl.replaceFirst("http", "ws")
        val req = Request.Builder().url("$httpUrl/ws?token=$phoneToken").build()
        val opened = java.util.concurrent.atomic.AtomicBoolean(false)
        val latch = kotlinx.coroutines.CompletableDeferred<Boolean>()
        ws = ok.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
                opened.set(true)
                connected.value = true
                latch.complete(true)
                scope.launch { refresh() }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    handleMessage(JSONObject(text))
                } catch (_: Exception) {
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) {
                connected.value = false
                if (ws === webSocket) ws = null
                latch.complete(opened.get())
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                connected.value = false
                if (ws === webSocket) ws = null
                latch.complete(opened.get())
            }
        })
        // 5 秒没连上视为失败，关闭重来
        scope.launch {
            delay(5000)
            if (!opened.get()) {
                latch.complete(false)
                ws?.close(1000, "timeout")
                ws = null
            }
        }
        return kotlinx.coroutines.runBlocking { latch.await() }
    }

    private fun handleMessage(m: JSONObject) {
        when (m.optString("type")) {
            "task.status" -> patchTask(m.optString("id")) { it.copy(state = m.optString("state"), result = m.optString("note", it.result ?: "")) }
            "task.output" -> {
                val lines = mutableListOf<String>()
                val arr = m.optJSONArray("lines") ?: JSONArray()
                for (i in 0 until arr.length()) lines.add(arr.getString(i))
                patchTask(m.optString("id")) { it.copy(outputTail = (it.outputTail + lines).takeLast(100)) }
            }
            "task.done" -> patchTask(m.optString("id")) { it.copy(state = m.optString("state"), result = m.optString("result", it.result ?: "")) }
            "task.deleted" -> tasks.value = tasks.value.filter { it.id != m.optString("id") }
            "pc.online" -> pcOnline.value = true
            "pc.offline" -> pcOnline.value = false
            "perm.request" -> pendingPerm.value = PermRequest(
                m.optString("permId"), m.optString("tool"), m.optString("summary"),
                if (m.isNull("taskId")) null else m.optString("taskId"),
            )
        }
    }

    private fun patchTask(id: String, f: (Task) -> Task) {
        tasks.value = tasks.value.map { if (it.id == id) f(it) else it }
    }

    fun refresh() {
        if (!configured) return
        scope.launch {
            try {
                val req = Request.Builder().url("$serverUrl/tasks")
                    .header("Authorization", "Bearer $phoneToken").build()
                ok.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@use
                    val arr = JSONObject(resp.body!!.string()).optJSONArray("tasks") ?: JSONArray()
                    val list = mutableListOf<Task>()
                    for (i in 0 until arr.length()) list.add(taskFrom(arr.getJSONObject(i)))
                    tasks.value = list
                    val h = ok.newCall(Request.Builder().url("$serverUrl/health").build()).execute().use { r ->
                        if (r.isSuccessful) JSONObject(r.body!!.string()) else null
                    }
                    pcOnline.value = h?.optBoolean("pcOnline") ?: false
                }
            } catch (_: Exception) {
            }
        }
    }

    private fun taskFrom(o: JSONObject): Task = Task(
        id = o.optString("id"),
        text = o.optString("text"),
        state = o.optString("state"),
        workspace = if (o.isNull("workspace")) null else o.optString("workspace"),
        result = if (o.isNull("result")) null else o.optString("result"),
        outputTail = o.optJSONArray("outputTail")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList(),
        createdAt = o.optString("createdAt"),
    )

    fun sendTask(text: String, workspace: String?) {
        scope.launch {
            try {
                val body = JSONObject().put("text", text)
                if (!workspace.isNullOrBlank()) body.put("workspace", workspace.trim())
                val req = Request.Builder().url("$serverUrl/tasks")
                    .header("Authorization", "Bearer $phoneToken")
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                ok.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val t = taskFrom(JSONObject(resp.body!!.string()).getJSONObject("task"))
                        tasks.value = listOf(t) + tasks.value
                    } else toast.value = "发送失败: ${resp.code}"
                }
            } catch (e: Exception) {
                toast.value = "发送失败: ${e.message}"
            }
        }
    }

    fun decide(perm: PermRequest, allow: Boolean) {
        pendingPerm.value = null
        scope.launch {
            try {
                val body = JSONObject().put("allow", allow)
                val req = Request.Builder().url("$serverUrl/perm/${perm.permId}")
                    .header("Authorization", "Bearer $phoneToken")
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                ok.newCall(req).execute().use { resp ->
                    toast.value = if (resp.isSuccessful) (if (allow) "已允许 " else "已拒绝 ") + perm.tool else "批准失败: ${resp.code}"
                }
            } catch (e: Exception) {
                toast.value = "批准失败: ${e.message}"
            }
        }
    }
}
