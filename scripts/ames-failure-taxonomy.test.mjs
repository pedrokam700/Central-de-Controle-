import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {compareFailures,FAILURE_TAXONOMY_VERSION} from '../ames/data/failure-taxonomy.mjs';
const cases=[
 ['A','Front camera failed','A','Câmera frontal falhou','EXACT'],
 ['A','front cameras failed','B','câmera frontal falhou','SIMILAR'],
 ['A','camera traseira','B','câmera frontal','OTHER'],
 ['A','camera traseira','A','câmera frontal','UNKNOWN'],
 ['A','camera failed','B','front camera failed','UNKNOWN'],
 ['A','cameras','B','camera','UNKNOWN'],
 ['A','p-sensor','B','light sensor','SIMILAR'],
 ['A','sensor de proximidade','B','p sensor','SIMILAR'],
 ['A','sem falha na camera frontal','A','front camera failed','UNKNOWN'],
 ['A','no fault front camera','B','front camera failed','UNKNOWN'],
 ['A','front camera not working','B','câmera frontal não funciona','SIMILAR'],
 ['','unmapped symptom','','unmapped symptom','UNKNOWN'],
 ['UNKNOWN','generic','UNKNOWN','generic','UNKNOWN'],
 ['A','Front camera','B','Speaker noise','OTHER'],
 ['A','rear camera front camera','B','front camera','UNKNOWN'],
 ['a ','anything',' A','anything else','EXACT'],
 ['A','generic','B','generic','SIMILAR',{currentFamily:'DISPLAY_LCD',oldFamily:'DISPLAY_LCD'}],
];
test('versioned classifier covers codes, multilingual plurals, subtypes and negated evidence',()=>{
 for(const [cc,cd,oc,od,expected,context] of cases){const result=compareFailures(cc,cd,oc,od,context);assert.equal(result.classification,expected,JSON.stringify([cc,cd,oc,od]));assert.equal(result.current_desc,cd);assert.equal(result.version,FAILURE_TAXONOMY_VERSION);assert(result.reason_code);}
});
test('Excel/Python and browser use identical version, rules and results',()=>{
 const sync=spawnSync(process.env.PYTHON_BIN||'python3',['scripts/sync-failure-taxonomy.py','--check'],{encoding:'utf8'});assert.equal(sync.status,0,sync.stderr||sync.stdout);
 const run=spawnSync(process.env.PYTHON_BIN||'python3',['-c',"import sys,json;sys.path.insert(0,'ames/factory-engine');from core.failure_taxonomy import compare;print(json.dumps([compare(*c[:4],context=c[5] if len(c)>5 else None) for c in json.load(sys.stdin)]))"],{input:JSON.stringify(cases),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),cases.map(([cc,cd,oc,od,,context])=>compareFailures(cc,cd,oc,od,context)));
});
