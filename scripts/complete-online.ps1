$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (!(Test-Path -LiteralPath '.env')) { throw 'Create .env with the RPC, testnet wallet and explorer key first.' }
$runtime = (Get-Command node.exe -ErrorAction Stop).Source
$cli = Join-Path (Get-Location).Path 'node_modules/hardhat/internal/cli/cli.js'
function Invoke-Stage([string]$Label, [string[]]$TaskArgs) {
    Write-Host $Label
    & $runtime @TaskArgs
    if ($LASTEXITCODE -ne 0) { throw "$Label failed. Fix the reported issue and rerun the same command." }
}
Invoke-Stage 'Checking Sepolia RPC and wallet balance' @('scripts/preflight.js')
Invoke-Stage 'Deploying or resuming the three Sepolia contracts' @($cli, 'run', 'scripts/deploy.js', '--network', 'sepolia')
Invoke-Stage 'Verifying contract source on Etherscan' @($cli, 'run', 'scripts/verify.js', '--network', 'sepolia')
Write-Host 'Deployment and verification complete. Records: deployment/sepolia.json'
