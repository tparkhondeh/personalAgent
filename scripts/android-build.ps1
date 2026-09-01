param(
    [string]$ServerUrl = 'http://10.0.2.2:3001'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$jdkRoot = Join-Path $env:LOCALAPPDATA 'PersonalAgentTools\jdk-21'
$portableGradle = Join-Path $env:LOCALAPPDATA 'PersonalAgentTools\gradle-8.14.5\bin\gradle.bat'

$javaHome = Get-ChildItem -LiteralPath $jdkRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $javaHome) {
    throw "JDK 21 was not found under $jdkRoot"
}

if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot 'platforms\android-36'))) {
    throw "Android SDK 36 was not found under $sdkRoot"
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeBin = if ($nodeCommand) {
    Split-Path $nodeCommand.Source -Parent
}
else {
    $pnpmCommand = Get-Command pnpm.cmd -ErrorAction Stop
    $bundledNodeBin = Join-Path (Split-Path $pnpmCommand.Source -Parent) '..\..\node\bin'
    (Resolve-Path $bundledNodeBin).Path
}

$env:Path = "$nodeBin;$javaHome\bin;$sdkRoot\cmdline-tools\latest\bin;$sdkRoot\platform-tools;$env:Path"

Push-Location $repoRoot
try {
    & node.exe scripts/generate-android-assets.mjs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $env:CAPACITOR_SERVER_URL = $ServerUrl
    & pnpm.cmd android:sync
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $gradleCommand = if (Test-Path -LiteralPath $portableGradle) {
        $portableGradle
    }
    else {
        Join-Path $repoRoot 'android\gradlew.bat'
    }

    & $gradleCommand -p (Join-Path $repoRoot 'android') --no-daemon assembleDebug
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
