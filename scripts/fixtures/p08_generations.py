"""Three synthetic captures, no executable installation or operational launcher."""
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import sqlite3
ROOT=Path(__file__).resolve().parents[2]
P02=runpy.run_path(str(ROOT/'scripts/fixtures/p02_installation.py'))
PROFILE=json.loads((ROOT/'tools/ames-lab/p08_profile.json').read_text(encoding='utf-8'))
P02_PROFILE=json.loads((ROOT/'tools/ames-lab/p02_profile.json').read_text(encoding='utf-8'))
DB='ames-agent/data/ames_local.sqlite3'


def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')),encoding='utf-8')
def hashes(root):return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}


def seal(workspace):
    workspace=Path(workspace);anchors={}
    for role in ('C0','A','B'):
        root=workspace/role;entries=hashes(root);entries.pop('generation.json',None)
        write(root/'generation.json',{'schema':'ames-p08-synthetic-generation-v1','role':role,'generation_id':'SYNTHETIC-'+role,
          'parent_generation':{'C0':None,'A':'SYNTHETIC-C0','B':'SYNTHETIC-A'}[role],
          'source_id':P02_PROFILE['synthetic_provenance']['source_id'],'files':entries})
        anchors[role]=hashlib.sha256((root/'generation.json').read_bytes()).hexdigest()
    write(workspace/'SYNTHETIC_ONLY.json',{'schema':'ames-p08-synthetic-workspace-v1','base_sha':PROFILE['base_sha'],
          'scope':'SYNTHETIC_ONLY','generations':anchors})


def make(workspace,technical=False):
    workspace=Path(workspace);assert workspace.name.startswith('P08-SYNTHETIC-');workspace.mkdir()
    seed=workspace/'P02-SYNTHETIC-SEED';source=P02['make_fixture'](seed)
    for role in ('C0','A','B'):
        root=workspace/role;shutil.copytree(source,root)
        write(root/'software.json',{'schema':'ames-p08-passive-software-v1','reference_sha':PROFILE['base_sha'] if role=='B' else PROFILE['a_reference_sha'],
          'canonical_reader_sha256':PROFILE['canonical_reader_sha256'],'runnable':False})
        write(root/'execution.json',{'schema':'ames-p08-synthetic-execution-v1','entered':False,'completed':True,'steps':[]})
        write(root/'sync.json',{'schema':'ames-p08-synthetic-sync-v1','source_id':P02_PROFILE['synthetic_provenance']['source_id'],
          'checked':True,'complete':True,'pending':False})
    shutil.rmtree(seed)
    if technical:apply_technical(workspace)
    seal(workspace)
    return workspace


def apply_technical(workspace):
    root=Path(workspace)/'B';con=sqlite3.connect(root/DB)
    try:
        con.execute('PRAGMA trusted_schema=OFF');con.execute(PROFILE['index_sql'])
        con.execute('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)',PROFILE['audit_row']);con.commit()
    finally:con.close()
    write(root/'execution.json',{'schema':'ames-p08-synthetic-execution-v1','entered':True,'completed':True,'steps':[PROFILE['technical_step']]})
