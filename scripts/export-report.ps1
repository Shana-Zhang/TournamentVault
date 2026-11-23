param(
    [string]$Document = (Join-Path (Split-Path -Parent $PSScriptRoot) 'docs\TournamentVault_Final_Report.docx')
)
$ErrorActionPreference = 'Stop'
$reportPath = (Resolve-Path -LiteralPath $Document).Path
$pdfPath = [IO.Path]::ChangeExtension($reportPath, '.pdf')
$wordApp = New-Object -ComObject Word.Application
$wordApp.Visible = $false
$wordApp.DisplayAlerts = 0
try {
    $wordDoc = $wordApp.Documents.Open($reportPath, $false, $false)
    $wordDoc.Fields.Update() | Out-Null
    foreach ($toc in $wordDoc.TablesOfContents) { $toc.Update() }
    $wordDoc.Repaginate()
    foreach ($toc in $wordDoc.TablesOfContents) { $toc.Update() }
    $wordDoc.Save()
    $wordDoc.ExportAsFixedFormat($pdfPath, 17)
    Write-Output ('Pages: ' + $wordDoc.ComputeStatistics(2))
    $wordDoc.Close(0)
} finally {
    $wordApp.Quit()
}
