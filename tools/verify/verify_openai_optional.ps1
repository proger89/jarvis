$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

if (-not $env:OPENAI_API_KEY) {
  $envFile = Join-Path $repoRoot '.env'
  if (Test-Path $envFile) {
    $keyLine = Get-Content $envFile | Where-Object { $_ -match '^OPENAI_API_KEY=' } | Select-Object -First 1
    if ($keyLine) {
      $env:OPENAI_API_KEY = ($keyLine -replace '^OPENAI_API_KEY=', '').Trim()
    }
  }
}

if (-not $env:OPENAI_API_KEY) {
  Write-Host '[verify_openai_optional] SKIPPED: OPENAI_API_KEY is not set'
  exit 0
}

$headers = @{
  Authorization = "Bearer $($env:OPENAI_API_KEY)"
}

$jsonHeaders = @{
  Authorization = "Bearer $($env:OPENAI_API_KEY)"
  'Content-Type' = 'application/json'
}

Write-Host '[verify_openai_optional] models check'
$modelsResponse = Invoke-WebRequest -UseBasicParsing -Method Get -Uri 'https://api.openai.com/v1/models' -Headers $headers
if ($modelsResponse.StatusCode -ne 200) {
  throw "Models check failed with HTTP $($modelsResponse.StatusCode)"
}

Write-Host '[verify_openai_optional] responses search check'
$body = @{
  model = 'gpt-4.1-mini'
  input = 'Return a short Russian confirmation that web search is available.'
  tools = @(
    @{
      type = 'web_search_preview'
      search_context_size = 'low'
    }
  )
} | ConvertTo-Json -Depth 6

$responsesCheck = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'https://api.openai.com/v1/responses' -Headers $jsonHeaders -Body $body
if ($responsesCheck.StatusCode -ne 200) {
  throw "Responses check failed with HTTP $($responsesCheck.StatusCode)"
}

$payload = $responsesCheck.Content | ConvertFrom-Json
${summary} = $payload.output_text
if ([string]::IsNullOrWhiteSpace($summary) -and $payload.output) {
  foreach ($item in $payload.output) {
    if (-not $item.content) {
      continue
    }

    foreach ($content in $item.content) {
      if ($content.text -and -not [string]::IsNullOrWhiteSpace($content.text)) {
        $summary = $content.text.Trim()
        break
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($summary)) {
      break
    }
  }
}

if ([string]::IsNullOrWhiteSpace($summary)) {
  throw 'Responses check returned no readable summary text'
}

Write-Host '[verify_openai_optional] OK'