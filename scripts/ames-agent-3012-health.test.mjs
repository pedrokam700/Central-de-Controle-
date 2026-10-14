import {test} from 'node:test';
import assert from 'node:assert/strict';
import {read3012Status,sanitize3012Status} from '../ames/agent-3012-health.mjs';

test('3012 status sanitizer exposes only aggregate cache coverage',()=>{
  const value=sanitize3012Status({
    ok:true,
    implemented:true,
    factory_validated:false,
    ames_start_date:'2026-01-01',
    local:{
      rows:14,pcbas:3,repair_users:2,coverage_intervals:5,coverage_sns:3,
      first_event:'2026-01-03T08:00:00',last_event:'2026-10-14T09:00:00',
      raw_rows:[{repair_comment:'must not leak'}],secret:'hidden'
    },
    rows:[{pcba_sn:'002527SECRET'}]
  });
  assert.deepEqual(value,{
    status:'ok',implemented:true,factoryValidated:false,amesStartDate:'2026-01-01',
    local:{rows:14,pcbas:3,repairUsers:2,coverageIntervals:5,coverageSns:3,firstEvent:'2026-01-03T08:00:00',lastEvent:'2026-10-14T09:00:00'}
  });
  const text=JSON.stringify(value);
  assert.equal(text.includes('must not leak'),false);
  assert.equal(text.includes('002527SECRET'),false);
  assert.equal(text.includes('hidden'),false);
});

test('paired 3012 status request sends workstation token and stays aggregate-only',async()=>{
  const calls=[];
  const result=await read3012Status({
    token:'paired-token',
    fetcher:async(url,options)=>{
      calls.push({url,options});
      return {ok:true,status:200,json:async()=>({
        ok:true,implemented:true,factory_validated:false,ames_start_date:'2026-01-01',
        local:{rows:0,pcbas:0,repair_users:0,coverage_intervals:1,coverage_sns:1,first_event:null,last_event:null},
        raw:'never expose'
      })};
    }
  });
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/3012\/status$/);
  assert.equal(calls[0].options.headers['X-Central-Agent-Token'],'paired-token');
  assert.equal(result.status,'ok');
  assert.equal(result.local.coverageSns,1);
  assert.equal(result.local.rows,0);
  assert.equal(JSON.stringify(result).includes('never expose'),false);
});

test('3012 status fails closed for unauthorized unsupported and unpaired contexts',async()=>{
  const unauthorized=await read3012Status({token:'bad',fetcher:async()=>({ok:false,status:401})});
  assert.deepEqual(unauthorized,{status:'unavailable',reason:'unauthorized'});
  const unsupported=await read3012Status({token:'paired',fetcher:async()=>({ok:false,status:404})});
  assert.deepEqual(unsupported,{status:'unavailable',reason:'unsupported'});
  let called=0;
  const unpaired=await read3012Status({token:'',fetcher:async()=>{called++;throw Error('must not probe');}});
  assert.equal(called,0);
  assert.deepEqual(unpaired,{status:'unavailable',reason:'not_paired'});
});
