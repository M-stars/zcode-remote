package com.mstars.zcoderemote

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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

// ---------- 设计语言：暗色控制台 ----------

object Z {
    val Bg = Color(0xFF0B0F14) // 页面底色
    val Surface = Color(0xFF0F151C) // 顶栏/输入栏
    val Card = Color(0xFF121A23) // 卡片
    val CardHover = Color(0xFF16202B)
    val Inset = Color(0xFF0A0F15) // 卡片内嵌面板（代码/结果）
    val Border = Color(0x16FFFFFF) // 细描边
    val Text = Color(0xFFE6EDF3)
    val Text2 = Color(0xFF97A4B2)
    val Text3 = Color(0xFF5A6A79)
    val Accent = Color(0xFF3FB950) // 主色：终端绿
    val AccentDim = Color(0xFF238636)
    val Running = Color(0xFF58A6FF) // 执行中：蓝
    val Failed = Color(0xFFF85149) // 失败：红
    val Warn = Color(0xFFD29922) // 取消中：琥珀
    val Queued = Color(0xFF7D8590) // 排队：灰
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
        Scaffold(
            containerColor = Z.Bg,
            snackbarHost = { SnackbarHost(snackbar) },
        ) { pad ->
            Box(Modifier.padding(pad)) {
                if (Repo.configured) TasksScreen() else SettingsScreen()
            }
        }
    }
}

// ---------- 设置页 ----------

@Composable
fun SettingsScreen(initialUrl: String = "http://10.0.2.2:8787", initialToken: String = "") {
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
        Text(
            "让手机成为电脑上 ZCode 的遥控器",
            fontSize = 14.sp, color = Z.Text2,
        )
        Spacer(Modifier.height(36.dp))
        FieldLabel("SERVER")
        OutlinedTextField(
            value = url, onValueChange = { url = it },
            modifier = Modifier.fillMaxWidth(), singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = Z.Mono, color = Z.Text),
            placeholder = { Text("http://10.0.2.2:8787", fontFamily = Z.Mono, color = Z.Text3, fontSize = 14.sp) },
            colors = fieldColors(),
        )
        Spacer(Modifier.height(16.dp))
        FieldLabel("TOKEN")
        OutlinedTextField(
            value = token, onValueChange = { token = it },
            modifier = Modifier.fillMaxWidth(), singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = Z.Mono, color = Z.Text, fontSize = 13.sp),
            placeholder = { Text("server/data/tokens.json → phoneToken", fontFamily = Z.Mono, color = Z.Text3, fontSize = 12.sp) },
            colors = fieldColors(),
        )
        Spacer(Modifier.height(28.dp))
        Button(
            onClick = {
                busy = true; msg = "连接中…"
                Repo.save(url, token) { ok, m -> busy = false; msg = m }
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
private fun FieldLabel(text: String) {
    Text(text, fontSize = 10.sp, fontFamily = Z.Mono, color = Z.Text3, letterSpacing = 1.5.sp)
    Spacer(Modifier.height(6.dp))
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

@Composable
fun LogoBadge(sizeDp: androidx.compose.ui.unit.Dp) {
    Box(
        Modifier.size(sizeDp).background(Z.AccentDim, RoundedCornerShape(sizeDp / 4)),
        contentAlignment = Alignment.Center,
    ) {
        Text(">_", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, fontFamily = Z.Mono)
    }
}

// ---------- 任务主页 ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen() {
    val tasks by Repo.tasks.collectAsState()
    val connected by Repo.connected.collectAsState()
    val pcOnline by Repo.pcOnline.collectAsState()
    val perm by Repo.pendingPerm.collectAsState()
    var input by remember { mutableStateOf("") }
    var workspace by remember { mutableStateOf("") }
    var showWs by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var expanded by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { Repo.refresh() }

    if (showSettings) {
        SettingsScreen(initialUrl = Repo.serverUrl, initialToken = Repo.phoneToken)
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
                    TextButton(onClick = { Repo.refresh() }) { Text("刷新", color = Z.Text2, fontSize = 13.sp) }
                    TextButton(onClick = { showSettings = true }) { Text("⚙", color = Z.Text2, fontSize = 16.sp) }
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
                        placeholder = { Text("给电脑上的 ZCode 布置任务…", color = Z.Text3, fontSize = 14.sp) },
                        minLines = 1, maxLines = 4,
                        shape = RoundedCornerShape(14.dp),
                        textStyle = MaterialTheme.typography.bodyMedium.copy(color = Z.Text),
                        colors = fieldColors(),
                    )
                    Spacer(Modifier.width(10.dp))
                    FilledIconButton(
                        onClick = {
                            if (input.isNotBlank()) {
                                Repo.sendTask(input, workspace.ifBlank { null })
                                input = ""; showWs = false
                            }
                        },
                        enabled = connected && input.isNotBlank(),
                        modifier = Modifier.size(52.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = Z.AccentDim, contentColor = Color.White,
                            disabledContainerColor = Z.Card, disabledContentColor = Z.Text3,
                        ),
                    ) { Text("↑", fontSize = 20.sp, fontWeight = FontWeight.Bold) }
                }
                AnimatedVisibility(visible = showWs) {
                    Column {
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = workspace,
                            onValueChange = { workspace = it },
                            modifier = Modifier.fillMaxWidth(), singleLine = true,
                            placeholder = { Text("工作区路径，如 D:/demo（留空 = 默认）", fontFamily = Z.Mono, color = Z.Text3, fontSize = 12.sp) },
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = Z.Mono, color = Z.Text, fontSize = 13.sp),
                            shape = RoundedCornerShape(10.dp),
                            colors = fieldColors(),
                        )
                    }
                }
                Row(Modifier.padding(top = 4.dp)) {
                    TextButton(onClick = { showWs = !showWs }, enabled = !showWs) {
                        Text(if (showWs) "工作区已指定" else "+ 指定工作区", fontSize = 11.sp, fontFamily = Z.Mono, color = if (showWs) Z.Accent else Z.Text3)
                    }
                }
            }
        },
    ) { pad ->
        if (tasks.isEmpty()) {
            Column(
                Modifier.padding(pad).fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                LogoBadge(52.dp)
                Spacer(Modifier.height(18.dp))
                Text("还没有任务", color = Z.Text, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(6.dp))
                Text(
                    "在下方输入第一条指令\nZCode 会在电脑上替你执行",
                    color = Z.Text3, fontSize = 12.sp, lineHeight = 18.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        } else {
            LazyColumn(
                Modifier.padding(pad).fillMaxSize().background(Z.Bg).padding(horizontal = 14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(tasks, key = { it.id }) { t ->
                    TaskCard(
                        task = t,
                        expanded = expanded == t.id,
                        onClick = { expanded = if (expanded == t.id) null else t.id },
                    )
                }
                item { Spacer(Modifier.height(8.dp)) }
            }
        }
    }

    perm?.let { p -> PermDialog(p) }
}

@Composable
fun StatusDot(ok: Boolean, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).background(if (ok) Z.Accent else Z.Text3, CircleShape))
        Spacer(Modifier.width(4.dp))
        Text(label, fontSize = 11.sp, color = Z.Text2)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskCard(task: Task, expanded: Boolean, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().animateContentSize(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Z.Card),
        border = BorderStroke(1.dp, Z.Border),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatePill(task.state)
                Spacer(Modifier.weight(1f))
                Text(
                    task.createdAt.take(19).replace('T', ' '),
                    fontSize = 10.sp, fontFamily = Z.Mono, color = Z.Text3,
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(task.text, fontSize = 15.sp, color = Z.Text, lineHeight = 21.sp)
            task.workspace?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    "⌂ $it", fontSize = 11.sp, fontFamily = Z.Mono,
                    color = Z.Text2,
                    modifier = Modifier.background(Z.Inset, RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
            task.result?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, fontSize = 12.5.sp, color = Z.Text2, lineHeight = 18.sp)
            }
            if (expanded && task.outputTail.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Column(
                    Modifier.fillMaxWidth().background(Z.Inset, RoundedCornerShape(8.dp)).padding(10.dp),
                ) {
                    task.outputTail.takeLast(24).forEach { line ->
                        Text(line, fontSize = 10.5.sp, lineHeight = 15.sp, fontFamily = Z.Mono, color = Color(0xFF8FA3B8))
                    }
                }
            }
        }
    }
}

@Composable
fun StatePill(state: String) {
    val (label, color) = when (state) {
        "queued" -> "待执行" to Z.Queued
        "running" -> "执行中" to Z.Running
        "done" -> "完成" to Z.Accent
        "failed" -> "失败" to Z.Failed
        "cancel_requested" -> "取消中" to Z.Warn
        else -> state to Z.Queued
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.background(color.copy(alpha = 0.13f), RoundedCornerShape(7.dp)).padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Box(Modifier.size(5.dp).background(color, CircleShape))
        Spacer(Modifier.width(5.dp))
        Text(label, fontSize = 11.sp, color = color, fontWeight = FontWeight.Medium)
    }
}

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
