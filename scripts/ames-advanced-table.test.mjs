import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterRows,orderRows,paginateRows,csv} from '../ames/advanced-table.mjs';

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

test('CSV export still includes every selected row and neutralizes formulas',()=>{
  const rows=Array.from({length:650},(_,i)=>({id:i+1,note:i===0?'=cmd':'ok'}));
  const output=csv(rows,[{key:'id',label:'ID'},{key:'note',label:'Note'}]);
  assert.equal(output.split('\r\n').length,651);
  assert.match(output,/"'=cmd"/);
});
