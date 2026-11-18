# Read-only process snapshot scoped by executable path to the fork runtime.
param([Parameter(Mandatory=$true)][string]$RuntimeRoot)
$ErrorActionPreference='SilentlyContinue'
$root=[System.IO.Path]::GetFullPath($RuntimeRoot).TrimEnd('\','/')+'\'
$results=@()
try {
  $items=Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^(qemu-system-x86_64|emulator)\.exe$' -and
    $_.ExecutablePath -and
    $_.ExecutablePath.StartsWith($root,[System.StringComparison]::OrdinalIgnoreCase) -and
    $_.CommandLine -like '*apkstart*'
  }
  foreach($p in $items){
    $gp=Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
    if($null -ne $gp -and $null -ne $gp.CPU){
      $results+=@{pid=[int]$p.ProcessId;cpuSeconds=[double]$gp.CPU;
        workingSetBytes=[double]$gp.WorkingSet64}
    }
  }
}catch{}
@{processes=@($results)} | ConvertTo-Json -Compress -Depth 3
