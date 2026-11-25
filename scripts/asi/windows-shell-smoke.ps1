# Exercise the packaged application's normal Windows shell entry points.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Executable)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:ASI_RUNNER_KIND -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Requires a disposable hosted Windows runner'
}
$exe = (Resolve-Path -LiteralPath $Executable).Path
$root = Join-Path $env:RUNNER_TEMP ('asi-shell-' + [guid]::NewGuid().ToString('N'))
$env:APPDATA = Join-Path $root 'roaming'
$env:ASI_SHELL_EXE = $exe
$env:ASI_SHELL_USERDATA = Join-Path $root 'chromium'
New-Item -ItemType Directory -Path $env:APPDATA | Out-Null
$extension = 'HKCU:\Software\Classes\.apk'
function Get-Handler {
    if (Test-Path -LiteralPath $extension) { return (Get-Item -LiteralPath $extension).GetValue('') }
}
if ((Get-Handler) -or (Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.apk\UserChoice')) {
    throw 'The hosted desktop already has a user-selected APK association'
}
function Register-App {
    @'
const {registerAssociation} = require('./src/core/assoc');
registerAssociation(process.env.ASI_SHELL_EXE, undefined, '--user-data-dir="' + process.env.ASI_SHELL_USERDATA + '"');
'@ | node
    if ($LASTEXITCODE -ne 0 -or (Get-Handler) -ne 'ApkStartInternational.apk') {throw 'Registration failed'}
}
function Unregister-App {
    node -e "require('./src/core/assoc').unregisterAssociation()"
    if ($LASTEXITCODE -ne 0) {throw 'Unregister failed'}
}
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$UI = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$any = [System.Windows.Automation.Condition]::TrueCondition
function Find-Approval {
    $owned = @(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($exe)) -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $exe } | ForEach-Object { $_.Id })
    if (!$owned.Count) {return}
    foreach ($window in $UI::RootElement.FindAll($scope::Children,$any)) {
        if ($owned -contains $window.Current.ProcessId -and $window.Current.Name -eq 'Confirm Android APK installation') {return $window}
    }
}
function Open-AndCancel([string]$Name) {
    $apk = Join-Path $root $Name
    Copy-Item -LiteralPath 'assets/PinyinIME.apk' -Destination $apk
    $sha = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    # Use ShellExecute on the APK itself, with the same file association used by Explorer.
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $apk
    $start.UseShellExecute = $true
    $null = [Diagnostics.Process]::Start($start)
    $deadline = [datetime]::UtcNow.AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 400
        $dialog = Find-Approval
    } until ($null -ne $dialog -or [datetime]::UtcNow -ge $deadline)
    if (!$dialog) {throw "Windows did not open the native APK approval for $Name"}
    $controls = $dialog.FindAll($scope::Descendants,$any)
    $labels = ($controls | ForEach-Object { $_.Current.Name }) -join "`n"
    foreach ($needle in @($Name,$sha,'Profile: default','Package: com.android.inputmethod.pinyin')) {
        if (!$labels.Contains($needle)) {throw "Native approval did not identify $needle. Observed $labels"}
    }
    $button = $controls | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -eq 'Cancel' } | Select-Object -First 1
    if (!$button) {throw 'Expected a native Cancel button'}
    $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    $deadline = [datetime]::UtcNow.AddSeconds(10)
    while ((Find-Approval) -and [datetime]::UtcNow -lt $deadline) {Start-Sleep -Milliseconds 200}
    if (Find-Approval) {throw 'Approval remained open after cancellation'}
    node -e "if(require('./src/core/store').getApps().length) process.exit(1)"
    if ($LASTEXITCODE -ne 0) {throw 'Cancelled APK was added to the Profile catalog'}
    Write-Output "SHELL_APK_CANCEL_OK $Name $sha"
}
try {
    Register-App
    Open-AndCancel 'APK first launch.apk'
    Open-AndCancel 'APK secondary launch.apk'
    Unregister-App
    if (Get-Handler) {throw 'Initial empty association was not restored'}
    Set-Item -LiteralPath $extension -Value 'ASI.Test.Previous'
    Register-App
    Unregister-App
    if ((Get-Handler) -ne 'ASI.Test.Previous') {throw 'Previous handler was not restored'}
    Register-App
    Set-Item -LiteralPath $extension -Value 'ASI.Test.LaterSelection'
    Unregister-App
    if ((Get-Handler) -ne 'ASI.Test.LaterSelection') {throw 'A subsequent handler choice was overwritten'}
    Write-Output 'SHELL_HANDLER_PRESERVATION_OK'
} finally {
    if ((Get-Handler) -eq 'ApkStartInternational.apk') {Unregister-App}
    if ((Get-Handler) -in @('ASI.Test.Previous','ASI.Test.LaterSelection')) {Set-Item -LiteralPath $extension -Value ''}
    Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($exe)) -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $exe } | Stop-Process -Force
}
