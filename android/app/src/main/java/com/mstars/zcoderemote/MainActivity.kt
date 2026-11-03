package com.mstars.zcoderemote

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.collectLatest

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Repo.init(applicationContext)
        setContent { App() }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App() {
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(Unit) {
        Repo.toast.collectLatest { msg ->
            msg?.let { snackbar.showSnackbar(it); Repo.toast.value = null }
        }
    }
    MaterialTheme {
        Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { pad ->
            Column(Modifier.padding(pad)) {
                if (Repo.configured) TasksScreen() else SettingsScreen()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(initialUrl: String = "http://10.0.2.2:8787", initialToken: String = "") {
    var url by remember { mutableStateOf(initialUrl) }
    var token by remember { mutableStateOf(initialToken) }
    var msg by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("ZCode Remote", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text("连接你的中转服务器", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("服务器地址") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(value = token, onValueChange = { token = it }, label = { Text("手机 Token（server/data/tokens.json 的 phoneToken）") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        Spacer(Modifier.height(16.dp))
        Button(onClick = {
            msg = "连接中…"
            Repo.save(url, token) { ok, m -> msg = m }
        }, modifier = Modifier.fillMaxWidth()) { Text("保存并连接") }
        msg?.let { Spacer(Modifier.height(12.dp)); Text(it, fontSize = 13.sp) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen() {
    val tasks by Repo.tasks.collectAsState()
    val connected by Repo.connected.collectAsState()
    val pcOnline by Repo.pcOnline.collectAsState()
    val perm by Repo.pendingPerm.collectAsState()
    var input by remember { mutableStateOf("") }
    var workspace by remember { mutableStateOf("") }
    var showSettings by remember { mutableStateOf(false) }
    var expanded by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { Repo.refresh() }

    if (showSettings) {
        SettingsScreen(initialUrl = Repo.serverUrl, initialToken = Repo.phoneToken)
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("ZCode Remote", fontSize = 18.sp)
                        Spacer(Modifier.width(10.dp))
                        Badge(connected = connected, text = if (connected) "服务器已连" else "未连接")
                        Spacer(Modifier.width(6.dp))
                        Badge(connected = pcOnline, text = if (pcOnline) "PC 在线" else "PC 离线")
                    }
                },
                actions = {
                    TextButton(onClick = { Repo.refresh() }) { Text("刷新") }
                    IconButton(onClick = { showSettings = true }) {
                        Text("⚙", fontSize = 18.sp)
                    }
                },
            )
        },
        bottomBar = {
            Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(12.dp)) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("给电脑上的 ZCode 布置任务…") },
                    minLines = 1, maxLines = 4,
                )
                Spacer(Modifier.height(8.dp))
                Row {
                    OutlinedTextField(
                        value = workspace,
                        onValueChange = { workspace = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("工作区（可选，如 D:/demo）") },
                        singleLine = true,
                    )
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = {
                            if (input.isNotBlank()) {
                                Repo.sendTask(input, workspace.ifBlank { null })
                                input = ""
                            }
                        },
                        enabled = connected && input.isNotBlank(),
                    ) { Text("发送") }
                }
            }
        },
    ) { pad ->
        if (tasks.isEmpty()) {
            Column(Modifier.padding(pad).fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("还没有任务", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("在下方输入框给 PC 端 ZCode 下发第一条任务", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(Modifier.padding(pad).fillMaxSize(), modifier = Modifier.padding(horizontal = 12.dp)) {
                items(tasks, key = { it.id }) { t ->
                    Card(Modifier.fillMaxWidth().padding(vertical = 5.dp), onClick = { expanded = if (expanded == t.id) null else t.id }) {
                        Column(Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                StateChip(t.state)
                                Spacer(Modifier.weight(1f))
                                Text(t.createdAt.take(19).replace('T', ' '), fontSize = 11.sp, color = Color.Gray)
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(t.text, fontSize = 14.sp)
                            t.workspace?.let {
                                Spacer(Modifier.height(4.dp))
                                Text("工作区: $it", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            t.result?.let {
                                Spacer(Modifier.height(6.dp))
                                Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (expanded == t.id && t.outputTail.isNotEmpty()) {
                                Spacer(Modifier.height(6.dp))
                                Column(
                                    Modifier.fillMaxWidth().background(Color(0xFFF2F2F2), RoundedCornerShape(6.dp)).padding(8.dp)
                                ) {
                                    t.outputTail.takeLast(20).forEach { line ->
                                        Text(line, fontSize = 11.sp, lineHeight = 15.sp, color = Color(0xFF444444))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    perm?.let { p ->
        AlertDialog(
            onDismissRequest = {},
            title = { Text("远程批准请求") },
            text = { Text("ZCode 请求执行敏感操作：\n\n工具: ${p.tool}\n内容: ${p.summary}\n\n允许执行吗？") },
            confirmButton = { Button(onClick = { Repo.decide(p, true) }) { Text("允许") } },
            dismissButton = { OutlinedButton(onClick = { Repo.decide(p, false) }) { Text("拒绝") } },
        )
    }
}

@Composable
fun Badge(connected: Boolean, text: String) {
    val bg = if (connected) Color(0xFF34A853) else Color(0xFFB9B9B9)
    Text(
        text, fontSize = 10.sp, color = Color.White,
        modifier = Modifier.background(bg, RoundedCornerShape(8.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
fun StateChip(state: String) {
    val (label, color) = when (state) {
        "queued" -> "待执行" to Color(0xFF8A8A8A)
        "running" -> "执行中" to Color(0xFF1A73E8)
        "done" -> "完成" to Color(0xFF34A853)
        "failed" -> "失败" to Color(0xFFD93025)
        "cancel_requested" -> "取消中" to Color(0xFFE8710A)
        else -> state to Color.Gray
    }
    Text(
        label, fontSize = 11.sp, color = Color.White,
        modifier = Modifier.background(color, RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}
