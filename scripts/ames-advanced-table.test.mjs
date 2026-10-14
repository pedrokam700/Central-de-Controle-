import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterRows,orderRows,paginateRows,csv} from '../ames/advanced-table.mjs';
import {baseIncrementalLimit,basePageRequest,basePageWindow,baseServerPageWindow,normalizeBasePageSize} from '../ames/base-paging.mjs';

test('advanced table paginates large selections without truncating the dataset',()=>{
  const rows=Array.from({length:1234},(_,i)=>({id:i+1,line:i%2?'TAN10101':'TAN10102'}));
  const first=paginateRows(rows,{page:1,pageSize:100});
  assert.equal(first.total,1234);assert.equal(first.pages,13);assert.equal(first.start,1);assert.equal(first.end,100);assert.equal(first.rows.length,100);
  const last=paginateRows(rows,{page:99,pageSize:100});
  assert.equal(last.page,13);assert.equal(last.start,1201);assert.equal(last.end,1234);assert.equal(last.rows.length,34);
});

test('advanced table accepts only bounded page sizes and handles empty selections',()=>{
  assert.equal(paginateRows([1,2,3],{pageSize:999}).pageSize,100);
  assert.equal(paginateRows(Array.from({length:600}),{pageSize:500}).rows.length,500);
  assert.deepEqual(paginateRows([],{page:3,pageSize:50}),{rows:[],page:1,pageSize:50,pages:1,total:0,start:0,end:0});
});

test('filter sort and pagination keep exact operational selection semantics',()=>{
  const rows=[
    {id:1,line:'TAN10101',product_model:'CPH2859V',defect_time:'2026-10-13T08:00:00',value:2},
    {id:2,line:'TAN10101',product_model:'CPH2859',defect_time:'2026-10-13T09:00:00',value:3},
    {id:3,line:'TAN10102',product_model:'CPH2859V',defect_time:'2026-10-13T10:00:00',value:1},
  ];
  const filtered=filterRows(rows,{filters:{line:'TAN10101',product_model:'CPH2859V'},from:'2026-10-13',to:'2026-10-13'});
  assert.deepEqual(filtered.map(r=>r.id),[1]);
  const ordered=orderRows(rows,{key:'value',desc:true});assert.deepEqual(ordered.map(r=>r.id),[2,1,3]);
  assert.deepEqual(paginateRows(ordered,{page:1,pageSize:50}).rows.map(r=>r.id),[2,1,3]);
});

test('global search cache reuses normalized row text without changing results',()=>{
  let reads=0;
  const row={id:1,line:'TAN10101'};
  Object.defineProperty(row,'description',{enumerable:true,get(){reads++;return 'Camera Scratched';}});
  const cache=new WeakMap();
  assert.deepEqual(filterRows([row],{query:'camera'},cache).map(r=>r.id),[1]);
  assert.deepEqual(filterRows([row],{query:'scratched'},cache).map(r=>r.id),[1]);
  assert.equal(reads,1,'same row must be normalized only once while the dataset is unchanged');
  const freshCache=new WeakMap();
  assert.deepEqual(filterRows([row],{query:'camera'},freshCache).map(r=>r.id),[1]);
  assert.equal(reads,2,'replacing the dataset cache must re-read the row');
});

test('CSV export still includes every selected row and neutralizes formulas',()=>{
  const rows=Array.from({length:650},(_,i)=>({id:i+1,note:i===0?'=cmd':'ok'}));
  const output=csv(rows,[{key:'id',label:'ID'},{key:'note',label:'Note'}]);
  assert.equal(output.split('\r\n').length,651);
  assert.match(output,/"'=cmd"/);
});

test('Base local paging exposes only the current window and requests data incrementally',()=>{
  const first=basePageWindow(1234,0,100,100);
  assert.deepEqual(first,{page:0,pageSize:100,pages:13,total:1234,start:0,end:100,displayStart:1,hasPrev:false,hasNext:true,needsMore:false});
  const fifth=basePageWindow(1234,4,100,300);
  assert.equal(fifth.start,400);assert.equal(fifth.end,300);assert.equal(fifth.needsMore,true);
  assert.equal(baseIncrementalLimit(0,100),100);
  assert.equal(baseIncrementalLimit(4,100),500);
  assert.equal(baseIncrementalLimit(2000,250),100000);
});

test('Base local server paging requests only one bounded page at the exact offset',()=>{
  assert.deepEqual(basePageRequest(0,100),{page:0,pageSize:100,limit:100,offset:0});
  assert.deepEqual(basePageRequest(4,100),{page:4,pageSize:100,limit:100,offset:400});
  assert.deepEqual(basePageRequest(9999,250),{page:9999,pageSize:250,limit:250,offset:100000});
  const fifth=baseServerPageWindow(1234,4,100,100);
  assert.deepEqual(fifth,{page:4,pageSize:100,pages:13,total:1234,start:400,end:500,displayStart:401,hasPrev:true,hasNext:true,needsMore:false});
  const last=baseServerPageWindow(1234,12,100,34);
  assert.equal(last.displayStart,1201);assert.equal(last.end,1234);assert.equal(last.hasNext,false);
});

test('Base local paging clamps invalid pages and page sizes without fabricating rows',()=>{
  assert.equal(normalizeBasePageSize(999),100);
  assert.equal(normalizeBasePageSize('250'),250);
  const last=basePageWindow(1234,99,100,1234);
  assert.equal(last.page,12);assert.equal(last.displayStart,1201);assert.equal(last.end,1234);assert.equal(last.hasNext,false);assert.equal(last.needsMore,false);
  const empty=basePageWindow(0,3,50,0);
  assert.deepEqual(empty,{page:0,pageSize:50,pages:1,total:0,start:0,end:0,displayStart:0,hasPrev:false,hasNext:false,needsMore:false});
  assert.deepEqual(baseServerPageWindow(0,3,50,0),empty);
});
