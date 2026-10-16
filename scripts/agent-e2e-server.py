"""Real agent/SQLite/HTTP, synthetic MES boundaries. Never contacts a factory."""
import importlib.util
import json
import pathlib
import shutil
import sys
import time
import zipfile
from http.server import ThreadingHTTPServer

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
from mes_scheduler import MES,mes_call,Cancelled
temp_root=pathlib.Path(sys.argv[1])
target=temp_root/'agent.py'
shutil.copyfile(ROOT/'ames'/'agent'/'agent.py',target)
spec=importlib.util.spec_from_file_location('e2e_agent',target)
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
a._tcp_probe=lambda *args,**kw:True
a.discover_engine=lambda *args:ROOT


def build_synthetic_xlsx(path):
    """Small structurally valid XLSX used only by the HTTP download boundary."""
    path=pathlib.Path(path)
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
 <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>''')
        z.writestr('_rels/.rels','''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>''')
        z.writestr('xl/workbook.xml','''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheets><sheet name="E2E" sheetId="1" r:id="rId1"/></sheets>
</workbook>''')
        z.writestr('xl/_rels/workbook.xml.rels','''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>''')
        z.writestr('xl/worksheets/sheet1.xml','''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>E2E</t></is></c></row></sheetData></worksheet>''')
    return path


synthetic_xlsx=build_synthetic_xlsx(temp_root/'e2e-export.xlsx')
a.export_team_excel=lambda lines:{'path':str(synthetic_xlsx),'lines':list(lines or [])}
a.export_snapshot_excel=lambda snapshot_id=None:{'path':str(synthetic_xlsx),'snapshot_id':snapshot_id}

@mes_call
def collect(**scope):
    assert MES.snapshot()['busy']
    records=[{'line':line,'pcba_sn':'P','product_model':product,'defect_code':'D','defect_desc':'Synthetic','defect_time':f'2026-10-09T10:0{i}:00Z'} for line in scope['lines'] for i,product in enumerate(['CPH2859','CPH2859V'])]
    return {'lines':scope['lines'],'records':records,'records_count':len(records),'line_metrics':[{'line':line,'fpy':90,'quantity':100} for line in scope['lines']]}

@mes_call
def deep(engine,records,**kw):
    assert MES.snapshot()['busy']
    trace={'items':[{'pcba_sn':r['pcba_sn'],'current_defects':[r],'defect_traces':[{'defect_key':r['defect_key'],'trace_3074':{'results':[{'item_sn':'M','item_type':'RAM','previous_pcba_count':1,'total_pcba_count_known_now':2,'previous_pcbas':['OLD'],'bind_time_utc':'2026-10-08T10:00:00Z'}]}}]} for r in records]}
    history={'pcbas':[{'pcba_sn':'P','status':'COMPLETE','result':{'rows':[{'Defect Hist Seq':'1','Defect Code':'D','Defect Description':'Synthetic','Repair Status':'Y'}]}}]}
    if kw.get('event_callback'):kw['event_callback']({'stage':'2114','kind':'pcba','pcba':'P','status':'COMPLETE','current':1,'total':1,'state':{'result':history['pcbas'][0]['result']}})
    return {'trace_3074':trace,'trace_2114':history}

@mes_call
def lookup(engine,sn,**kw):
    assert MES.snapshot()['busy']
    if sn=='ERROR':raise RuntimeError('Synthetic MES failure')
    if sn=='BLOCK':
        while True:
            if MES.context.job['token'].is_set():raise Cancelled()
            time.sleep(.02)  # Simulated remote latency, not production scheduling.
    return {'sn':sn,'detected_type':'PCBA','summary':{'history_rows':1},'warnings':[]}

a.collect_live_3028=collect;a.run_deep_v016_records=deep;a.run_individual_lookup=lookup
a.build_trace_insights=lambda engine,payload,line=None:{'schema':'ames-insights-v1','line':line,'pcba_kpis':[['PCBAs',1]],'material_kpis':[['Materiais únicos 2º+ uso',1]],'component_types':[{'Tipo material':'RAM'}],'drilldowns':{}}
server=ThreadingHTTPServer(('127.0.0.1',0),a.Handler)
a.recover_jobs()
print('READY '+str(server.server_port),flush=True)
server.serve_forever()