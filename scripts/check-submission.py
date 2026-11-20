"""Check the local submission ZIP without printing credential values."""
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
import hashlib, json, re

ROOT = Path(__file__).resolve().parents[1]
archive = ROOT / 'submission/21317896_ZhangShihan_CSIT5760_FinalProject.zip'
required = ['contracts/LearningRewardToken.sol', 'contracts/TournamentVault.sol',
            'contracts/TournamentVaultV3.sol', 'test/v3-prize.test.js', 'docs/prize-design-v3.md',
            'contracts/LRTExchange.sol', 'package-lock.json', 'evidence/test-cases.json',
            'evidence/sepolia-tournament-demo.json', 'docs/TournamentVault_Final_Report.docx',
            'docs/TournamentVault_Final_Report.pdf', 'deployment/sepolia-v2.json',
            'deployment/sepolia-v3.json', 'deployment/sepolia-v3-read-only-check.json',
            'scripts/deploy-v2.js', 'scripts/deploy-v3.js', 'scripts/verify-v3.js',
            'ui/config.json', 'docs/deployment-information.md', 'docs/project-report.md',
            'audit/slither-v3-review.md']
secrets = []
env = ROOT / '.env'
if env.exists():
    for line in env.read_text(encoding='utf-8-sig').splitlines():
        if '=' not in line or line.lstrip().startswith('#'): continue
        key, value = line.split('=', 1)
        value = value.strip().strip('\"\'')
        # This documented anonymous endpoint contains no credentials.
        if key.strip().endswith('RPC_URL') and value == 'https://ethereum-sepolia-rpc.publicnode.com': continue
        if re.search(r'PRIVATE_KEY|API_KEY|SECRET|PASSWORD|RPC_URL', key) and len(value) >= 12:
            secrets.append(value.encode())
            if re.fullmatch(r'0x[0-9a-fA-F]{64}', value): secrets.append(value[2:].encode())
forbidden, matches = [], []
def credential_match(data):
    return any(secret in data for secret in secrets)
with ZipFile(archive) as z:
    bad_crc = z.testzip()
    names = z.namelist()
    files = [n for n in names if not n.endswith('/')]
    root = names[0].split('/')[0] + '/'
    for name in files:
        relative = name.removeprefix(root)
        parts = relative.split('/')
        if any(p in {'node_modules', '.git', '.local', '__pycache__', 'cache', 'artifacts'} for p in parts) or parts[-1] == '.env':
            forbidden.append(relative)
        if 'TournamentVault_Report_Working.' in relative: forbidden.append(relative)
        data = z.read(name)
        hit = credential_match(data)
        if name.endswith('.docx'):
            with ZipFile(BytesIO(data)) as document:
                hit = hit or any(credential_match(document.read(n)) for n in document.namelist())
        if hit: matches.append(relative)
    missing = [name for name in required if root + name not in files]
    current_mismatch = [name for name in required if root + name in files and z.read(root + name) != (ROOT / name).read_bytes()]
report = {'status': 'Pass' if not (forbidden or matches or missing or bad_crc or current_mismatch) else 'Fail',
          'archive': str(archive), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
          'fileCount': len(files), 'requiredMissing': missing,
          'zipCRCValid': bad_crc is None, 'requiredCurrentFileMismatch': current_mismatch,
          'forbiddenEntries': forbidden, 'credentialMatchEntries': matches,
          'credentialValuesPrinted': False}
(ROOT / 'submission/final-package-audit.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
if report['status'] != 'Pass': raise SystemExit(1)
