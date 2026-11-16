"""Read historical collectors from Git into temporary files; never connect CDP.

Run from a complete checkout: python3 scripts/audit/codex_latency_compare.py
Times below are simulated clock budgets, NOT real factory latency or p95.
"""
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'ames/factory-engine'))
sys.path.insert(0,str(ROOT/'scripts/fixtures'))
from ames_3022_harness import Ext3022Fixture, history_rows

REFS=('c1b13d','f22e344','f78ce7cb','60ecef60','16980fb5','7e49cc45','eedacc65')
out=[]
with tempfile.TemporaryDirectory() as td:
 for ref in REFS:
  path=Path(td)/(ref+'.py')
  path.write_bytes(subprocess.check_output(['git','show',ref+':ames/factory-engine/ames/tela_3022.py'],cwd=ROOT))
  spec=importlib.util.spec_from_file_location('audit_collector_'+ref,path)
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  for case,kwargs in [('healthy',{}),('unstable_2_4s',{'trial_not_ready_until_s':2.4}),
                       ('stuck',{'trial_not_ready_until_s':120})]:
   with Ext3022Fixture(module,[{'rows':history_rows('AUDIT-ID',3),'delay':240,'mode':'loadData'}],**kwargs) as f:
    try:
     result=f.tela.consultar('AUDIT-PCBA');status=result['query_diagnostics']['status']
    except Exception as exc:
     status=type(exc).__name__+': '+str(exc)[:70]
    out.append(dict(ref=ref,case=case,virtual_ms=round(f.clock*1000),
                    trial_attempts=f.trial_attempts,
                    submitted=len(f.call(op='state')['submitted']),status=status))
print(json.dumps(out,indent=2,ensure_ascii=False))
