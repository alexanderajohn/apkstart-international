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
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class ShellWindowState {
  private delegate bool Visitor(IntPtr hwnd, IntPtr extra);
  [DllImport("user32.dll")] private static extern bool EnumWindows(Visitor callback, IntPtr extra);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr root, Visitor callback, IntPtr extra);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint process);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int size);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
  public static string WindowClass(IntPtr h) { var s=new StringBuilder(256); GetClassName(h,s,s.Capacity); return s.ToString(); }
  public static string Caption(IntPtr h) { var s=new StringBuilder(1024); GetWindowText(h,s,s.Capacity); return s.ToString(); }
  public static IntPtr[] Dialogs(int[] pids) {
    var found=new List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr extra) {
      uint pid; GetWindowThreadProcessId(h,out pid);
      if (Array.IndexOf(pids,(int)pid)>=0 && IsWindowVisible(h) && WindowClass(h)=="#32770") found.Add(h);
      return true;
    },IntPtr.Zero);
    return found.ToArray();
  }
  public static bool Cancel(IntPtr dialog) {
    IntPtr button=IntPtr.Zero;
    EnumChildWindows(dialog,delegate(IntPtr h, IntPtr extra) {
      if (WindowClass(h)=="Button" && Caption(h).Replace("&","").Trim()=="Cancel") button=h;
      return true;
    },IntPtr.Zero);
    return button!=IntPtr.Zero ? PostMessage(button,0x00F5,IntPtr.Zero,IntPtr.Zero)
                               : PostMessage(dialog,0x0010,IntPtr.Zero,IntPtr.Zero);
  }
}
'@
$UI = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$any = [System.Windows.Automation.Condition]::TrueCondition
function Find-Approval([string]$Digest) {
    [int[]]$owned = @(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($exe)) -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $exe } | ForEach-Object { $_.Id })
    foreach ($hwnd in [ShellWindowState]::Dialogs($owned)) {
        $native = $UI::FromHandle($hwnd)
        $labels = ($native.FindAll($scope::Descendants,$any) | ForEach-Object { $_.Current.Name }) -join "`n"
        if ($labels.Contains($Digest) -and $labels.Contains('Profile: default')) {
            return [pscustomobject]@{Handle=$hwnd; ProcessId=$native.Current.ProcessId; Labels=$labels}
        }
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
        $dialog = Find-Approval $sha
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
    foreach ($needle in @($Name,$sha,'Profile: default','Package: com.android.inputmethod.pinyin')) {
        if (!$dialog.Labels.Contains($needle)) {throw "Native approval did not identify $needle"}
    }
    if (![ShellWindowState]::Cancel($dialog.Handle)) {throw 'Could not dismiss the identified APK dialog'}
    $deadline = [datetime]::UtcNow.AddSeconds(10)
    while ([ShellWindowState]::IsWindow($dialog.Handle) -and [datetime]::UtcNow -lt $deadline) {Start-Sleep -Milliseconds 200}
    if ([ShellWindowState]::IsWindow($dialog.Handle)) {throw 'Native APK dialog remained open after cancellation'}
    if ((Get-Process -Id $dialog.ProcessId -ErrorAction SilentlyContinue).Path -ne $exe) {throw 'Packaged app exited when the dialog was cancelled'}
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
