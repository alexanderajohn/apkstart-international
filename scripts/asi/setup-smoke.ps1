# Exercise the built installer only inside a fresh hosted Windows CI machine.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Setup, [string]$PreviousSetup)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'This installer exercise requires a disposable GitHub-hosted Windows runner.'
}
$root = Join-Path $env:RUNNER_TEMP ("asi-setup-" + [guid]::NewGuid().ToString('N'))
$target = Join-Path $root 'program'
$env:APPDATA = Join-Path $root 'roaming'
$env:LOCALAPPDATA = Join-Path $root 'local'
$profile = Join-Path $env:APPDATA 'apkstart-international/profiles/p_0123456789abcdef'
New-Item -ItemType Directory -Path $profile,$env:LOCALAPPDATA | Out-Null
$sentinel = Join-Path $profile 'apps.json'
$expected = '{"apps":[{"package":"org.example.canary"}]}'
[IO.File]::WriteAllText($sentinel,$expected)
function Test-Data {
    if ([IO.File]::ReadAllText($sentinel) -cne $expected) {throw 'Profile data changed'}
}
function Install-Candidate([string]$File) {
    $path = (Resolve-Path $File).Path
    $process = Start-Process -FilePath $path -ArgumentList @('/S',"/D=$target") -Wait -PassThru
    if ($process.ExitCode -ne 0) {throw "Setup exited with $($process.ExitCode)"}
    $main = Join-Path $target 'resources/app/src/main.js'
    $exe = Join-Path $target 'ApkStart International.exe'
    if (!(Test-Path $main -PathType Leaf) -or !(Test-Path $exe -PathType Leaf)) {throw 'Installed files are incomplete'}
    Test-Data
    return (Get-FileHash $main -Algorithm SHA256).Hash
}
if ($PreviousSetup) {
    $before = Install-Candidate $PreviousSetup
}
$current = Install-Candidate $Setup
if ($current -ne (Get-FileHash 'src/main.js' -Algorithm SHA256).Hash) {throw 'Installed source differs from this checkout'}
if ($PreviousSetup) {
    if ((Install-Candidate $PreviousSetup) -ne $before) {throw 'Rollback did not restore the previous program'}
    if ((Install-Candidate $Setup) -ne $current) {throw 'Re-upgrade changed the program'}
} elseif ((Install-Candidate $Setup) -ne $current) {throw 'Reinstallation changed the program'}
$uninstaller = @(Get-ChildItem -LiteralPath $target -Filter 'Uninstall*.exe')
if ($uninstaller.Count -ne 1) {throw 'Expected one uninstaller'}
$exit = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList @('/S',"_?=$target") -Wait -PassThru
if ($exit.ExitCode -ne 0 -or (Test-Path (Join-Path $target 'resources/app/src/main.js'))) {throw 'Uninstall failed'}
Test-Data
Write-Output 'SETUP_PROFILE_PRESERVATION_OK'
