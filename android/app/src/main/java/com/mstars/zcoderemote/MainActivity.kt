package com.mstars.zcoderemote

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.collectLatest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ---------- 设计语言：暗色控制台 ----------

object Z {
    val Bg = Color(0xFF0B0F14)
    val Surface = Color(0xFF0F151C)
    val Card = Color(0xFF121A23)
    val Inset = Color(0xFF0A0F15)
    val Border = Color(0x16FFFFFF)
    val Text = Color(0xFFE6EDF3)
    val Text2 = Color(0xFF97A4B2)
    val Text3 = Color(0xFF5A6A79)
    val Accent = Color(0xFF3FB950)
    val AccentDim = Color(0xFF238636)
    val Running = Color(0xFF58A6FF)
    val Failed = Color(0xFFF85149)
    val Warn = Color(0xFFD29922)
    val Queued = Color(0xFF7D8590)
    val Mono = FontFamily.Monospace
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Repo.init(applicationContext)
        setContent { App() }
    }
}

@Composable
fun App() {
    MaterialTheme(
        colorScheme = MaterialTheme.colorScheme.copy(
            background = Z.Bg, surface = Z.Surface, primary = Z.Accent, onPrimary = Color.White,
            onBackground = Z.Text, onSurface = Z.Text, error = Z.Failed,
        ),
    ) {
        val snackbar = remember { SnackbarHostState() }
        LaunchedEffect(Unit) {
            Repo.toast.collectLatest { msg ->
                msg?.let { snackbar.showSnackbar(it); Repo.toast.value = null }
            }
        }
        Scaffold(containerColor = Z.Bg, snackbarHost = { SnackbarHost(snackbar) }) { pad ->
            val configured by Repo.configured.collectAsState()
            Box(Modifier.padding(pad)) {
                if (configured) SessionsRoot() else SettingsScreen()
            }
        }
    }
}

@Composable
fun LogoBadge(sizeDp: androidx.compose.ui.unit.Dp) {
    Box(
        Modifier.size(sizeDp).background(Z.AccentDim, RoundedCornerShape(sizeDp / 4)),
        contentAlignment = Alignment.Center,
    ) {
        Text(">_", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, fontFamily = Z.Mono)
    }
}

@Composable
fun StatusDot(ok: Boolean, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).background(if (ok) Z.Accent else Z.Text3, CircleShape))
        Spacer(Modifier.width(4.dp))
        Text(label, fontSize = 11.sp, color = Z.Text2)
    }
}

// ---------- 设置页 ----------

@Composable
fun SettingsScreen(initialUrl: String = "http://10.0.2.2:8787", initialToken: String = "", onSaved: (() -> Unit)? = null) {
    var url by remember { mutableStateOf(initialUrl) }
    var token by remember { mutableStateOf(initialToken) }
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().background(Z.Bg).padding(horizontal = 28.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        LogoBadge(28.dp)
        Spacer(Modifier.height(18.dp))
        Text("ZCode Remote", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = Z.Text)
        Spacer(Modifier.height(6.dp))
        Text("让手机成为电脑上 ZCode 的遥控器", fontSize = 14.sp, color = Z.Text2)
        Spacer(Modifier.height(36.dp))
        Text("SERVER", fontSize = 10.sp, fontFamily = Z.Mono, color = Z.Text3, letterSpacing = 1.5.sp)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = url, onValueChange = { url = it },
            modifier = Modifier.fillMaxWidth(), singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = Z.Mono, color = Z.Text),
            placeholder = { Text("https://mstarsm.com/zremote", fontFamily = Z.Mono, color = Z.Text3, fontSize = 14.sp) },
            colors = fieldColors(),
        )
        Spacer(Modifier.height(16.dp))
        Text("TOKEN", fontSize = 10.sp, fontFamily = Z.Mono, color = Z.Text3, letterSpacing = 1.5.sp)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = token, onValueChange = { token = it },
            modifier = Modifier.fillMaxWidth(), singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = Z.Mono, color = Z.Text, fontSize = 13.sp),
            placeholder = { Text("server tokens.json → phoneToken", fontFamily = Z.Mono, color = Z.Text3, fontSize = 12.sp) },
            colors = fieldColors(),
        )
        Spacer(Modifier.height(28.dp))
        Button(
            onClick = {
                busy = true; msg = "连接中…"
                Repo.save(url, token) { ok, m -> busy = false; msg = m; if (ok) onSaved?.invoke() }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Z.AccentDim, contentColor = Color.White, disabledContainerColor = Z.AccentDim.copy(alpha = 0.5f)),
        ) {
            Text(if (busy) "连接中…" else "连接服务器", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        }
        msg?.let {
            Spacer(Modifier.height(14.dp))
            Text(it, fontSize = 12.sp, fontFamily = Z.Mono, color = if (it.startsWith("已连接")) Z.Accent else Z.Text2)
        }
        Spacer(Modifier.height(40.dp))
        Text("任务注入 ≈ 任意代码执行：请只连接你自己的服务器", fontSize = 11.sp, fontFamily = Z.Mono, color = Z.Text3)
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Z.Accent,
    unfocusedBorderColor = Z.Border,
    focusedContainerColor = Z.Card,
    unfocusedContainerColor = Z.Card,
    cursorColor = Z.Accent,
    focusedLabelColor = Z.Accent,
    unfocusedLabelColor = Z.Text3,
)

// ---------- 会话列表（主页） ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsRoot() {
    var open by remember { mutableStateOf<SessionInfo?>(null) }
    if (open != null) {
        BackHandler { open = null }
        ConversationScreen(open!!, onBack = { open = null })
        return
    }
    SessionsScreen(onOpen = { open = it })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsScreen(onOpen: (SessionInfo) -> Unit) {
    val sessions by Repo.sessions.collectAsState()
    val connected by Repo.connected.collectAsState()
    val pcOnline by Repo.pcOnline.collectAsState()
    val perm by Repo.pendingPerm.collectAsState()
    var showSettings by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { Repo.requestSessions() }

    if (showSettings) {
        SettingsScreen(initialUrl = Repo.serverUrl, initialToken = Repo.phoneToken, onSaved = { showSettings = false })
        return
    }

    Scaffold(
        containerColor = Z.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Z.Surface, titleContentColor = Z.Text),
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LogoBadge(26.dp)
                        Spacer(Modifier.width(10.dp))
                        Text("ZCode Remote", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                },
                actions = {
                    StatusDot(connected, "服务器")
                    Spacer(Modifier.width(10.dp))
                    StatusDot(pcOnline, "PC")
                    Spacer(Modifier.width(6.dp))
                    TextButton(onClick = { Repo.requestSessions() }) { Text("刷新", color = Z.Text2, fontSize = 13.sp) }
                    TextButton(onClick = { showSettings = true }) { Text("⚙", color = Z.Text2, fontSize = 16.sp) }
                },
            )
        },
    ) { pad ->
        if (sessions.isEmpty()) {
            Column(
                Modifier.padding(pad).fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                LogoBadge(52.dp)
                Spacer(Modifier.height(18.dp))
                Text("暂无会话", color = Z.Text, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                Text("PC 在线时会自动同步任务列表", fontSize = 12.sp, color = Z.Text3)
            }
        } else {
            val groups = sessions.groupBy { it.workspacePath ?: "默认工作区" }
            LazyColumn(Modifier.padding(pad).fillMaxSize().padding(horizontal = 14.dp)) {
                groups.forEach { (ws, list) ->
                    item(key = "h_$ws") {
                        Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("⌂ ", fontSize = 12.sp, color = Z.Accent)
                            Text(
                                ws, fontSize = 12.sp, fontFamily = Z.Mono,
                                color = Z.Text2,
                                modifier = Modifier.weight(1f),
                            )
                            Text("${list.size}", fontSize = 11.sp, fontFamily = Z.Mono, color = Z.Text3)
                        }
                    }
                    items(list, key = { it.sessionId }) { s ->
                        Card(
                            onClick = { onOpen(s) },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Z.Card),
                            border = BorderStroke(1.dp, Z.Border),
                        ) {
                            Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        s.title, fontSize = 14.sp, color = Z.Text,
                                        maxLines = 2, lineHeight = 18.sp,
                                    )
                                    Spacer(Modifier.height(3.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        SessionStatusDot(s.status)
                                        Spacer(Modifier.width(6.dp))
                                        Text(fmtTime(s.updatedAt), fontSize = 10.sp, fontFamily = Z.Mono, color = Z.Text3)
                                        if (s.mode.isNotBlank()) {
                                            Spacer(Modifier.width(8.dp))
                                            Text(s.mode, fontSize = 10.sp, fontFamily = Z.Mono, color = Z.Text3)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(10.dp)) }
            }
        }
    }

    perm?.let { p -> PermDialog(p) }
}

private fun fmtTime(ms: Long): String {
    if (ms <= 0) return ""
    return SimpleDateFormat("MM-dd HH:mm", Locale.getDefault()).format(Date(ms))
}

@Composable
fun SessionStatusDot(status: String) {
    val c = when (status) {
        "running" -> Z.Running
        "idle" -> Z.Accent
        else -> Z.Queued
    }
    Box(Modifier.size(6.dp).background(c, CircleShape))
}

// ---------- 对话视图 ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationScreen(session: SessionInfo, onBack: () -> Unit) {
    val messages by Repo.chatMessages.collectAsState()
    val msgs = messages[session.sessionId] ?: emptyList()
    val perm by Repo.pendingPerm.collectAsState()
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(session.sessionId) {
        Repo.requestMessages(session.sessionId)
        while (true) {
            kotlinx.coroutines.delay(8000)
            Repo.requestMessages(session.sessionId)
        }
    }
    LaunchedEffect(msgs.size) {
        if (msgs.isNotEmpty()) listState.animateScrollToItem(msgs.size - 1)
    }

    Scaffold(
        containerColor = Z.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Z.Surface, titleContentColor = Z.Text),
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("←", color = Z.Text2, fontSize = 18.sp) }
                },
                title = {
                    Column {
                        Text(session.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                        Text(session.workspacePath ?: "", fontSize = 10.sp, fontFamily = Z.Mono, color = Z.Text3, maxLines = 1)
                    }
                },
                actions = {
                    TextButton(onClick = { Repo.requestMessages(session.sessionId) }) { Text("刷新", color = Z.Text2, fontSize = 13.sp) }
                },
            )
        },
        bottomBar = {
            Column(Modifier.fillMaxWidth().background(Z.Surface).padding(horizontal = 14.dp, vertical = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = input,
                        onValueChange = { input = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("继续这个对话…", color = Z.Text3, fontSize = 14.sp) },
                        minLines = 1, maxLines = 4,
                        shape = RoundedCornerShape(14.dp),
                        textStyle = MaterialTheme.typography.bodyMedium.copy(color = Z.Text),
                        colors = fieldColors(),
                    )
                    Spacer(Modifier.width(10.dp))
                    FilledIconButton(
                        onClick = {
                            if (input.isNotBlank()) {
                                Repo.sendToSession(session.sessionId, input)
                                input = ""
                            }
                        },
                        enabled = input.isNotBlank(),
                        modifier = Modifier.size(52.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = Z.AccentDim, contentColor = Color.White,
                            disabledContainerColor = Z.Card, disabledContentColor = Z.Text3,
                        ),
                    ) { Text("↑", fontSize = 20.sp, fontWeight = FontWeight.Bold) }
                }
            }
        },
    ) { pad ->
        if (msgs.isEmpty()) {
            Column(Modifier.padding(pad).fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("读取对话中…", color = Z.Text3, fontSize = 13.sp, fontFamily = Z.Mono)
                Text("PC 离线或会话为空", fontSize = 11.sp, color = Z.Text3)
            }
        } else {
            LazyColumn(
                Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp),
                state = listState,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(msgs) { m ->
                    ChatBubble(m)
                }
                item { Spacer(Modifier.height(8.dp)) }
            }
        }
    }

    perm?.let { p -> PermDialog(p) }
}

@Composable
fun ChatBubble(m: ChatMsg) {
    val isUser = m.role == "user"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
        Box(
            Modifier
                .fillMaxWidth(if (isUser) 0.86f else 0.92f)
                .background(
                    if (isUser) Z.AccentDim.copy(alpha = 0.35f) else Z.Card,
                    RoundedCornerShape(
                        topStart = 14.dp, topEnd = 14.dp,
                        bottomStart = if (isUser) 14.dp else 4.dp,
                        bottomEnd = if (isUser) 4.dp else 14.dp,
                    ),
                )
                .border(1.dp, Z.Border, RoundedCornerShape(14.dp))
                .padding(horizontal = 12.dp, vertical = 9.dp)
                .animateContentSize(),
        ) {
            Text(
                m.text, fontSize = 13.5.sp, lineHeight = 19.sp,
                color = if (isUser) Color(0xFFD7F5DE) else Z.Text,
            )
        }
    }
}

// ---------- 远程批准 ----------

@Composable
fun PermDialog(p: PermRequest) {
    AlertDialog(
        onDismissRequest = {},
        containerColor = Z.Card,
        titleContentColor = Z.Text,
        textContentColor = Z.Text2,
        title = { Text("需要你批准", fontSize = 17.sp, fontWeight = FontWeight.SemiBold) },
        text = {
            Column {
                Text("电脑上的 ZCode 请求执行敏感操作：", fontSize = 13.sp)
                Spacer(Modifier.height(10.dp))
                Text("工具 ${p.tool}", fontSize = 13.sp, fontFamily = Z.Mono, color = Z.Running)
                Spacer(Modifier.height(6.dp))
                Text(
                    p.summary, fontSize = 12.sp, fontFamily = Z.Mono,
                    modifier = Modifier.background(Z.Inset, RoundedCornerShape(8.dp)).padding(10.dp).fillMaxWidth(),
                    lineHeight = 16.sp,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { Repo.decide(p, true) },
                colors = ButtonDefaults.buttonColors(containerColor = Z.AccentDim, contentColor = Color.White),
            ) { Text("允许执行") }
        },
        dismissButton = {
            OutlinedButton(onClick = { Repo.decide(p, false) }) { Text("拒绝", color = Z.Failed) }
        },
    )
}
