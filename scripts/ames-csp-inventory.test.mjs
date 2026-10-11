import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCspInventory} from './csp-inventory.mjs';

const inventory=buildCspInventory();

test('CSP inventory scans the real frontend surface without enforcing policy',()=>{
  assert.equal(inventory.schema,'central-csp-inventory-v1');
  assert.equal(inventory.mode,'inventory_only');
  assert.ok(inventory.scanned_files>10,'frontend CSP inventory is unexpectedly small');
  assert.ok(inventory.external_origins.includes('https://www.gstatic.com'),'Firebase CDN origin must stay visible in CSP inventory');
});

test('factory A-MES HTTP is classified explicitly while arbitrary insecure HTTP stays blocked',()=>{
  assert.deepEqual(inventory.insecure_non_local_urls,[],'unexpected insecure non-local HTTP URL found in frontend source');
  assert.ok(
    inventory.approved_operational_http_references.includes('http://172.29.185.215/asymes'),
    'approved A-MES intranet reference must remain visible in CSP inventory'
  );
  assert.ok(
    inventory.external_origins.includes('http://172.29.185.215'),
    'A-MES origin must not be hidden from source inventory'
  );
});

test('blocking CSP readiness is computed from real blockers instead of declared optimistically',()=>{
  const expected=inventory.inline_scripts===0&&inventory.eval_like===0&&inventory.insecure_non_local_urls.length===0;
  assert.equal(inventory.blocking_csp_ready,expected);
  if(!expected){
    assert.ok(
      inventory.inline_scripts>0||inventory.eval_like>0||inventory.insecure_non_local_urls.length>0,
      'CSP not ready but no explicit blocker was reported'
    );
  }
});
