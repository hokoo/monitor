$ErrorActionPreference = 'Stop'
$source = '\\wsl.localhost\Ubuntu-20.04\home\itron\reps\monitor\test\widget-recovery-native.mjs'
$script = Join-Path $env:TEMP "monitor-w5-native-$PID.mjs"
Copy-Item -LiteralPath $source -Destination $script
try {
  & node.exe $script '\\wsl.localhost\Ubuntu-20.04\home\itron\reps\monitor' 'C:\Users\iTRON\AppData\Local\Temp\monitor-w3-smoke-46364\node_modules\electron\dist\electron.exe'
  $status = $LASTEXITCODE
} finally {
  Remove-Item -LiteralPath $script -Force
}
exit $status
