"""Local raw revision recovery and 3074 insights; no collector or SQLite."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import resource
import sys
import time
parser=argparse.ArgumentParser();parser.add_argument('--root',default='.');parser.add_argument('--sizes',default='100,200,400,800,1600');opts=parser.parse_args()
root=Path(opts.root).resolve();sys.path[:0]=[str(root/'ames/agent'),str(root/'ames/factory-engine')]
from integrated_snapshot_history import recover_snapshot_line
from engine_bridge import build_trace_insights
LINE='TAN10101'
def measure(kind,size,call):
    wall,cpu=time.perf_counter(),time.process_time();value=call()
    print(json.dumps({'kind':kind,'size':size,'wall_ms':round((time.perf_counter()-wall)*1000,3),
        'cpu_ms':round((time.process_time()-cpu)*1000,3),'max_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        'sha256':hashlib.sha256(json.dumps(value,sort_keys=True,default=str).encode()).hexdigest()}),flush=True)
    return value
for size in map(int,opts.sizes.split(',')):
    records=[];items=[];history=[]
    for i in range(size):
        sn=f'P{i}';d={'pcba_sn':sn,'line':LINE,'defect_code':'D','defect_desc':'Camera impurity','defect_time':'2026-11-03 09:00:00','product_model':'CPH-SYNTHETIC'}
        records.append(d)
        raw={'query_sn':sn,'query_confirmation':'EXACT_QUERY_ROW','rows':[{'Barcode':sn,'Aut Cmf1':'PCBA','Sn Type':'PCBA','Aut Cmf7':str(i),'Bind Time':'2026-11-03T10:00:00Z','Iss Status':'Y'}]}
        items.append({'pcba_sn':sn,'status':'COMPLETE','current_defects':[d],'base_query':raw,
            'defect_traces':[{'status':'COMPLETE','defect':d,'trace_3074':{'results':[{
                'item_sn':f'M{i}','item_type':'Camera','current_pcba_confirmed':True,'previous_pcba_count':0,'previous_pcbas':[],
                'total_pcba_count_known_now':1,'reuse_count_known_now':0}]}}]})
        history.append({'pcba_sn':sn,'status':'COMPLETE','result':{'rows':[{'Defect Hist Seq':0,'Defect Code':'OLD','Defect Description':'Camera impurity'}]}})
    payload={'trace_3074':{'items':items},'trace_2114':{'pcbas':history}}
    versions=[deepcopy(payload) for _ in range(4)]
    recovered,_=measure('recover_4_raw_revisions',size,lambda:recover_snapshot_line(versions,LINE,records))
    measure('3074_insights',size,lambda:build_trace_insights(root/'ames/factory-engine',recovered,line=LINE))
