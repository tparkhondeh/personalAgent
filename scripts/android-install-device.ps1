param(
    [ValidateRange(1, 65535)]
    [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$apk = Join-Path $repoRoot 'android\app\build\outputs\apk\debug\app-debug.apk'

if (-not (Test-Path -LiteralPath $adb)) {
    throw 'Android platform-tools were not found.'
}

try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/api/health" -TimeoutSec 10
    if ($health.StatusCode -ne 200) { throw 'Unexpected health response.' }
}
catch {
    throw "Personal Agent is not available on localhost:$Port. Start the local app before installing."
}

& $adb start-server | Out-Null
$deviceRows = & $adb devices
$authorized = @($deviceRows | Where-Object { $_ -match '^([^\s]+)\s+device$' } | ForEach-Object { $matches[1] })
$unauthorized = @($deviceRows | Where-Object { $_ -match '^([^\s]+)\s+unauthorized$' } | ForEach-Object { $matches[1] })

if ($unauthorized.Count) {
    throw 'Unlock the phone and approve the Allow USB debugging prompt, then run this command again.'
}
if ($authorized.Count -eq 0) {
    throw 'No authorized Android phone was found over USB.'
}
if ($authorized.Count -gt 1) {
    throw 'More than one Android device is connected. Keep only the test phone connected.'
}

$serial = $authorized[0]
& $adb -s $serial reverse "tcp:$Port" "tcp:$Port"
if ($LASTEXITCODE -ne 0) { throw 'ADB reverse port setup failed.' }

& (Join-Path $PSScriptRoot 'android-build.ps1') -ServerUrl "http://localhost:$Port"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $adb -s $serial install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'APK installation failed.' }

& $adb -s $serial shell am start -n 'ir.wealthos.personalagent/.MainActivity'
if ($LASTEXITCODE -ne 0) { throw 'The app was installed, but it could not be opened automatically.' }

Write-Output "Personal Agent was installed and opened on Android device $serial."
