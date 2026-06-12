$id=27350523925
$max=300
$interval=5
$elapsed=0
while ($elapsed -lt $max) {
  $s = gh run view --repo theNeuralHorizon/wise $id --json status --jq '.status' 2>$null
  Write-Output ("check ${elapsed}s: ${s}")
  if ($s -eq 'completed') {
    gh run view --repo theNeuralHorizon/wise $id --log
    exit 0
  }
  Start-Sleep -s $interval
  $elapsed += $interval
}
Write-Output 'timed out waiting for run to complete'