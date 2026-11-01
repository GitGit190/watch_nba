param([Parameter(Mandatory=$true)][int]$AppProcessId)
$ErrorActionPreference = 'Stop'
$processes = Get-CimInstance Win32_Process
$ids = [System.Collections.Generic.HashSet[int]]::new()
$null = $ids.Add($AppProcessId)
do {
    $added = $false
    foreach ($entry in $processes) {
        if ($ids.Contains([int]$entry.ParentProcessId) -and $ids.Add([int]$entry.ProcessId)) { $added = $true }
    }
} while ($added)
$rows = foreach ($processIdToMeasure in $ids) {
    $process = Get-Process -Id $processIdToMeasure -ErrorAction SilentlyContinue
    if ($process) {
        [pscustomobject]@{ Name=$process.ProcessName; ProcessId=$process.Id; PrivateMiB=[Math]::Round($process.PrivateMemorySize64/1MB,1); WorkingSetMiB=[Math]::Round($process.WorkingSet64/1MB,1) }
    }
}
[pscustomobject]@{ Timestamp=(Get-Date).ToString('o'); Processes=@($rows); TotalPrivateMiB=($rows | Measure-Object PrivateMiB -Sum).Sum; SumWorkingSetMiB=($rows | Measure-Object WorkingSetMiB -Sum).Sum; Note='Working sets include shared pages and must not be interpreted as unique physical memory. This is a snapshot, not a performance benchmark.' } | ConvertTo-Json -Depth 5
