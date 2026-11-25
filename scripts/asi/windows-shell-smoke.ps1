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
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ShellWindowState {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint process);
}
'@
$UI = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$any = [System.Windows.Automation.Condition]::TrueCondition
function Find-Approval {
    $owned = @(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($exe)) -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $exe } | ForEach-Object { $_.Id })
    if (!$owned.Count) {return}
    $title = New-Object System.Windows.Automation.PropertyCondition($UI::NameProperty,'Confirm Android APK installation')
    foreach ($window in $UI::RootElement.FindAll($scope::Children,$any)) {
        if ($owned -notcontains $window.Current.ProcessId) {continue}
        if ($window.Current.Name -eq 'Confirm Android APK installation') {return $window}
        $modal = $window.FindFirst($scope::Descendants,$title)
        if ($modal -and $modal.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window) {return $modal}
        $controls = $window.FindAll($scope::Descendants,$any)
        if ($controls | Where-Object { $_.Current.Name -like '*SHA-256:*' -and $_.Current.Name -like '*Profile: default*' }) {return $window}
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
    if (!$dialog) {
        Get-Item -LiteralPath 'HKCU:\Software\Classes\ApkStartInternational.apk\shell\open\command' | ForEach-Object {Write-Host "Registered command $($_.GetValue(''))"}
        foreach ($window in $UI::RootElement.FindAll($scope::Children,$any)) {
            $owner = Get-Process -Id $window.Current.ProcessId -ErrorAction SilentlyContinue
            Write-Host "Desktop window $($owner.Name) | $($window.Current.ClassName) | $($window.Current.Name)"
            if ($owner.Path -eq $exe -or $owner.Name -match 'OpenWith|ShellExperience') {
                $window.FindAll($scope::Descendants,$any) | Select-Object -First 40 | ForEach-Object {Write-Host "Control $($_.Current.ControlType.ProgrammaticName) $($_.Current.Name)"}
            }
        }
        throw "Windows did not open the native APK approval for $Name"
    }
    $controls = $dialog.FindAll($scope::Descendants,$any)
    $labels = ($controls | ForEach-Object { $_.Current.Name }) -join "`n"
    foreach ($needle in @($Name,$sha,'Profile: default','Package: com.android.inputmethod.pinyin')) {
        if (!$labels.Contains($needle)) {throw "Native approval did not identify $needle. Observed $labels"}
    }
    $button = $controls | Where-Object {
        $_.Current.Name.Replace('&','').Trim() -eq 'Cancel' -and
            $_.Current.ControlType.Id -eq [System.Windows.Automation.ControlType]::Button.Id
    } | Select-Object -First 1
    if ($button) {
        $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    } else {
        # Some Electron/Windows combinations expose the TaskDialog detail but
        # put the buttons in a different UIA fragment. Escape is its cancelId.
        $ownerId = $dialog.Current.ProcessId
        $keyboard = New-Object -ComObject WScript.Shell
        $null = $keyboard.AppActivate($ownerId)
        [uint32]$focusedId = 0
        $null = [ShellWindowState]::GetWindowThreadProcessId([ShellWindowState]::GetForegroundWindow(),[ref]$focusedId)
        if ($focusedId -ne $ownerId) {throw 'APK approval does not own keyboard focus'}
        $keyboard.SendKeys('{ESC}')
    }
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
