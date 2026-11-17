"""Measure real competing writer wait on disposable synthetic SQLite only.

No runtime patch is saved: the temporary connection proxy merely
starts the observer after canonical BEGIN IMMEDIATE succeeds. Wall time includes
commit/release and SQLite's busy-handler scheduling, not just Python projection.
"""
import argparse
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time

parser=argparse.ArgumentParser();parser.add_argument('--root',default='.');parser.add_argument('--sizes',default='100,200,400,800,1600');opts=parser.parse_args()
root=Path(opts.root).resolve();sys.path[:0]=[str(root/'ames/agent'),str(root/'ames/factory-engine')]
from store import Store
import canonical
import process_r11
for size in map(int,opts.sizes.split(',')):
 with tempfile.TemporaryDirectory(prefix='ames-perf-disposable-') as folder:
  filename=Path(folder)/'synthetic.sqlite';store=Store(filename);store.initialize();process_r11.patch_store(store)
  sid=store.create_snapshot(window_id=None,source_kind='synthetic')
  rows=[{'pcba_sn':f'P{i}','line':'TAN10101','defect_code':'D','defect_time':'2026-11-03T12:00:00Z','defect_key':f'K{i}'} for i in range(size)]
  store.ingest_defects(sid,rows)
  process_r11._persist_contexts(store,sid,[{**r,'source':'3022','reference_station_code':'A5162','reference_event_time':'2026-11-03T11:00:00Z'} for r in rows])
  start_observer=threading.Event();attempting=threading.Event();acquired=threading.Event();result={}
  def observe():
   try:
    with sqlite3.connect(filename,timeout=30) as conn:
     if not start_observer.wait(30):raise RuntimeError('canonical BEGIN was not observed')
     began=time.perf_counter();attempting.set();conn.execute('BEGIN IMMEDIATE')
     acquired.set();result['competing_writer_wait_ms']=round((time.perf_counter()-began)*1000,3)
     conn.rollback()
   except Exception as exc:result['error']=repr(exc);attempting.set()
  observer=threading.Thread(target=observe);observer.start();original=store.connect
  @contextmanager
  def instrument():
   with original() as conn:
    started=[False]
    class AfterBegin:
     def __getattr__(self,name):return getattr(conn,name)
     def execute(self,sql,*args,**kwargs):
      cursor=conn.execute(sql,*args,**kwargs)
      # A trace callback fires BEFORE SQLite takes the lock. Synchronize only
      # AFTER execute returns, while the canonical write transaction is held.
      if sql.upper().startswith('BEGIN IMMEDIATE'):
       assert conn.in_transaction
       started[0]=True;start_observer.set()
       if not attempting.wait(10):raise RuntimeError('observer was not ready')
      return cursor
    try:yield AfterBegin()
    finally:
     if started[0]:
      assert conn.in_transaction and not acquired.is_set(), 'observer acquired before canonical commit'
  store.connect=instrument
  before=time.perf_counter();canonical.export_revision(store,sid,'TAN10101')
  result['canonical_export_wall_ms']=round((time.perf_counter()-before)*1000,3)
  observer.join(35)
  if observer.is_alive() or 'error' in result:raise RuntimeError(result)
  print(json.dumps({'kind':'competing-writer','size':size,**result}),flush=True)
