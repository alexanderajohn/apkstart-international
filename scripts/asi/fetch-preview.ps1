# Download the two archives whose digests were recorded after candidate testing.
$ErrorActionPreference = 'Stop'
$pin = Get-Content -Raw docs/preview/windows-rc.json | ConvertFrom-Json
if ($pin.revision -notmatch '^[0-9a-f]{40}$') { throw 'Invalid candidate revision' }
$api = "$env:GITHUB_API_URL/repos/$env:GITHUB_REPOSITORY/actions"
$headers = @{Authorization="Bearer $env:GITHUB_TOKEN";Accept='application/vnd.github+json'}
foreach ($runId in @($pin.buildRun, $pin.androidRun)) {
    if ($runId -notmatch '^\d+$') { throw 'Invalid workflow run' }
    $run = Invoke-RestMethod -Uri "$api/runs/$runId" -Headers $headers
    if ($run.head_sha -cne $pin.revision -or $run.head_branch -ne 'feature/international-foundation' -or $run.status -ne 'completed') {
        throw 'Source workflow has a different revision, branch or completion state'
    }
    if ($runId -eq $pin.buildRun -and ($run.conclusion -ne 'success' -or $run.path -ne '.github/workflows/ci.yml')) {
        throw 'Candidate build did not pass Windows CI'
    }
    if ($runId -eq $pin.androidRun -and $run.path -ne '.github/workflows/android-guest.yml') {
        throw 'Invalid Android evidence workflow'
    }
}
$kit = New-Item -ItemType Directory -Path "$env:RUNNER_TEMP/tester-kit"
$sums = foreach ($kind in @('portable','setup')) {
    $entry = $pin.$kind
    if ($entry.id -notmatch '^\d+$' -or $entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid artifact pin' }
    $expectedName = if ($kind -eq 'portable') { 'ApkStart-International-Windows-dev-preview' } else { 'ApkStart-International-Windows-Setup-preview' }
    $url = "$api/artifacts/$($entry.id)"
    $meta = Invoke-RestMethod $url -Headers $headers
    if ($meta.expired -or $meta.workflow_run.id -ne $pin.buildRun -or $meta.workflow_run.head_sha -cne $pin.revision -or
        $meta.name -cne $expectedName -or $meta.digest -cne "sha256:$($entry.sha256)") {
        throw "Source artifact is unavailable or differs from its verified pin: $kind"
    }
    $name = "$kind.zip"
    $archive = Join-Path $kit.FullName $name
    # PowerShell removes Authorization on a cross-host redirect by default.
    Invoke-WebRequest -Uri "$url/zip" -Headers $headers -OutFile $archive
    if ((Get-Item $archive).Length -ne $meta.size_in_bytes -or (Get-FileHash $archive -Algorithm SHA256).Hash -ne $entry.sha256) {
        throw "Downloaded $kind archive failed verification"
    }
    "$($entry.sha256)  $name"
}
$sums | Set-Content -Encoding ascii "$kit/SHA256SUMS.txt"
Copy-Item docs/preview/TESTING.vi.md,docs/preview/TESTING.en.md,docs/preview/windows-rc.json -Destination $kit.FullName
"revision=$($pin.revision)" >> $env:GITHUB_OUTPUT
