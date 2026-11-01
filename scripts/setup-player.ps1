$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $projectRoot '.tools'
$resources = Join-Path $projectRoot 'src-tauri/resources'
New-Item -ItemType Directory -Path $tools, $resources -Force | Out-Null
$archive = Join-Path $tools 'libmpv.7z'
$url = 'https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20261021/mpv-dev-x86_64-20261021-git-e471496c56.7z'
Invoke-WebRequest -Uri $url -OutFile $archive
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne 'EFC719EFF3DC5954B4A5EFC800632808BCEC01CC9034940DD14E5EB7FE9EA633') { throw 'libmpv archive checksum did not match the pinned build.' }
& tar -xf $archive -C $resources
if ($LASTEXITCODE -ne 0) { throw 'Extracting libmpv failed. Install a 7z-capable tar or extract libmpv-2.dll manually.' }
Get-FileHash -LiteralPath (Join-Path $resources 'libmpv-2.dll') -Algorithm SHA256
Write-Output 'Native player ready. Run scripts/dev.ps1.'

