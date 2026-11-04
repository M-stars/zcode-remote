Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$proc = Get-Process ZCode | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Output "NO_WINDOW"; exit 1 }
Write-Output ("WINDOW PID=" + $proc.Id + " TITLE=" + $proc.MainWindowTitle)

$root = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
Write-Output ("ROOT: " + $root.Current.Name + " | " + $root.Current.ClassName)
Write-Output ("RECT: " + $root.Current.BoundingRectangle.ToString())

function Walk([System.Windows.Automation.AutomationElement]$el, [int]$depth) {
  if ($depth -gt 6) { return }
  try {
    $name = $el.Current.Name
    $cls = $el.Current.ClassName
    $type = $el.Current.ControlType.ProgrammaticName -replace 'ControlType.', ''
    $r = $el.Current.BoundingRectangle
    if ($name -and $name.Length -gt 0) {
      $n = if ($name.Length -gt 40) { $name.Substring(0, 40) } else { $name }
      $pad = ' ' * (2 * $depth)
      Write-Output ($pad + "[$type|$cls] '$n' @(" + [int]$r.X + "," + [int]$r.Y + " " + [int]$r.Width + "x" + [int]$r.Height + ")")
    }
    $kids = $el.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($k in $kids) { Walk $k ($depth + 1) }
  } catch {
    return
  }
}

Walk $root 0
Write-Output "DONE"
