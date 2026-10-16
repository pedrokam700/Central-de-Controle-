import assert from 'node:assert/strict';
import {SOURCE_STATE} from '../ames/data/source-provenance.mjs';
import {processSourceState} from '../ames/console-process-provenance.mjs';

const snapshot=(timeline={})=>({process_timeline:timeline});
const rows={events:[{pcba_sn:'002527TEST',event_time:'2026-10-14 08:00:00'}],contexts:[]};

assert.equal(processSourceState(null),SOURCE_STATE.NOT_COLLECTED,'missing snapshot must not become zero');
assert.equal(processSourceState(snapshot({events:[],contexts:[]})),SOURCE_STATE.NOT_COLLECTED,'empty container without collection proof must remain not collected');
assert.equal(processSourceState(snapshot({status:'unavailable',events:[],contexts:[]})),SOURCE_STATE.UNAVAILABLE,'unavailable 3022 must remain unavailable');
assert.equal(processSourceState(snapshot({status:'error',error:'timeout',events:[],contexts:[]})),SOURCE_STATE.ERROR,'failed 3022 must remain error when there is no usable evidence');
assert.equal(processSourceState(snapshot({status:'completed',events:[],contexts:[]})),SOURCE_STATE.ZERO,'completed empty 3022 is the only valid zero');
assert.equal(processSourceState(snapshot({status:'completed',...rows})),SOURCE_STATE.OK,'completed 3022 with evidence must be available');
assert.equal(processSourceState(snapshot({status:'partial',...rows})),SOURCE_STATE.PARTIAL,'partial 3022 with evidence must remain partial');
assert.equal(processSourceState(snapshot({status:'error',error:'refresh failed',...rows})),SOURCE_STATE.PARTIAL,'failed refresh with preserved rows must degrade to partial instead of erasing evidence');
assert.equal(processSourceState(snapshot({status:'completed',...rows}),SOURCE_STATE.CACHED),SOURCE_STATE.CACHED,'cached 3022 evidence must stay explicitly cached');
assert.equal(processSourceState(snapshot({status:'completed',events:[],contexts:[]}),SOURCE_STATE.CACHED),SOURCE_STATE.CACHED,'cached proven-zero evidence must still be labeled cache, not current MES');

console.log('PASS: process 3022 provenance preserves not-collected/error/unavailable/partial/cache and only permits zero with completed collection proof.');
