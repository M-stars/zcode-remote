# UIA 唤醒 v3（自包含）：poke 无障碍 → 前置窗口 → 粘贴唤醒文本 → 回车
# 屏幕锁定/无法前置时静默退出（任务保留在队列，解锁后重试或手动触发）
param([string]$text = "", [string]$textFile = "")
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName System.Windows.Forms

  $sig = @'
[DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr lp);
public delegate bool EnumProc(IntPtr hWnd, IntPtr lp);
[DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder sb, int max);
[DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
'@
  Add-Type -MemberDefinition $sig -Name U7 -Namespace W7

  if ($textFile -and (Test-Path $textFile)) {
    $text = [System.IO.File]::ReadAllText($textFile, [System.Text.Encoding]::UTF8)
  }
  if (-not $text -or $text.Length -lt 2) { exit 1 }

  $proc = Get-Process ZCode | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $proc) { Write-Output "NO_WINDOW"; exit 1 }
  $main = $proc.MainWindowHandle

  # 1) poke 渲染窗口激活无障碍
  $found = New-Object System.Collections.ArrayList
  $cb = [W7.U7+EnumProc]{ param($h, $lp)
    $sb = New-Object System.Text.StringBuilder 256
    [void][W7.U7]::GetClassName($h, $sb, 256)
    [void]$found.Add(@($h, $sb.ToString()))
    return $true
  }
  [W7.U7]::EnumChildWindows($main, $cb, [IntPtr]::Zero) | Out-Null
  foreach ($f in $found) {
    if ($f[1] -match 'Chrome_RenderWidget|Chrome_WidgetWin|Intermediate') {
      $res = [IntPtr]::Zero
      [W7.U7]::SendMessageTimeout($f[0], 0x003D, [IntPtr]::Zero, [IntPtr](-4), 2, 400, [ref]$res) | Out-Null
    }
  }
  Start-Sleep -Milliseconds 1200

  # 2) UIA 找输入框（验证树可用）
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($main)
  $editCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
  $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCond)
  if ($edits.Count -eq 0) { Write-Output "NO_EDIT_LOCKED"; exit 1 }
  $target = $null
  foreach ($e in $edits) { $target = $e; break }

  # 3) 前置 + 焦点 + 粘贴 + 回车
  [W7.U7]::SetForegroundWindow($main) | Out-Null
  Start-Sleep -Milliseconds 500
  $fg = [W7.U7]::GetForegroundWindow()
  if ($fg -ne $main) { Write-Output "FOREGROUND_FAILED"; exit 1 }
  [System.Windows.Forms.Clipboard]::SetText($text)
  $target.SetFocus()
  Start-Sleep -Milliseconds 500
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds 600
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Write-Output "WAKE_SENT"
  exit 0
} catch {
  Write-Output ("EXC: " + $_.Exception.Message)
  exit 1
}
