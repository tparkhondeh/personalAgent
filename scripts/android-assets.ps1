$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) {
    $nodeCommand.Source
}
else {
    $pnpmCommand = Get-Command pnpm.cmd -ErrorAction Stop
    $bundledNode = Join-Path (Split-Path $pnpmCommand.Source -Parent) '..\..\node\bin\node.exe'
    (Resolve-Path $bundledNode).Path
}

& $nodeExecutable (Join-Path $repoRoot 'scripts\generate-android-assets.mjs')
exit $LASTEXITCODE
