# UIA 唤醒：给 ZCode Desktop 当前会话的输入框注入唤醒消息并发送
# 前提：Desktop 以 --force-renderer-accessibility 启动（UIA 可见网页内容树）
# 由桥接进程在收到新任务时调用（幂等，失败静默）
param([string]$text = "请调用 remote_check_inbox 处理远程任务队列中的待办任务，完成后逐一汇报结果。")
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName System.Windows.Forms

  $proc = Get-Process ZCode | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $proc) { exit 1 }

  $root = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
  $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
  $target = $null
  foreach ($e in $edits) {
    if ($e.Current.Name -like "*ZCode*") { $target = $e; break }
  }
  if (-not $target) { exit 1 }

  # 剪贴板写入 + 粘贴（比 SetValue 对富文本编辑器更可靠）
  [System.Windows.Forms.Clipboard]::SetText($text)
  $target.SetFocus()
  Start-Sleep -Milliseconds 400
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds 500
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  exit 0
} catch {
  exit 1
}
