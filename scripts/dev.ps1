param([switch]$Build)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
if (Test-Path -LiteralPath (Join-Path $projectRoot '.tools/cargo/bin/cargo.exe')) {
    $env:RUSTUP_HOME = Join-Path $projectRoot '.tools/rustup'
    $env:CARGO_HOME = Join-Path $projectRoot '.tools/cargo'
    $env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Install Rust (MSVC) and Windows C++ Build Tools first. See README.md.' }
if ($Build) {
    npm.cmd run desktop:build
    if ($LASTEXITCODE -eq 0) { & (Join-Path $PSScriptRoot 'package-portable.ps1') }
} else { npm.cmd run desktop:dev }
exit $LASTEXITCODE

