# Exercise the packaged application's normal Windows shell entry points.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Executable, [switch]$InstallLiveApk,
      [ValidateSet('api','calculator')][string]$Fixture='api')
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:ASI_RUNNER_KIND -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Requires a disposable hosted Windows runner'
}
$exe = (Resolve-Path -LiteralPath $Executable).Path
$root = Join-Path $env:RUNNER_TEMP ('asi-shell-' + [guid]::NewGuid().ToString('N'))
$env:APPDATA = Join-Path $root 'roaming'
$env:ASI_SHELL_EXE = $exe
$env:ASI_SHELL_USERDATA = if ($InstallLiveApk) { '' } else { Join-Path $root 'chromium' }
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
const data = process.env.ASI_SHELL_USERDATA;
registerAssociation(process.env.ASI_SHELL_EXE, undefined, data ? '--user-data-dir="' + data + '"' : '');
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
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd, int command);
  public static string WindowClass(IntPtr h) { var s=new StringBuilder(256); GetClassName(h,s,s.Capacity); return s.ToString(); }
  public static string Caption(IntPtr h) { var s=new StringBuilder(1024); GetWindowText(h,s,s.Capacity); return s.ToString(); }
  public static IntPtr[] VisibleWindows(int[] pids, string cls, string caption) {
    var found=new List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr extra) {
      uint pid; Rect bounds; GetWindowThreadProcessId(h,out pid);
      if (Array.IndexOf(pids,(int)pid)>=0 && IsWindowVisible(h) &&
          (String.IsNullOrEmpty(cls) || WindowClass(h)==cls) &&
          (String.IsNullOrEmpty(caption) || Caption(h)==caption) &&
          GetWindowRect(h,out bounds) && bounds.right>bounds.left && bounds.bottom>bounds.top) found.Add(h);
      return true;
    },IntPtr.Zero);
    return found.ToArray();
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, UIntPtr w, StringBuilder l, uint flags, uint timeout, out UIntPtr result);
  [DllImport("user32.dll")] private static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] private static extern bool IsWindowEnabled(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] private struct Rect { public int left,top,right,bottom; }
  [StructLayout(LayoutKind.Sequential)] private struct Point { public int x,y; }
  [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr h,out Rect r);
  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point p);
  [DllImport("user32.dll")] private static extern bool IsChild(IntPtr parent, IntPtr child);
  [DllImport("user32.dll")] private static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] private static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
  public static bool Click(IntPtr dialog, string name) {
    IntPtr button=IntPtr.Zero;
    EnumChildWindows(dialog,delegate(IntPtr h, IntPtr extra) {
      if (WindowClass(h)=="Button") {
        var label=new StringBuilder(512); UIntPtr result;
        SendMessageTimeout(h,0x000D,(UIntPtr)512,label,2,1000,out result);
        Console.WriteLine("Native button {0} [{1}] enabled={2}",GetDlgCtrlID(h),label,IsWindowEnabled(h));
        if (label.ToString().Replace("&","").Trim()==name && IsWindowEnabled(h)) button=h;
      }
      return true;
    },IntPtr.Zero);
    if (button==IntPtr.Zero) return false;
    SetForegroundWindow(dialog);
    Rect rect;
    if (!GetWindowRect(button,out rect)) return false;
    var point=new Point {x=(rect.left+rect.right)/2,y=(rect.top+rect.bottom)/2};
    IntPtr hit=WindowFromPoint(point);
    if (hit!=button && !IsChild(button,hit)) {
      // UIA may virtualize controls under DirectUI. BM_CLICK still targets only
      // the verified, enabled button on this dialog, regardless of focus.
      return PostMessage(button,0x00F5,IntPtr.Zero,IntPtr.Zero);
    }
    if (!SetCursorPos(point.x,point.y)) return false;
    mouse_event(2,0,0,0,UIntPtr.Zero);
    mouse_event(4,0,0,0,UIntPtr.Zero);
    return true;
  }
}
'@
$UI = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$any = [System.Windows.Automation.Condition]::TrueCondition
function Find-Approval([string]$Digest, [string]$ProfileId, [string]$ProfileField) {
    [int[]]$owned = @(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($exe)) -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $exe } | ForEach-Object { $_.Id })
    foreach ($hwnd in [ShellWindowState]::VisibleWindows($owned,'#32770',$null)) {
        $native = $UI::FromHandle($hwnd)
        $labels = ($native.FindAll($scope::Descendants,$any) | ForEach-Object { $_.Current.Name }) -join "`n"
        if ($labels.Contains($Digest) -and $labels.Contains($ProfileField + ': ' + $ProfileId)) {
            return [pscustomobject]@{Handle=$hwnd; ProcessId=$native.Current.ProcessId; Labels=$labels}
        }
    }
}
function Invoke-AppButton([IntPtr]$Handle, [string]$Label) {
    $window = $UI::FromHandle($Handle)
    $condition = [System.Windows.Automation.PropertyCondition]::new($UI::NameProperty,$Label)
    $deadline = [datetime]::UtcNow.AddSeconds(12)
    do {
        $buttons = @($window.FindAll($scope::Descendants,$condition) | Where-Object {
            $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.IsEnabled
        })
        if ($buttons.Count -eq 1) {
            $buttons[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
            return
        }
        Start-Sleep -Milliseconds 200
    } until ([datetime]::UtcNow -ge $deadline)
    throw "Could not identify the app window button '$Label'"
}
function Assert-WindowState([IntPtr]$Handle, [bool]$Minimized, [bool]$Maximized) {
    $deadline = [datetime]::UtcNow.AddSeconds(10)
    do {
        if ([ShellWindowState]::IsWindow($Handle) -and
            [ShellWindowState]::IsIconic($Handle) -eq $Minimized -and [ShellWindowState]::IsZoomed($Handle) -eq $Maximized) {return}
        Start-Sleep -Milliseconds 200
    } until ([datetime]::UtcNow -ge $deadline)
    throw "Window state did not reach minimized=$Minimized maximized=$Maximized"
}
function Open-Apk([string]$Name, [string]$Source, [string]$Package, [string]$ProfileId, [string]$Button, [string]$ProfileField='Profile', [string]$PackageField='Package') {
    $apk = Join-Path $root $Name
    Copy-Item -LiteralPath $Source -Destination $apk
    $sha = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    # Use ShellExecute on the APK itself, with the same file association used by Explorer.
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $apk
    $start.UseShellExecute = $true
    $null = [Diagnostics.Process]::Start($start)
    $deadline = [datetime]::UtcNow.AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 400
        $dialog = Find-Approval $sha $ProfileId $ProfileField
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
    foreach ($needle in @($Name,$sha,($ProfileField + ': ' + $ProfileId),($PackageField + ': ' + $Package))) {
        if (!($dialog.Labels.Contains($needle))) {throw "Native approval did not identify $needle"}
    }
    if (![ShellWindowState]::Click($dialog.Handle,$Button)) {throw "Could not activate $Button in the identified approval dialog"}
    $deadline = [datetime]::UtcNow.AddSeconds(10)
    while ([ShellWindowState]::IsWindow($dialog.Handle) -and [datetime]::UtcNow -lt $deadline) {Start-Sleep -Milliseconds 200}
    if ([ShellWindowState]::IsWindow($dialog.Handle)) {throw 'Native APK dialog remained open after selecting the button'}
    if ((Get-Process -Id $dialog.ProcessId -ErrorAction SilentlyContinue).Path -ne $exe) {throw 'Packaged app exited after closing its APK dialog'}
    if ($Button -in @('Cancel','Hủy','取消')) {
        node -e "if(require('./src/core/store').getApps().length) process.exit(1)"
        if ($LASTEXITCODE -ne 0) {throw 'Cancelled APK was added to the Profile catalog'}
        Write-Output "SHELL_APK_CANCEL_OK $Name $sha"
    }
}
if ($InstallLiveApk) {
    $report = [ordered]@{revision=$env:GITHUB_SHA; fixture=$Fixture; phases=@(); complete=$false}
    $reportPath = Join-Path $env:RUNNER_TEMP 'desktop-evidence.json'
}
function Save-DesktopPhase([string]$Name) {
    $report.phases += $Name
    $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reportPath -Encoding UTF8
    Write-Host "Desktop evidence: $Name"
}
try {
    Register-App
    if ($InstallLiveApk) {
        $env:ASI_SHORTCUT_DIR = Join-Path $root 'shortcuts'
        New-Item -ItemType Directory -Path $env:ASI_SHORTCUT_DIR | Out-Null
        $uiText = if ($Fixture -eq 'calculator') {
            @{code='vi'; install='Cài vào Desktop CI'; profile='Hồ sơ'; package='Mã gói'; maximize='Phóng to'; restore='Khôi phục cửa sổ'; minimize='Thu nhỏ'}
        } else {
            @{code='en'; install='Install to Desktop CI'; profile='Profile'; package='Package'; maximize='Maximize'; restore='Restore window'; minimize='Minimize'}
        }
        $env:ASI_DESKTOP_LANGUAGE = $uiText.code
        $profileId = @'
const store = require('./src/core/store');
const id = store.profiles.create('Desktop CI').id;
store.profiles.activate(id);
store.ensureDirs();
store.saveSettings({runtime:{dir:process.env.ANDROID_HOME}, uiLocale:process.env.ASI_DESKTOP_LANGUAGE, engine:{prewarm:false},
                    shortcutDir:process.env.ASI_SHORTCUT_DIR, createShortcutOnInstall:true, createStartMenuShortcut:false});
console.log(id);
'@ | node
        if ($LASTEXITCODE -ne 0 -or $profileId -notmatch '^p_[a-f0-9]{16}$') {throw 'Expected a new owned Profile'}
        $inputApk = @{
            api = @{package='io.appium.android.apis'; file='api.apk'; title='API Demos'; hash='a9eecf37b26cd084855c530db81c2bb1b91f4c1b095a04f47aa7c20e2791f686'}
            calculator = @{package='org.fossify.math'; file='calculator.apk'; title='Fossify Calculator'; hash='7c5443c22d6d62c67dfe80df33ea9161ff0fa440f92590bcb45d7008b57613ed'}
        }[$Fixture]
        $src = Join-Path $env:RUNNER_TEMP ('guest-fixtures/' + $inputApk.file)
        if ((Get-FileHash $src -Algorithm SHA256).Hash -ne $inputApk.hash) {throw 'Unexpected fixture APK'}
        $pkg = $inputApk.package
        $report.profile = $profileId
        $report.package = $pkg
        $report.language = $uiText.code
        $report.sha256 = $inputApk.hash
        Save-DesktopPhase 'Verified signed fixture digest and created isolated Profile'
        Open-Apk ($inputApk.title + ' from Explorer.apk') $src $pkg $profileId $uiText.install $uiText.profile $uiText.package
        Save-DesktopPhase 'Approved package, SHA-256 and Profile in native Windows dialog'
        $log = Join-Path $env:APPDATA 'apkstart-international/logs/app.log'
        $deadline = [datetime]::UtcNow.AddMinutes(18)
        do {
            Start-Sleep -Seconds 3
            if (Test-Path -LiteralPath $log) {
                $failure = Select-String -LiteralPath $log -SimpleMatch 'APK installation failed:' | Select-Object -Last 1
                if ($failure) {throw $failure.Line}
            }
            $links = @(Get-ChildItem -LiteralPath $env:ASI_SHORTCUT_DIR -Filter '*.lnk')
        } until ($links.Count -or [datetime]::UtcNow -gt $deadline)
        if ($links.Count -ne 1) {throw 'Packaged application did not install and create the expected shortcut'}
        $link = (New-Object -ComObject WScript.Shell).CreateShortcut($links[0].FullName)
        if ($link.TargetPath -ne $exe -or $link.Arguments -ne ('--launch='+$pkg+' --profile='+$profileId)) {throw 'Shortcut target or Profile does not match'}
        $owner = Get-Content -Raw (Join-Path $env:APPDATA "apkstart-international/profiles/$profileId/runtime-owner.json") | ConvertFrom-Json
        if ($owner.profileId -ne $profileId -or $owner.serial -notmatch '^emulator-\d+$') {throw 'Unknown emulator owner'}
        $env:ANDROID_ADB_SERVER_PORT = '5044'
        $adb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
        $installed = & $adb -s $owner.serial shell pm path $pkg
        if ($LASTEXITCODE -ne 0 -or $installed -notmatch 'package:/.*base.apk') {throw 'Installed package file not found'}
        Save-DesktopPhase 'Verified installed package and Profile-qualified shortcut target'
        $label = node -e "const a=require('./src/core/store').getApp(process.argv[1]); if(!a)process.exit(1); console.log(a.label || a.package)" $pkg
        if ($LASTEXITCODE -ne 0 -or !($label -is [string]) -or !$label.Trim()) {throw 'Missing desktop app label in this Profile'}
        $logBefore = @(Get-Content -LiteralPath $log -Encoding UTF8).Count
        $openLink = New-Object Diagnostics.ProcessStartInfo
        $openLink.FileName = $links[0].FullName
        $openLink.UseShellExecute = $true
        $null = [Diagnostics.Process]::Start($openLink)
        $deadline = [datetime]::UtcNow.AddMinutes(5)
        do {
            Start-Sleep -Seconds 2
            $newLog = @(Get-Content -LiteralPath $log -Encoding UTF8 | Select-Object -Skip $logBefore)
            $attached = $newLog | Select-String -SimpleMatch "launch ok $pkg embed=true" -Quiet
            $received = $newLog | Select-String -SimpleMatch "Received shortcut for $pkg in Profile $profileId" -Quiet
        } until (($received -and $attached) -or [datetime]::UtcNow -gt $deadline)
        if (!$received -or !$attached) {throw "Shortcut received=$([bool]$received), desktop display attached=$([bool]$attached)"}
        [int[]]$owned = @(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($exe)) | Where-Object {$_.Path -eq $exe} | ForEach-Object {$_.Id})
        $windows = [ShellWindowState]::VisibleWindows($owned,$null,$label)
        if (!$windows.Count) {throw 'No visible packaged app window with the installed app title'}
        if ($windows.Count -ne 1) {throw 'App window title matched multiple owned windows'}
        $report.windowTitle = $label
        Save-DesktopPhase 'Opened original shortcut and observed the visible app window'
        $handle = $windows[0]
        Invoke-AppButton $handle $uiText.maximize
        Assert-WindowState $handle $false $true
        Invoke-AppButton $handle $uiText.restore
        Assert-WindowState $handle $false $false
        Invoke-AppButton $handle $uiText.minimize
        Assert-WindowState $handle $true $false
        # Bring back the minimized window just as Windows does from its taskbar.
        $null = [ShellWindowState]::ShowWindowAsync($handle,9)
        Assert-WindowState $handle $false $false
        Save-DesktopPhase 'Verified maximize, restore and minimize with the real title bar'
        $activity = & $adb -s $owner.serial shell dumpsys activity activities | Select-String ('topResumedActivity.*' + [regex]::Escape($pkg) + '/')
        if ($LASTEXITCODE -ne 0 -or !$activity) {throw "$pkg did not reach the foreground"}
        $report.activity = @($activity)[0].Line.Trim()
        Save-DesktopPhase 'Observed installed Android Activity in the foreground'
        Write-Output "LIVE_DESKTOP_INSTALL_LAUNCH_OK $profileId $($owner.serial) $($report.activity)"
    } else {
        Open-Apk 'APK first launch.apk' 'assets/PinyinIME.apk' 'com.android.inputmethod.pinyin' 'default' 'Cancel'
        Open-Apk 'APK secondary launch.apk' 'assets/PinyinIME.apk' 'com.android.inputmethod.pinyin' 'default' 'Cancel'
        foreach ($language in @(
            @{Code='vi'; Button='Hủy'; Profile='Hồ sơ'; Package='Mã gói'},
            @{Code='zh-CN'; Button='取消'; Profile='配置文件'; Package='包名'}
        )) {
            $env:ASI_TEST_LOCALE = $language.Code
            node -e "require('./src/core/store').saveSettings({uiLocale:process.env.ASI_TEST_LOCALE})"
            if ($LASTEXITCODE -ne 0) {throw 'Could not set the disposable UI language'}
            Open-Apk ('APK ' + $language.Code + '.apk') 'assets/PinyinIME.apk' 'com.android.inputmethod.pinyin' 'default' $language.Button $language.Profile $language.Package
        }
    }
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
    if ($InstallLiveApk) {
        $report.complete = $true
        Save-DesktopPhase 'Verified Windows file association restoration'
    }
} catch {
    if ($InstallLiveApk) {
        $report.error = $_.Exception.Message
        $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reportPath -Encoding UTF8
    }
    $logs = Join-Path $env:APPDATA 'apkstart-international/logs'
    foreach ($name in @('app.log','emulator.log')) {
        if (Test-Path (Join-Path $logs $name)) {Get-Content (Join-Path $logs $name) -Encoding UTF8 -Tail 80 | Write-Host}
    }
    throw
} finally {
    if ((Get-Handler) -eq 'ApkStartInternational.apk') {Unregister-App}
    if ((Get-Handler) -in @('ASI.Test.Previous','ASI.Test.LaterSelection')) {Set-Item -LiteralPath $extension -Value ''}
    Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($exe)) -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $exe } | Stop-Process -Force
}
