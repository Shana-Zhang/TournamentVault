$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot 'submission'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$stage = Join-Path $outputDir ('stage-' + [guid]::NewGuid().ToString('N'))
$packageRoot = Join-Path $stage '21317896_ZhangShihan_TournamentVault'
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
$include = @('contracts','test','scripts','docs','audit','evidence','deployment','ui','reference','README.md','run.ps1','package.json','package-lock.json','hardhat.config.js','.solcover.js','.env.example','.gitignore')
foreach ($item in $include) {
    $source = Join-Path $projectRoot $item
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $packageRoot -Recurse }
}
# Omit superseded working reports from the staged final submission.
foreach ($workingName in @('TournamentVault_Report_Working.docx','TournamentVault_Report_Working.pdf')) {
    $stagedWorkingReport = Join-Path (Join-Path $packageRoot 'docs') $workingName
    if (Test-Path -LiteralPath $stagedWorkingReport) { Remove-Item -LiteralPath $stagedWorkingReport }
}
$archive = Join-Path $outputDir '21317896_ZhangShihan_CSIT5760_FinalProject.zip'
Compress-Archive -LiteralPath $packageRoot -DestinationPath $archive -Force
Write-Output $archive
