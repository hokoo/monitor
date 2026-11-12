$ErrorActionPreference = 'Stop'
$repo = '\\wsl.localhost\Ubuntu-20.04\home\itron\reps\monitor'
$source = Join-Path $repo 'dist\resource-monitor-win32-x64'
$install = Join-Path $env:LOCALAPPDATA 'Resource Monitor\Portable 0.1.0'
$script = Join-Path $env:TEMP "monitor-w6-native-$PID.mjs"
if (-not (Test-Path -LiteralPath $install)) { throw "Portable install missing: $install" }
foreach($file in @('Resource Monitor.exe','artifact.json','resources\app\desktop\main.cjs')) {
  $expected=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $source $file)).Hash
  $actual=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $install $file)).Hash
  if($actual -ne $expected) { throw "Installed artifact differs from source: $file" }
}
$name = 'org.local.resource-monitor.widget'
$runKey = 'Software\Microsoft\Windows\CurrentVersion\Run'
$approvedKey = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
function Snapshot-Value($relative) {
  $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($relative)
  if(-not $key) { return @{Exists=$false} }
  try {
    if($key.GetValueNames() -notcontains $name) { return @{Exists=$false} }
    return @{Exists=$true;Kind=$key.GetValueKind($name);Value=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}
  } finally { $key.Close() }
}
function Restore-Value($relative,$before) {
  $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($relative,$true)
  if($before.Exists) {
    if(-not $key) { $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($relative) }
    try { $key.SetValue($name,$before.Value,$before.Kind) } finally { $key.Close() }
  } elseif($key) {
    try { $key.DeleteValue($name,$false) } finally { $key.Close() }
  }
}
$beforeRun=Snapshot-Value $runKey
$beforeApproved=Snapshot-Value $approvedKey
Copy-Item -LiteralPath (Join-Path $repo 'test\widget-portable-native.mjs') -Destination $script
try {
  & node.exe $script $repo $install
  $status = $LASTEXITCODE
} finally {
  Restore-Value $runKey $beforeRun
  Restore-Value $approvedKey $beforeApproved
  Remove-Item -LiteralPath $script -Force
}
if ($status -ne 0) { throw "Native portable smoke failed with exit $status; install=$install" }
Write-Host "Portable install verified: $install; own startup values restored"
