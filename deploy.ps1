param(
  [string]$SubscriptionId = '831da82c-9ea4-4794-8c48-6bcf14f3cba7',
  [string]$ResourceGroupName = 'CI-DEV-Jason-Divis',
  [string]$WebAppName = 'voice-aiac'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$workDir = Join-Path $env:TEMP "voice-aiac-deploy-$timestamp"
$stageDir = Join-Path $workDir 'stage'
$zipPath = Join-Path $workDir 'voice-aiac.zip'

New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

$excluded = @('.git', '.copilot', 'files', 'node_modules', '.vscode', 'test-results', 'playwright-report')

Get-ChildItem -LiteralPath $root -Force | Where-Object {
  $excluded -notcontains $_.Name
} | ForEach-Object {
  $relative = $_.FullName.Substring($root.Length).TrimStart('\')
  $destination = Join-Path $stageDir $relative
  if ($_.PSIsContainer) {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Get-ChildItem -LiteralPath $_.FullName -Recurse -Force | Where-Object {
      $excluded -notcontains $_.Name
    } | ForEach-Object {
      if (-not $_.PSIsContainer) {
        $childRelative = $_.FullName.Substring($root.Length).TrimStart('\')
        $childDestination = Join-Path $stageDir $childRelative
        New-Item -ItemType Directory -Path (Split-Path -Parent $childDestination) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $childDestination -Force
      }
    }
  }
  elseif (-not $_.PSIsContainer) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
  }
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -Force

az account set --subscription $SubscriptionId | Out-Null
az webapp deploy `
  --resource-group $ResourceGroupName `
  --name $WebAppName `
  --type zip `
  --src-path $zipPath `
  --restart true `
  --async true | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Azure deployment could not be started."
}

$deadline = (Get-Date).AddMinutes(15)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 10

  $deploymentLog = az webapp log deployment show --resource-group $ResourceGroupName --name $WebAppName --output json
  if ($LASTEXITCODE -ne 0) {
    continue
  }

  $entries = $deploymentLog | ConvertFrom-Json
  if (-not $entries) {
    continue
  }

  $latestMessage = ($entries | Select-Object -Last 1).message
  if ($latestMessage -match 'Deployment successful') {
    Write-Host "Deployed $WebAppName from $zipPath"
    exit 0
  }

  if ($latestMessage -match 'ERROR|Failed') {
    throw "Azure deployment failed: $latestMessage"
  }
}

throw "Azure deployment timed out waiting for a success signal."
