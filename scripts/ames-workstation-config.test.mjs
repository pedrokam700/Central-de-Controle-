import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('workstation setup preserves useful R11 backup controls without fake execution selector',()=>{
  const advanced=fs.readFileSync('ames/advanced-view.mjs','utf8');
  const agent=fs.readFileSync('ames/agent/agent.py','utf8');
  for(const text of ['Carregar configuração atual','Backups mantidos','Backup ao iniciar','Backup local','monitor_interval_minutes','backup_retention','auto_backup_on_start']) assert.match(advanced,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const text of ['backup_retention','auto_backup_on_start','monitor_interval_minutes']) assert.match(agent,new RegExp(text));
  assert.match(advanced,/Segundo plano \/ Chrome visível/);
  assert.match(advanced,/não consumia esse campo/);
  assert.doesNotMatch(advanced,/name="background"/);
});
