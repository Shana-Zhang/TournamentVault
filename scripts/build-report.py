"""Fill the retained course template with evidenced project content; never edit the reference."""
from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, re, sys
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.local/report-work'
WORK.mkdir(parents=True, exist_ok=True)
REF = ROOT / 'reference/CSIT5760_Final_Project_Report_Template.docx'
FINAL = '--final' in sys.argv
package_audit = ROOT / 'submission/final-package-audit.json'
PACKAGE_REVIEWED = package_audit.exists() and json.loads(package_audit.read_text()).get('status') == 'Pass'
OUT = ROOT / ('docs/TournamentVault_Final_Report.docx' if FINAL else 'docs/TournamentVault_Report_Working.docx')
original_hash = hashlib.sha256(REF.read_bytes()).hexdigest()
with ZipFile(REF) as z:
    baseline = {n: {'bytes': len(z.read(n)), 'sha256': hashlib.sha256(z.read(n)).hexdigest()} for n in z.namelist()}
(WORK/'template-package-inventory.json').write_text(json.dumps({'referenceSHA256': original_hash, 'parts': baseline}, indent=2))

doc = Document(REF)
tables = list(doc.tables)
prototype = deepcopy(tables[12]._tbl)
def txt(node):
    return ''.join(node.itertext())

def paragraph(text, code=False):
    p = OxmlElement('w:p')
    pp = OxmlElement('w:pPr'); p.append(pp)
    st = OxmlElement('w:pStyle'); st.set(qn('w:val'), 'BodyText'); pp.append(st)
    if code:
        spacing = OxmlElement('w:spacing'); spacing.set(qn('w:after'),'0'); spacing.set(qn('w:line'),'210'); spacing.set(qn('w:lineRule'),'auto'); pp.append(spacing)
    r=OxmlElement('w:r'); p.append(r)
    if code:
        rp=OxmlElement('w:rPr'); r.append(rp)
        font=OxmlElement('w:rFonts'); font.set(qn('w:ascii'),'Consolas'); font.set(qn('w:hAnsi'),'Consolas'); rp.append(font)
        size=OxmlElement('w:sz'); size.set(qn('w:val'),'17'); rp.append(size)
    t=OxmlElement('w:t'); t.set(qn('xml:space'),'preserve'); t.text=text; r.append(t)
    if not code and re.search(r'\[[^\]]+\]\([^)]+\)',text):
        p.remove(r); add_linked_text(p,text)
    return p

def add_linked_text(p,text):
    offset=0
    for match in re.finditer(r'\[([^\]]+)\]\(([^)]+)\)',text):
        if match.start()>offset:
            r=OxmlElement('w:r'); t=OxmlElement('w:t'); t.set(qn('xml:space'),'preserve'); t.text=text[offset:match.start()]; r.append(t); p.append(r)
        h=OxmlElement('w:hyperlink'); h.set(qn('r:id'),doc.part.relate_to(match.group(2),RT.HYPERLINK,is_external=True))
        r=OxmlElement('w:r'); rp=OxmlElement('w:rPr'); style=OxmlElement('w:rStyle'); style.set(qn('w:val'),'Hyperlink'); rp.append(style); r.append(rp)
        t=OxmlElement('w:t'); t.text=match.group(1); r.append(t); h.append(r); p.append(h); offset=match.end()
    if offset<len(text):
        r=OxmlElement('w:r'); t=OxmlElement('w:t'); t.set(qn('xml:space'),'preserve'); t.text=text[offset:]; r.append(t); p.append(r)

def clean(text):
    return text.replace('`','').replace('**','')

def table(rows):
    out = deepcopy(prototype)
    header = deepcopy(out.findall(qn('w:tr'))[0]); body = deepcopy(out.findall(qn('w:tr'))[1])
    for tr in list(out.findall(qn('w:tr'))): out.remove(tr)
    n=len(rows[0]); widths=[round(9648/n)]*n
    if rows[0][0]=='Role': widths=[2000,7648]
    if rows[0][0]=='Test ID': widths=[700,2400,1900,3648,1000]
    if rows[0][0]=='Contract': widths=[1700,2700,3500,1748]
    props=out.find(qn('w:tblPr')); layout=props.find(qn('w:tblLayout'))
    if layout is None: layout=OxmlElement('w:tblLayout'); props.append(layout)
    layout.set(qn('w:type'),'fixed')
    grid=out.find(qn('w:tblGrid'))
    for c in list(grid): grid.remove(c)
    for width in widths:
        c=OxmlElement('w:gridCol'); c.set(qn('w:w'),str(width)); grid.append(c)
    for index, values in enumerate(rows):
        tr=deepcopy(header if index==0 else body)
        cells=tr.findall(qn('w:tc'))
        while len(cells)<n: tr.append(deepcopy(cells[-1])); cells=tr.findall(qn('w:tc'))
        for c in cells[n:]: tr.remove(c)
        trp=tr.find(qn('w:trPr'))
        if trp is None: trp=OxmlElement('w:trPr'); tr.insert(0,trp)
        trp.append(OxmlElement('w:cantSplit'))
        if trp is not None:
            for h in list(trp.findall(qn('w:trHeight'))): trp.remove(h)
        for cell,value,width in zip(tr.findall(qn('w:tc')),values,widths):
            tcpr=cell.find(qn('w:tcPr'))
            tcw=tcpr.find(qn('w:tcW'))
            if tcw is not None: tcw.set(qn('w:w'),str(width))
            sample=deepcopy(cell.find(qn('w:p')))
            for child in list(cell):
                if child.tag!=qn('w:tcPr'): cell.remove(child)
            pp=sample.find(qn('w:pPr'))
            if index==0:
                if pp is None: pp=OxmlElement('w:pPr'); sample.insert(0,pp)
                pp.append(OxmlElement('w:keepNext'))
            for child in list(sample):
                if child.tag!=qn('w:pPr'): sample.remove(child)
            r=OxmlElement('w:r')
            if index==0:
                rp=OxmlElement('w:rPr'); bold=OxmlElement('w:b'); rp.append(bold)
                color=OxmlElement('w:color'); color.set(qn('w:val'),'FFFFFF'); rp.append(color); r.append(rp)
            value=clean(str(value))
            if index>0 and re.search(r'\[[^\]]+\]\([^)]+\)',value): add_linked_text(sample,value)
            else:
                t=OxmlElement('w:t'); t.text=value; r.append(t); sample.append(r)
            cell.append(sample)
        out.append(tr)
    return out

def blocks(text):
    lines=text.strip().splitlines(); result=[]; i=0; code=False
    while i<len(lines):
        line=lines[i].strip()
        if line.startswith('```'): code=not code; i+=1; continue
        if code: result.append(paragraph(lines[i],True)); i+=1; continue
        if not line: i+=1; continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                values=[x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.match(r'^:?-+:?$',x) for x in values): rows.append(values)
                i+=1
            result.append(table(rows)); result.append(paragraph('')); continue
        para=[line]; i+=1
        while i<len(lines) and lines[i].strip() and not lines[i].lstrip().startswith(('|','```')):
            para.append(lines[i].strip()); i+=1
        result.append(paragraph(clean(' '.join(para))))
    return result

md=(ROOT/'docs/project-report.md').read_text(encoding='utf-8-sig')
sections={}; current=None; buf=[]
for line in md.splitlines():
    heading=re.match(r'^#{2,3}\s+(.*)',line)
    if heading:
        if current: sections[current]='\n'.join(buf)
        title=heading.group(1); number=re.match(r'\d+\.\d+',title)
        current=number.group(0) if number else title; buf=[]
    else: buf.append(line)
if current: sections[current]='\n'.join(buf)
sections['Abstract'] = ('TournamentVault V3 makes ETH the primary esports prize: the organizer escrows the exact ETH amount when creating fixed tournament rules, with an optional LRT bonus deposited when registration opens. Winners receive both prize assets according to the same ranked shares; cancellation returns the ETH prize and any funded bonus. Entry fees and the separate fixed-rate LRT exchange retain independent accounting. The V3 interface uses editable demonstration defaults of 0.05 ETH and 10,000 LRT; these are not final event terms.\n\n'
    'The repository retains V1 and V2 as immutable historical deployments and adds V3 source and tests. V1 vault address: 0xB1BD230B6B97dC4401E61b7721579B241a9CCdbc. V2 vault address: 0x9ab90329fdd0D1B3729c6eAb4bf78F354d63E3de. V2 added organizer-cancellation safeguards; V3 changes the prize model. The existing token and exchange are reused by V3. The suite now includes 64 passing automated scenarios, including seven V3-specific escrow, payout, optional-bonus, refund and rejected-payment cases. Trusted off-chain result decisions and finite LRT redemption liquidity remain explicit limitations.')
sections['4.1'] += '\n\n| Setting | Value |\n| --- | --- |\n| Network | Ethereum Sepolia |\n| Chain ID | 11155111 |\n| Solidity | v0.8.26+commit.8a97fa7a |\n| Optimizer | Enabled, 200 runs |\n| EVM | Cancun |\n| Hardhat | 2.29.2 |\n| OpenZeppelin | 5.6.1 |\n| Deployer | 0xdE3d23a1245f07859279b759b528615Eb55BcAc4 |'
current_record = 'sepolia-v3' if (ROOT/'deployment/sepolia-v3.json').exists() else 'sepolia-v2'
deployment=json.loads((ROOT/f'deployment/{current_record}.json').read_text())
if current_record == 'sepolia-v3':
    sections['4.2']='V3 is the current Sepolia implementation. It reuses the existing token and exchange and deploys a new immutable ETH-prize vault. Earlier vaults remain unchanged: V1 0xB1BD230B6B97dC4401E61b7721579B241a9CCdbc; V2 0x9ab90329fdd0D1B3729c6eAb4bf78F354d63E3de. The table links the current V3 deployment records and verified source.\n\n| Contract | Address | Tx and block | Verification |\n| --- | --- | --- | --- |\n'
else:
    sections['4.2']='All three V2 deployments are confirmed on Ethereum Sepolia. The original V1 deployment remains recorded separately in deployment/sepolia.json. The addresses below link directly to verified V2 source; transaction links open their deployment receipts.\n\n| Contract | Address | Tx and block | Verification |\n| --- | --- | --- | --- |\n'
for c in deployment['contracts']:
    sections['4.2']+=f"| {c['name']} | [{c['address']}]({c['explorer']}) | [{c['transactionHash']}](https://sepolia.etherscan.io/tx/{c['transactionHash']}); block {c['blockNumber']} | [Verified source]({c['explorer']}) |\n"
cases=json.loads((ROOT/'evidence/test-cases.json').read_text())['cases']
assert len(cases)==64 and all(c['status']=='Pass' for c in cases), 'Run the complete 64-case suite before building the report'
selected={'T01','V03','V07','V11','R03','R08','R09','F02','F09','F12','X05','X06','X11','W02','P01','P02','P03','P04','P05','P06','P07'}
case_rows=[['Test ID','Purpose / precondition','Steps / input','Expected / actual','Status']]
for c in cases:
    if c['id'] in selected: case_rows.append([c['id'],c['purpose']+'; '+c['preconditions'],c['input'],c['expected']+'; actual: '+c['actual'],c['status']])
sections['5.2']+='\n\n'+'\n'.join('| '+' | '.join(row)+' |' for row in [case_rows[0],['---']*5,*case_rows[1:]])
public_demo=json.loads((ROOT/'evidence/sepolia-tournament-demo.json').read_text())
assert all(t['status']==1 for t in public_demo['transactions'])
if FINAL:
    assert [t['state'] for t in public_demo['tournaments']]==['Cancelled','Cancelled','Finalized']
    assert public_demo['vaultLRT']=='0.0' and public_demo['vaultETH']=='0.0'
    assert public_demo['organizerCreditETH']=='0.0' and public_demo['exchange']['account5CreditETH']=='0.0'
    assert all(p['prizeCreditLRT']=='0.0' for p in public_demo['players'])
sections['5.3']+=f"\n\nHistorical V1 demonstration snapshot: {public_demo['checkedAt']}, Sepolia block {public_demo['block']}. All {len(public_demo['transactions'])} collected V1 vault/exchange receipts succeeded. The V1 settlement and exchange evidence remains historical and the V1 contracts were not modified.\n\n| V1 final check | Observed value |\n| --- | --- |\n| Tournaments 1 / 2 / 3 | Cancelled / Cancelled / Finalized |\n| Player balances: accounts 4 / 5 / 6 | 300 / 500 / 200 LRT |\n| Outstanding player prize credits | 0 LRT for all three players |\n| Vault token / ETH balances | 0 LRT / 0 ETH |\n| Organizer fee credit | 0 ETH after withdrawing 0.003 ETH |\n| Exchange inventory / reserve | 10,000 LRT / 0.001 ETH |\n| Account 5 exchange credit | 0 ETH after redemption withdrawal |\n\n| Public operation | Receipt link | Gas used | Result |\n| --- | --- | --- | --- |\n"
for tx in public_demo['transactions']:
    related=[e for e in public_demo['events'] if e['hash']==tx['hash']]
    labels=[]
    for e in related:
        label=e['event']
        if 'id' in e['args']: label+=f" #{e['args']['id']}"
        labels.append(label)
    label=', '.join(labels)
    sections['5.3']+=f"| {label} | [{tx['hash'][:14]}…](https://sepolia.etherscan.io/tx/{tx['hash']}) | {int(tx['gasUsed']):,} | Success |\n"
v2_check=json.loads((ROOT/'deployment/sepolia-v2-read-only-check.json').read_text())
smoke=json.loads((ROOT/'evidence/sepolia-v2-smoke.json').read_text())
assert all(c['receiptSuccess'] and c['runtimeMatchesLocalExcludingImmutables'] and c['explorer']['verified'] for c in v2_check['contracts'])
assert smoke['completedAt'] and smoke['checks']['state']==6 and smoke['checks']['playerCount']==0
sections['5.3']+=f"\n\nV2 was independently checked at Sepolia block {v2_check['blockNumber']}. All three V2 deployment receipts succeeded, deployed runtime bytecode matches the local build, and all sources are verified. The V2 smoke scenario created tournament #{smoke['checks']['tournamentId']}, opened it with a 1 LRT prize and zero entry fee, cancelled before anyone registered and returned the prize. The final player count was zero, and vault ETH/token liabilities were zero.\n\n| V2 smoke operation | Transaction | Status |\n| --- | --- | --- |\n"
for tx in smoke['transactions']:
    sections['5.3']+=f"| {tx['label']} | [{tx['hash'][:14]}…](https://sepolia.etherscan.io/tx/{tx['hash']}) | {tx['status']} |\n"
if current_record == 'sepolia-v3':
    v3_check=json.loads((ROOT/'deployment/sepolia-v3-read-only-check.json').read_text())
    v3_vault=next(c for c in v3_check['contracts'] if c['name']=='TournamentVaultV3')
    assert v3_vault['receiptSuccess'] and v3_vault['runtimeMatchesLocalExcludingImmutables'] and v3_vault['explorer']['verified']
    sections['5.3']+=f"\n\nV3 deployment was independently checked at Sepolia block {v3_check['blockNumber']}. Its deployment receipt succeeded; runtime bytecode and submitted source match the local build, and Etherscan reports verified source. At this read-only snapshot, tournamentCount, ETH liability and LRT liability are all zero. No tournament was created on V3 because the demonstration prize amounts remain unfinalized. The editable interface defaults are 0.05 ETH and 10,000 LRT."
sections['6.2']+='\n\n| ID / severity | Finding and impact | Affected code | Control / disposition | Status / retest |\n| --- | --- | --- | --- | --- |\n| V3 Slither | 28 combined findings across the full project; no High finding | V3 vault, reused token and exchange | Three V3 numeric locals rely on defined zero initialization; deadlines are intentional; ETH calls are guarded and checked. Full dispositions and raw JSON are in audit/slither-v3-review.md and audit/slither-v3.json. | 64 tests pass; V3 prize, cancellation, timeout and failed-transfer scenarios are covered. |\n| S05–07 Residual | Finite backing, timeout waiting and controller discretion | Exchange liquidity, cancellation recovery and result decisions | V3 ETH prize is escrowed at creation; LRT bonus remains an independent optional asset. | P01–P07; V2 timeout cases and Sepolia checks pass. |'
sections['7.2']='The historical V1 settlement and exchange demonstration is retained as evidence. V2 added participant-protective cancellation. V3 changes the prize model to ETH plus an optional LRT bonus and is deployed and verified at its own vault address. Sixty-four local scenarios pass, including seven V3 prize-flow and security tests. The V3 tournament count is zero at the recorded snapshot because the demonstration amounts remain unfinalized. Further work could include multisignature dispute governance, signed structured evidence, reserve monitoring and testing on a representative funded V3 event. No real esports match or production security assurance is asserted.'

# Reference-derived labelled architecture diagram.
img=Image.new('RGB',(1440,620),'white'); draw=ImageDraw.Draw(img)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',23)
small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',20)
def box(x,y,w,h,label):
    draw.rounded_rectangle((x,y,x+w,y+h),radius=12,outline='#00549f',width=3,fill='#eaf2f8')
    draw.multiline_text((x+18,y+18),label,font=font,fill='#172333',spacing=6)
def arrow(a,b,label):
    draw.line((a,b),fill='#00549f',width=4)
    x,y=b; draw.polygon([(x,y),(x-12,y-7),(x-12,y+7)],fill='#00549f')
    label_width=draw.textlength(label,font=small)
    draw.text(((a[0]+b[0]-label_width)/2,(a[1]+b[1])//2-34),label,font=small,fill='#172333')
box(25,220,290,150,'Organizer and players\nReferee and resolver')
box(440,220,300,150,'Web interface\nBrowser wallet signs')
box(930,35,470,140,'LearningRewardToken\nFixed supply ERC20 LRT')
box(930,235,470,140,'TournamentVault V3\nETH prizes and optional LRT bonus')
box(930,435,470,140,'LRTExchange\nToken inventory and ETH reserve')
arrow((315,295),(440,295),'connect')
arrow((740,250),(930,105),'optional bonus')
arrow((740,295),(930,305),'rules and fees')
arrow((740,340),(930,505),'buy and redeem')
draw.text((28,575),'Network: Ethereum Sepolia 11155111     Gameplay evidence remains off-chain; only hashes are recorded.',font=small,fill='#172333')
img_path=WORK/'architecture.png'; img.save(img_path)

# Keep the cover table and remove instruction/data placeholders that will be filled from evidence.
for t in tables[1:]: t._tbl.getparent().remove(t._tbl)
cover_values=['TournamentVault A Smart Contract Based Prize Pool for Esports Tournaments','Zhang Shihan','21317896','Pritom Rajkhowa','20 November 2026','V3 source and deployment record in submission archive; github.com/Shana-Zhang/TournamentVault','Ethereum Sepolia 11155111']
for row,value in zip(tables[0].rows,cover_values): row.cells[1].text=value
appendices={
 'A':'Complete production Solidity source is reproduced below and supplied in contracts/.',
 'B':'Deployment scripts: scripts/deploy-v3.js, scripts/verify-v3.js, scripts/preflight.js and scripts/sync-deployment.js. Reproduction: README.md and run.ps1. Compiler/network settings: hardhat.config.js. Only .env.example is included; the real .env and all private keys are excluded.',
 'C':'Complete automated tests: test/system.test.js, test/v3-prize.test.js and contracts/test/PaymentReceiver.sol. All 64 detailed expected/actual cases: evidence/test-cases.md and evidence/test-cases.json. Selected outputs: evidence/test-output.txt, coverage-output.txt, maximum-rank-gas.json and local-demo.json.',
 'D':'V2 Slither results: audit/slither-v2.json. The latest full-project V3 scan is in audit/slither-v3.json; its findings are interpreted in audit/slither-v3-review.md. Broader risk assessment: audit/security-review.md. Limited AST analysis: audit/static-analysis.json. Source code was not changed to silence detector warnings.',
 'E':'V3 deployment addresses, hashes and constructor arguments: deployment/sepolia-v3.json. Independent V3 chain/runtime/source check: deployment/sepolia-v3-read-only-check.json. V2 deployment retained in deployment/sepolia-v2.json; the original deployment retained in deployment/sepolia.json. Historical V1 lifecycle and V2 smoke evidence remain in evidence/sepolia-tournament-demo.json and evidence/sepolia-v2-smoke.json. No V3 tournament has been created.',
 'F':'Detailed architecture, state transitions and deadline semantics: docs/architecture.md. The figure in section 2.1 summarizes the current three-contract deployment and prize flows.\n\n| Submission material | Location and purpose |\n| --- | --- |\n| Final report | docs/TournamentVault_Final_Report.docx and PDF |\n| Source and reproduction | contracts/, scripts/, README.md and run.ps1 |\n| Pinned dependencies | package.json and package-lock.json |\n| Tests and coverage | test/ and evidence/; 64 scenarios passed |\n| Public deployment | deployment/sepolia-v3.json; V1/V2 addresses retained in version records |\n| Security review | audit/slither-v3-review.md and security-review.md |\n| Course template | Unmodified original retained in reference/ |'
}
current=None
for p in list(doc.paragraphs):
    text=p.text.strip()
    number=re.match(r'^(\d+\.\d+)\s',text)
    if number: current=number.group(1)
    elif text in ('Abstract','References'): current=text
    elif text.startswith('Appendix '):
        current='Appendix '+text[9]
        if current=='Appendix F': p.paragraph_format.page_break_before=True
    if text=='Individual Project Template': p.text='TournamentVault'; continue
    if text.startswith('Replace all bracketed') or text.startswith('Update the table'):
        p._p.getparent().remove(p._p); continue
    if text.startswith('[Write your response'):
        if current.startswith('Appendix '):
            letter=current[-1]; content=appendices[letter]
        else: content=sections.get(current,'')
        for element in blocks(content): p._p.addprevious(element)
        if current=='2.1':
            pic=doc.add_paragraph(); pic.add_run().add_picture(str(img_path),width=Inches(6.65))
            p._p.addprevious(pic._p)
            p._p.addprevious(paragraph('Figure 1 Wallet and contract architecture on Ethereum Sepolia'))
        if current=='Appendix A':
            for name in ['LearningRewardToken','TournamentVault','TournamentVaultV3','LRTExchange']:
                p._p.addprevious(paragraph('contracts/'+name+'.sol'))
                for line in (ROOT/'contracts'/f'{name}.sol').read_text().splitlines(): p._p.addprevious(paragraph(line,True))
        p._p.getparent().remove(p._p)
    elif text.startswith('[1] Author/Organisation'):
        for e in blocks(sections['References']): p._p.addprevious(e)
        p._p.getparent().remove(p._p)
    elif text.startswith('☐'):
        if (FINAL and PACKAGE_REVIEWED) or ('Report exported' not in text and 'unnecessary dependencies' not in text):
            p.text=text.replace('☐','☑',1)
        p.paragraph_format.keep_with_next='unnecessary dependencies' not in text

settings=doc.settings.element
update=settings.find(qn('w:updateFields'))
if update is None: update=OxmlElement('w:updateFields'); settings.append(update)
update.set(qn('w:val'),'true')
tmp=WORK/'report-built.docx'; doc.save(tmp)
# Preserve all opaque reference parts byte-for-byte; retain only intentional document/media edits.
editable={'word/document.xml','word/_rels/document.xml.rels','word/settings.xml','[Content_Types].xml'}
with ZipFile(REF) as original, ZipFile(tmp) as generated, ZipFile(OUT,'w',ZIP_DEFLATED) as out:
    for info in original.infolist(): out.writestr(info,generated.read(info.filename) if info.filename in editable else original.read(info.filename))
    for name in generated.namelist():
        if name not in baseline: out.writestr(name,generated.read(name))
with ZipFile(OUT) as z:
    changed=[n for n in baseline if hashlib.sha256(z.read(n)).hexdigest()!=baseline[n]['sha256']]
    assert set(changed)<=editable, changed
assert hashlib.sha256(REF.read_bytes()).hexdigest()==original_hash
(WORK/'report-structure-check.json').write_text(json.dumps({'referenceSHA256':original_hash,'changedParts':changed,'output':str(OUT),'status':'Final candidate' if FINAL else 'Working copy; render and inspect before delivery'},indent=2))
print(OUT)
