"""Rehydrate public SYNTHETIC Store/canonical graph with stdlib only.

p02_state.json was produced by the #93 integration/3074 fixture at base 5e00c85;
no workstation/agent bootstrap. Fixed example names/tokens are never real.
"""
import hashlib
import json
from pathlib import Path
import sqlite3

ROOT=Path(__file__).resolve().parents[2]


def dump(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))


def database(path):
    fixture=json.loads((ROOT/'scripts/fixtures/p02_state.json').read_text())
    con=sqlite3.connect(path)
    try:
        for typ,name,table,sql in fixture['schema']:
            if typ=='table' and name!='sqlite_sequence':con.execute(sql)
        for table,rows in fixture['tables'].items():
            if rows:con.executemany('INSERT INTO "'+table+'" VALUES('+','.join('?'*len(rows[0]))+')',rows)
        con.execute('DELETE FROM sqlite_sequence')
        con.executemany('INSERT INTO sqlite_sequence VALUES(?,?)',fixture['sequences'])
        for typ,name,table,sql in fixture['schema']:
            if typ!='table':con.execute(sql)
        con.commit()
    finally:con.close()


def seal(workspace):
    workspace=Path(workspace)
    entries={p.relative_to(workspace/'source').as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
             for p in (workspace/'source').rglob('*') if p.is_file()}
    con=sqlite3.connect(workspace/'source/ames-agent/data/ames_local.sqlite3')
    try:source=con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0]
    finally:con.close()
    (workspace/'SYNTHETIC_ONLY.json').write_text(dump({'schema':'ames-p02-synthetic-workspace-v1',
      'purpose':'synthetic_only_not_factory','source_id':source,'files':entries}),encoding='utf-8')


def make_fixture(workspace):
    workspace=Path(workspace);workspace.mkdir()
    source=workspace/'source';source.mkdir()
    target=source/'ames-agent/data/ames_local.sqlite3';target.parent.mkdir(parents=True)
    database(target)
    con=sqlite3.connect(target)
    try:source_id=con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0];revision,content=con.execute("SELECT revision,content_hash FROM mes_revisions WHERE snapshot_id=1 AND line='TAN10103' ORDER BY revision DESC LIMIT 1").fetchone()
    finally:con.close()
    files={
      'ames-agent/config.json':{'host':'192.0.2.74','engine_dir':'C:/OPERATIONAL-SYNTHETIC/engine','chrome_profile_dir':'C:/OPERATIONAL-SYNTHETIC/ChromeProfile','owner_uid':'SYNTHETIC-OWNER'},
      'ames-agent/data/local_agent_token':'SYNTHETIC-SECRET-TOKEN-NEVER-REAL',
      'ames-agent/data/at_user_profiles.json':{'users':[{'id':'BRM-SYNTHETIC','name':'Pessoa sintética','password_hash':'SYNTHETIC-HASH'}]},
      'ames-agent/data/at_admin_auth.json':{'password_hash':'SYNTHETIC-ADMIN-HASH'},
      'factory-engine/config/settings.json':{'url':'http://192.0.2.74/asymes'},
      'factory-engine/session.json':{'cookies':'SYNTHETIC-SESSION-COOKIE'},
      'chrome/Default/Preferences':{'account':'SYNTHETIC-ACCOUNT'},
      'browser/storage.json':{'auth':'SYNTHETIC-FIREBASE-AUTH','outbox':[]},
      'ames-agent/data/checkpoint.json':{'source_id':source_id,'snapshot_id':1,'line':'TAN10103','revision':revision,'content_hash':content,'query_sn':'P1','status':'COMPLETE'},
      'logs/agent.log':'SYNTHETIC HOST 192.0.2.74 TOKEN SYNTHETIC-SECRET-TOKEN-NEVER-REAL',
    }
    for name,value in files.items():
        path=source/name;path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(value if isinstance(value,str) else dump(value),encoding='utf-8')
    seal(workspace)
    return source
