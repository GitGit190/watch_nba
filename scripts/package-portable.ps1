$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$binary = Join-Path $projectRoot 'src-tauri/target/release/nba-watch.exe'
$library = Join-Path $projectRoot 'src-tauri/resources/libmpv-2.dll'
if (-not (Test-Path -LiteralPath $binary) -or -not (Test-Path -LiteralPath $library)) { throw 'Build the release and restore libmpv before packaging.' }
$destination = Join-Path $projectRoot 'artifacts/Courtside'
New-Item -ItemType Directory -Path (Join-Path $destination 'resources') -Force | Out-Null
Copy-Item -LiteralPath $binary -Destination (Join-Path $destination 'Courtside.exe') -Force
Copy-Item -LiteralPath $library -Destination (Join-Path $destination 'resources/libmpv-2.dll') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md') -Destination $destination -Force
'Open Courtside.exe. Keep the resources folder beside it. This build needs Windows x64 and WebView2 Runtime.' | Set-Content -LiteralPath (Join-Path $destination 'START_HERE.txt') -Encoding utf8
Write-Output (Join-Path $destination 'Courtside.exe')
