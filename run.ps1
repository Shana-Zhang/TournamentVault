param(
    [ValidateSet('check','compile','test','coverage','demo','demo:sepolia','analyze','preflight','serve','node','deploy:local','deploy:local:v3','deploy:sepolia','verify:sepolia','deploy:sepolia:v2','smoke:sepolia:v2','verify:sepolia:v2','check:sepolia:v2','deploy:sepolia:v3','verify:sepolia:v3','check:sepolia:v3','online','package')]
    [string]$Task = 'check'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$installedNode = Get-Command node.exe -ErrorAction SilentlyContinue
$candidates = @()
if ($installedNode) { $candidates += $installedNode.Source }
$candidates += @('D:\Program Files\nodejs\node.exe', 'C:\Program Files\nodejs\node.exe')
$runtime = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$runtime) { throw 'Install Node.js 22 or 24, then reopen this terminal.' }
$env:Path = (Split-Path -Parent $runtime) + ';' + $env:Path
$cli = Join-Path $PSScriptRoot 'node_modules/hardhat/internal/cli/cli.js'
if (!(Test-Path -LiteralPath $cli)) { throw 'Dependencies are missing. Run npm ci first.' }
function Invoke-NodeTask([string[]]$TaskArgs) {
    & $runtime @TaskArgs
    if ($LASTEXITCODE -ne 0) { throw "Task failed with exit code $LASTEXITCODE" }
}
switch ($Task) {
    'check' { Invoke-NodeTask @($cli, 'compile'); Invoke-NodeTask @($cli, 'test'); Invoke-NodeTask @('scripts/analyze.js') }
    { $_ -in 'compile','test','coverage','node' } { Invoke-NodeTask @($cli, $Task) }
    'demo' { Invoke-NodeTask @($cli, 'run', 'scripts/demo.js') }
    'demo:sepolia' { Invoke-NodeTask @($cli, 'run', 'scripts/demo-sepolia.js', '--network', 'sepolia') }
    'analyze' { Invoke-NodeTask @('scripts/analyze.js') }
    'preflight' { Invoke-NodeTask @('scripts/preflight.js') }
    'serve' { Invoke-NodeTask @('scripts/serve.js') }
    'deploy:local' { Invoke-NodeTask @($cli, 'run', 'scripts/deploy.js', '--network', 'localhost') }
    'deploy:local:v3' { Invoke-NodeTask @($cli, 'run', 'scripts/deploy-local-v3.js', '--network', 'localhost') }
    'deploy:sepolia' { Invoke-NodeTask @($cli, 'run', 'scripts/deploy.js', '--network', 'sepolia') }
    'verify:sepolia' { Invoke-NodeTask @($cli, 'run', 'scripts/verify.js', '--network', 'sepolia') }
    'deploy:sepolia:v2' { Invoke-NodeTask @($cli, 'run', 'scripts/deploy-v2.js', '--network', 'sepolia') }
    'smoke:sepolia:v2' { Invoke-NodeTask @($cli, 'run', 'scripts/smoke-v2-sepolia.js', '--network', 'sepolia') }
    'verify:sepolia:v2' { Invoke-NodeTask @($cli, 'run', 'scripts/verify-v2.js', '--network', 'sepolia') }
    'check:sepolia:v2' { Invoke-NodeTask @('scripts/read-only-check.js', 'sepolia-v2') }
    'deploy:sepolia:v3' { Invoke-NodeTask @($cli, 'run', 'scripts/deploy-v3.js', '--network', 'sepolia') }
    'verify:sepolia:v3' { Invoke-NodeTask @($cli, 'run', 'scripts/verify-v3.js', '--network', 'sepolia') }
    'check:sepolia:v3' { Invoke-NodeTask @('scripts/read-only-check.js', 'sepolia-v3') }
    'online' { & (Join-Path $PSScriptRoot 'scripts/complete-online.ps1') }
    'package' { & (Join-Path $PSScriptRoot 'scripts/package.ps1') }
}
