import test from 'node:test';
import assert from 'node:assert/strict';
import {materialBindingEvidence} from '../ames/console-sn-material-bindings.mjs';

test('3074 UTC binding times are displayed in factory local time without rewriting raw values',()=>{
  const rows=materialBindingEvidence({bindings:[{pcba_sn:'PCB-CURRENT',bind_time:'2026-10-17 12:00:00',unbind_time:'2026-10-17 13:15:00',offset:'+00:00',source:'3074',event_count:1}]},'PCB-CURRENT');
  assert.equal(rows.length,1);
  assert.equal(rows[0].role,'current');
  assert.equal(rows[0].bind_raw,'2026-10-17 12:00:00');
  assert.match(rows[0].bind_display,/09:00/);
  assert.match(rows[0].unbind_display,/10:15/);
  assert.equal(rows[0].aggregated,false);
});

test('cached factory-local 3074 binding keeps the same wall clock and previous-PCBA identity',()=>{
  const rows=materialBindingEvidence({bindings:[{pcba_sn:'PCB-OLD',bind_time:'2026-09-01 08:25:00',unbind_time:'2026-09-10 14:40:00',offset:'-03:00',source:'3074'}]},'PCB-CURRENT');
  assert.equal(rows[0].role,'previous');
  assert.match(rows[0].bind_display,/08:25/);
  assert.match(rows[0].unbind_display,/14:40/);
});

test('aggregated binding history is labeled instead of being presented as one exact interval',()=>{
  const rows=materialBindingEvidence({bindings:[{pcba_sn:'PCB-OLD',bind_time:'2026-09-01 08:00:00',unbind_time:'2026-09-20 16:00:00',offset:'-03:00',event_count:3}]},'PCB-CURRENT');
  assert.equal(rows[0].event_count,3);
  assert.equal(rows[0].aggregated,true);
});

test('missing 3074 times stay unknown and duplicate binding rows are not multiplied',()=>{
  const binding={pcba_sn:'PCB-OLD',bind_time:'2026-09-01 08:00:00',offset:'-03:00',source:'3074'};
  const rows=materialBindingEvidence({bindings:[binding,{...binding},{pcba_sn:'PCB-NO-TIME',source:'3074'}]},'PCB-CURRENT');
  assert.equal(rows.length,1);
  assert.equal(rows[0].unbind_display,'—');
});
