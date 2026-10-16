from pathlib import Path
p=Path('scripts/ames-3012-physical-contract.test.mjs')
t=p.read_text(encoding='utf-8')
old="""  for(const id of ['txtSnImei','dteFromDate__Date','dteFromDate__Time','dteFromDate__Data','dteToDate__Date','dteToDate__Time','dteToDate__Data','btnView','grdDefectRepair']) assert.match(collector,new RegExp(id));
"""
new="""  for(const id of ['txtSnImei','dteFromDate','dteToDate','btnView','grdDefectRepair']) assert.match(collector,new RegExp(id));
  assert.match(collector,/root\+'__Date'/);
  assert.match(collector,/root\+'__Time'/);
  assert.match(collector,/root\+'__Data'/);
"""
if old not in t: raise SystemExit('static contract anchor missing')
p.write_text(t.replace(old,new,1),encoding='utf-8')
