# Retrieve the verified earlier Setup for upgrade/rollback. When the artifact
# expires, rebuild the same trusted Git revision in a separate working tree.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Revision)
$ErrorActionPreference = 'Stop'
if ($Revision -notmatch '^[0-9a-f]{40}$') { throw 'Invalid baseline commit' }
$root = Join-Path $env:RUNNER_TEMP ('asi-baseline-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$runs = gh api --method GET "repos/$env:GITHUB_REPOSITORY/actions/workflows/ci.yml/runs" -f "head_sha=$Revision" -f status=success -f per_page=20 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect previous workflow runs' }
$artifact = $null
foreach ($run in $runs.workflow_runs) {
    if ($run.head_sha -ne $Revision) { continue }
    $items = gh api "repos/$env:GITHUB_REPOSITORY/actions/runs/$($run.id)/artifacts" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect previous Setup artifacts' }
    $artifact = $items.artifacts | Where-Object { $_.name -eq 'ApkStart-International-Windows-Setup-preview' -and !$_.expired -and $_.workflow_run.head_sha -eq $Revision } | Select-Object -First 1
    if ($artifact) { break }
}
if ($artifact) {
    if ($artifact.digest -notmatch '^sha256:([a-f0-9]{64})$') {throw 'No independent GitHub artifact checksum'}
    $expected = $Matches[1]
    $zip = Join-Path $root 'baseline.zip'
    Invoke-WebRequest -Uri $artifact.archive_download_url -Headers @{Authorization="Bearer $env:GH_TOKEN"} -OutFile $zip
    if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $expected) { throw 'Baseline artifact checksum mismatch' }
    Expand-Archive -LiteralPath $zip -DestinationPath $root
} else {
    $worktree = Join-Path $root 'source'
    git worktree add --detach $worktree $Revision
    if ($LASTEXITCODE -ne 0) {throw 'Baseline Git checkout failed'}
    Push-Location $worktree
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) {throw 'Baseline dependency installation failed'}
        npm run pack
        if ($LASTEXITCODE -ne 0) {throw 'Baseline portable build failed'}
        npm run pack:setup
        if ($LASTEXITCODE -ne 0) {throw 'Baseline Setup build failed'}
    } finally { Pop-Location }
    $root = Join-Path $worktree 'dist/release'
}
$setup=@(Get-ChildItem -Path $root -Recurse -Filter '*-Setup.exe')
if ($setup.Count -ne 1) {throw 'Expected exactly one verified baseline Setup'}
"ASI_PREVIOUS_SETUP=$($setup[0].FullName)" | Out-File -Append -Encoding utf8 $env:GITHUB_ENV
