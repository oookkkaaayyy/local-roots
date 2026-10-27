"""Validate private original UDisc XLSX inputs against committed anonymized fixtures."""
import hashlib, json, pathlib, sys, zipfile, xml.etree.ElementTree as ET

HERE=pathlib.Path(__file__).resolve().parent
FIXTURES=HERE/'fixtures'/'authentic-udisc'
NS={'a':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','pr':'http://schemas.openxmlformats.org/package/2006/relationships'}

def rows_from_xlsx(path):
    with zipfile.ZipFile(path) as z:
        names=z.namelist();shared=[]
        if 'xl/sharedStrings.xml' in names:
            root=ET.fromstring(z.read('xl/sharedStrings.xml'))
            shared=[''.join(t.text or '' for t in si.findall('.//a:t',NS)) for si in root.findall('a:si',NS)]
        wb=ET.fromstring(z.read('xl/workbook.xml'));rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        targets={r.attrib['Id']:r.attrib['Target'] for r in rels.findall('pr:Relationship',NS)}
        sheet=wb.find('a:sheets/a:sheet',NS);target=targets[sheet.attrib['{'+NS['r']+'}id']].lstrip('/')
        if not target.startswith('xl/'):target='xl/'+target
        root=ET.fromstring(z.read(target));out=[]
        for rn in root.findall('.//a:sheetData/a:row',NS):
            row=[]
            for cell in rn.findall('a:c',NS):
                letters=''.join(c for c in cell.attrib['r'] if c.isalpha());idx=0
                for ch in letters.upper():idx=idx*26+ord(ch)-64
                idx-=1
                while len(row)<=idx:row.append('')
                v=cell.find('a:v',NS);value='' if v is None else v.text or ''
                if cell.attrib.get('t')=='s' and value:value=shared[int(value)]
                elif cell.attrib.get('t')=='inlineStr':value=''.join(t.text or '' for t in cell.findall('.//a:t',NS))
                elif value:
                    try:
                        num=float(value);value=int(num) if num.is_integer() else num
                    except ValueError:pass
                row[idx]=value
            out.append(row)
        return sheet.attrib.get('name',''),out

def main(directory):
    root=pathlib.Path(directory); expected={'2026-03-03':5,'2026-04-18':7,'2026-05-23':6,'2026-06-20':7}
    for date,count in expected.items():
        path=root/f'{date}.xlsx';fixture=json.loads((FIXTURES/f'{date}.json').read_text()); digest=hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest==fixture['sourceWorkbookSHA256'],f'{date}: raw source SHA-256 mismatch'
        sheet,rows=rows_from_xlsx(path);assert sheet==fixture['sheetName'],f'{date}: worksheet mismatch'
        headers=[str(h).strip().lower() for h in rows[0]]
        assert len(headers)==28 and len(set(headers))==28,f'{date}: expected 28 distinct source columns'
        assert len(rows)-1==count==fixture['teamCount'],f'{date}: team count mismatch'
        positions=headers.index('position');names=headers.index('name');usernames=headers.index('usernames');holes=[headers.index(f'hole_{i}') for i in range(1,19)]
        for i,(raw,safe) in enumerate(zip(rows[1:],fixture['rows']),1):
            assert str(raw[positions])==str(safe['position']),f'{date}: rank mismatch at row {i}'
            assert len(str(raw[names]).split('&'))==len(safe['name'].split('&')),f'{date}: team-member count mismatch at row {i}'
            assert len(str(raw[usernames]).split(','))==len(safe['usernames'].split(',')),f'{date}: username count mismatch at row {i}'
            score=[int(raw[c]) for c in holes];assert len(score)==18 and sum(score)==int(raw[headers.index('event_total_score')]),f'{date}: hole score/absolute total mismatch at row {i}'
            for column in ('event_relative_score','event_total_score','round_relative_score','round_total_score'):
                assert raw[headers.index(column)]==safe[column],f'{date}: {column} mismatch at row {i}'
        tied=sum(str(r[positions]).startswith('T') for r in rows[1:])
        print(f'PASS {date}: {count} teams, {tied} tied-position rows, 18/18 holes complete, source SHA-256 {digest}')

if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Usage: python3 tests/validate-authentic-udisc-xlsx.py /path/to/private-xlsx-directory')
    main(sys.argv[1])
