# Run on Windows while `ITRON_AI_RESOURCE_MONITOR_WIDGET_PORT=18765 node test/widget-fixture.mjs` runs in WSL.
# Uses a private temporary app copy and profile. PrepareOnly installs the runtime once.
param([int]$Port = 18765, [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent), [string]$PreparedWork, [switch]$PrepareOnly, [switch]$WaitForCdp, [ValidateSet('en','ru')][string]$Locale='en')
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid port' }
$work = if($PreparedWork) { $PreparedWork } else { Join-Path $env:TEMP ("monitor-w3-smoke-$PID") }
if(-not $PreparedWork) {
  New-Item -ItemType Directory -Path $work | Out-Null
  Copy-Item (Join-Path $RepoRoot 'package.json'), (Join-Path $RepoRoot 'package-lock.json') -Destination $work
  Copy-Item (Join-Path $RepoRoot 'desktop') -Destination $work -Recurse
  Copy-Item (Join-Path $RepoRoot 'test\widget-cdp-check.mjs') -Destination $work
  $npmCache = Join-Path $work 'npm-cache'
  Push-Location $work
  try {
    & npm.cmd ci --cache $npmCache --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed: $LASTEXITCODE" }
    & node.exe node_modules\electron\install.js
    if ($LASTEXITCODE -ne 0) { throw "Electron binary install failed: $LASTEXITCODE" }
  } finally { Pop-Location }
}
if(-not (Test-Path (Join-Path $work 'node_modules\electron\dist\electron.exe'))) { throw "Prepared Windows Electron missing: $work" }
if($PrepareOnly) { Write-Output "prepared_work=$work"; exit 0 }
$env:ITRON_AI_RESOURCE_MONITOR_WIDGET_PORT = "$Port"
$env:MONITOR_WIDGET_USER_DATA = Join-Path $work "profile-$Locale"
$menuLabels=if($Locale -eq 'ru'){@{show='Показать';hide='Скрыть';top='Поверх окон';refresh='Обновить';exit='Выход'}}else{@{show='Show';hide='Hide';top='Always on top';refresh='Refresh';exit='Exit'}}
$state = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/api/state"
if ($state.StatusCode -ne 200) { throw 'Synthetic server unavailable' }
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WidgetWin32 {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  delegate bool WindowCallback(IntPtr hwnd, IntPtr value);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr value);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int capacity);
  public static IntPtr FindWidgetWindow(uint expectedPid) {
    IntPtr found=IntPtr.Zero;
    EnumWindows((hwnd,value)=>{
      uint pid;GetWindowThreadProcessId(hwnd,out pid);
      if(pid==expectedPid && IsWindowVisible(hwnd)) {
        var cls=new StringBuilder(128);GetClassName(hwnd,cls,cls.Capacity);
        if(cls.ToString()=="Chrome_WidgetWin_1") {found=hwnd;return false;}
      }
      return true;
    },IntPtr.Zero);
    return found;
  }
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
'@
$oldCursor = New-Object WidgetWin32+POINT
[void][WidgetWin32]::GetCursorPos([ref]$oldCursor)
function MouseAt([int]$x, [int]$y, [uint32]$down, [uint32]$up) {
  [void][WidgetWin32]::SetCursorPos($x,$y)
  Start-Sleep -Milliseconds 60
  [WidgetWin32]::mouse_event($down,0,0,0,[UIntPtr]::Zero)
  [WidgetWin32]::mouse_event($up,0,0,0,[UIntPtr]::Zero)
}
function DragAt([int]$x, [int]$y) {
  [void][WidgetWin32]::SetCursorPos($x,$y)
  Start-Sleep -Milliseconds 60
  [WidgetWin32]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  for($step=1;$step -le 8;$step++) { [void][WidgetWin32]::SetCursorPos(($x+$step*5),$y); Start-Sleep -Milliseconds 30 }
  [WidgetWin32]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 200
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
function Find-TrayIcon {
  foreach($class in @('Shell_TrayWnd','NotifyIconOverflowWindow')) {
    $handle=[WidgetWin32]::FindWindow($class,$null)
    if($handle -eq [IntPtr]::Zero) { continue }
    $root=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
    $items=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    foreach($item in $items) {
      try { if($item.Current.Name -eq 'Resource Monitor' -and -not $item.Current.BoundingRectangle.IsEmpty) { return $item } } catch {}
    }
  }
  return $null
}
function Invoke-Tray([string]$name) {
  $icon=Find-TrayIcon
  if(-not $icon) {
    $tray=[System.Windows.Automation.AutomationElement]::FromHandle([WidgetWin32]::FindWindow('Shell_TrayWnd',$null))
    $items=$tray.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    foreach($item in $items) {
      try {if($item.Current.Name -match 'Show hidden icons|Показать скрытые значки|Отображать скрытые значки') { $r=$item.Current.BoundingRectangle; MouseAt ([int]($r.Left+$r.Width/2)) ([int]($r.Top+$r.Height/2)) 2 4; break }} catch {}
    }
    Start-Sleep -Milliseconds 300
    $icon=Find-TrayIcon
  }
  if(-not $icon) { throw "Resource Monitor tray icon unavailable in Windows UI Automation; work=$work" }
  $r=$icon.Current.BoundingRectangle
  MouseAt ([int]($r.Left+$r.Width/2)) ([int]($r.Top+$r.Height/2)) 8 16
  Start-Sleep -Milliseconds 250
  $popupHandle=[WidgetWin32]::FindWindow('#32768',$null)
  if($popupHandle -eq [IntPtr]::Zero) { throw "Tray context menu unavailable; work=$work" }
  $popup=[System.Windows.Automation.AutomationElement]::FromHandle($popupHandle)
  $menuItems=$popup.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
  $names=@($menuItems | ForEach-Object { try { $_.Current.Name } catch { '' } })
  if(-not ($names -contains $menuLabels.top -and $names -contains $menuLabels.refresh -and $names -contains $menuLabels.exit)) { throw "Popup is not the widget tray menu; work=$work" }
  $target=@($menuItems | Where-Object { try { $_.Current.Name -eq $name } catch { $false } }) | Select-Object -First 1
  if(-not $target) { throw "Tray item $name unavailable; work=$work" }
  $r=$target.Current.BoundingRectangle
  MouseAt ([int]($r.Left+$r.Width/2)) ([int]($r.Top+$r.Height/2)) 2 4
  Start-Sleep -Milliseconds 300
}
$exe = Join-Path $work 'node_modules\electron\dist\electron.exe'
$first = Start-Process -FilePath $exe -ArgumentList ('--remote-debugging-port=18767 "{0}"' -f $work) -PassThru
$second=$null
$third=$null
try {
$window = [IntPtr]::Zero
for ($i=0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 250
  $window = [WidgetWin32]::FindWidgetWindow([uint32]$first.Id)
  if ($window -ne [IntPtr]::Zero) { break }
}
if ($window -eq [IntPtr]::Zero) { throw "Widget window not found; work=$work pid=$($first.Id)" }
$windowPid=[uint32]0
[void][WidgetWin32]::GetWindowThreadProcessId($window,[ref]$windowPid)
if($windowPid -ne $first.Id) { throw "Found widget title belongs to a different process: $windowPid" }
& node.exe (Join-Path $work 'widget-cdp-check.mjs') --ready-only
if($LASTEXITCODE -ne 0) { throw "Widget renderer/drag strip did not become ready: $LASTEXITCODE" }
$exStyle = [WidgetWin32]::GetWindowLong($window, -20)
$outer=New-Object WidgetWin32+RECT
$client=New-Object WidgetWin32+RECT
$origin=New-Object WidgetWin32+POINT
if(-not [WidgetWin32]::GetWindowRect($window,[ref]$outer) -or -not [WidgetWin32]::GetClientRect($window,[ref]$client) -or -not [WidgetWin32]::ClientToScreen($window,[ref]$origin)) { throw 'Could not measure widget client geometry' }
$sideInset=$origin.X-$outer.Left
$topInset=$origin.Y-$outer.Top
if(($client.Right-$client.Left) -le 0 -or ($client.Bottom-$client.Top) -le 0 -or ($topInset-$sideInset) -gt 12) { throw "Visible native title bar suspected: topInset=$topInset sideInset=$sideInset" }
if([WidgetWin32]::GetMenu($window) -ne [IntPtr]::Zero) { throw 'Native application menu present' }
$capturePath=Join-Path $work "widget-$Locale.png"
try {
  Add-Type -AssemblyName System.Drawing
  $bitmap=[System.Drawing.Bitmap]::new([int]($outer.Right-$outer.Left),[int]($outer.Bottom-$outer.Top))
  $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  $hdc=$graphics.GetHdc()
  try { $captured=[WidgetWin32]::PrintWindow($window,$hdc,2) } finally { $graphics.ReleaseHdc($hdc);$graphics.Dispose() }
  if($captured) { $bitmap.Save($capturePath,[System.Drawing.Imaging.ImageFormat]::Png) }
  $bitmap.Dispose()
} catch { Write-Host "Widget-only PrintWindow capture unavailable: $($_.Exception.Message)" }
if (($exStyle -band 0x8) -ne 0) { throw 'Always-on-top unexpectedly enabled' }
if (-not [WidgetWin32]::IsWindowVisible($window)) { throw 'Initial window is hidden' }
if($WaitForCdp) { Read-Host 'Run node test/widget-cdp-check.mjs now, then press Enter' | Out-Null }
[void][WidgetWin32]::SendMessage($window, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)
Start-Sleep -Milliseconds 500
if ([WidgetWin32]::IsWindowVisible($window)) { throw 'Close did not hide window' }
$second = Start-Process -FilePath $exe -ArgumentList ('"{0}"' -f $work) -PassThru
for ($i=0; $i -lt 40 -and -not [WidgetWin32]::IsWindowVisible($window); $i++) { Start-Sleep -Milliseconds 250 }
if (-not [WidgetWin32]::IsWindowVisible($window)) { throw 'Second launch did not restore the original window' }
Start-Sleep -Milliseconds 500
if (-not $second.HasExited) { throw 'Second instance remained running' }
$beforeRect=New-Object WidgetWin32+RECT
[void][WidgetWin32]::GetWindowRect($window,[ref]$beforeRect)
DragAt ($beforeRect.Left+250) ($beforeRect.Top+8)
$afterRect=New-Object WidgetWin32+RECT
[void][WidgetWin32]::GetWindowRect($window,[ref]$afterRect)
if(($afterRect.Left-$beforeRect.Left) -lt 25) { throw "Native drag strip did not move widget; work=$work" }
DragAt ($afterRect.Left+100) ($afterRect.Top+100)
$tableRect=New-Object WidgetWin32+RECT
[void][WidgetWin32]::GetWindowRect($window,[ref]$tableRect)
if($tableRect.Left -ne $afterRect.Left) { throw "Table area unexpectedly dragged widget; work=$work" }
Invoke-Tray $menuLabels.hide
if([WidgetWin32]::IsWindowVisible($window)) { throw 'Tray Hide did not hide widget' }
Invoke-Tray $menuLabels.show
if(-not [WidgetWin32]::IsWindowVisible($window)) { throw 'Tray Show did not restore widget' }
Invoke-Tray $menuLabels.top
$exStyle=[WidgetWin32]::GetWindowLong($window,-20)
if(($exStyle -band 0x8) -eq 0) { throw 'Tray topmost toggle did not set native topmost state' }
$settings=Get-Content -Raw (Join-Path $env:MONITOR_WIDGET_USER_DATA 'widget.json') | ConvertFrom-Json
if($settings.alwaysOnTop -ne $true) { throw 'Topmost preference was not persisted' }
$beforeRefresh=[int](Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$($Port+1)/refreshes").Content
Invoke-Tray $menuLabels.refresh
Start-Sleep -Milliseconds 500
$afterRefresh=[int](Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$($Port+1)/refreshes").Content
if($afterRefresh -le $beforeRefresh) { throw 'Tray Refresh did not reach existing POST /api/refresh' }
Invoke-Tray $menuLabels.exit
if(-not $first.WaitForExit(5000)) { throw 'Tray Exit did not end first process' }
$third=Start-Process -FilePath $exe -ArgumentList ('"{0}"' -f $work) -PassThru
$window=[IntPtr]::Zero
for($i=0;$i -lt 60;$i++) { Start-Sleep -Milliseconds 250; $window=[WidgetWin32]::FindWidgetWindow([uint32]$third.Id); if($window -ne [IntPtr]::Zero) { break } }
if($window -eq [IntPtr]::Zero -or ([WidgetWin32]::GetWindowLong($window,-20) -band 0x8) -eq 0) { throw 'Topmost state not restored after restart' }
$windowPid=[uint32]0
[void][WidgetWin32]::GetWindowThreadProcessId($window,[ref]$windowPid)
if($windowPid -ne $third.Id) { throw "Restarted widget title belongs to a different process: $windowPid" }
Invoke-Tray $menuLabels.exit
if(-not $third.WaitForExit(5000)) { throw 'Tray Exit did not end restarted process' }
$result = [ordered]@{work=$work;firstPid=$first.Id;secondExitCode=$second.ExitCode;port=$Port;frameAbsent=$true;nativeMenuAbsent=$true;topInset=$topInset;sideInset=$sideInset;widgetCapture=$(if(Test-Path $capturePath){$capturePath}else{$null});initialTopmostOff=$true;closeHides=$true;secondLaunchRestores=$true;nativeDrag=$true;tableClickDoesNotDrag=$true;trayHideShow=$true;trayTopmostAndPersistence=$true;trayRefreshPostsDelta=($afterRefresh-$beforeRefresh);trayExit=$true}
$result | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $work 'smoke.json')
$result | ConvertTo-Json
Write-Host "Native Windows smoke passed; artifacts: $work"
} finally {
  [void][WidgetWin32]::SetCursorPos($oldCursor.X,$oldCursor.Y)
  foreach($owned in @($first,$second,$third)) {
    if($owned -and -not $owned.HasExited) {
      $actual=Get-CimInstance Win32_Process -Filter "ProcessId=$($owned.Id)" -ErrorAction SilentlyContinue
      if($actual -and $actual.ExecutablePath -eq $exe) {
        Stop-Process -Id $owned.Id -Force
        [void]$owned.WaitForExit(5000)
        Write-Host "Stopped smoke-owned Electron PID=$($owned.Id)"
      }
    }
  }
  Write-Host "Smoke-owned first PID=$($first.Id), work=$work"
}
