import assert from 'node:assert/strict';
import {componentFamily,componentLabel,aggregatePcbas,reuseKpis,reuseLinks} from '../ames/data/reuse-analysis.mjs';

assert.equal(componentFamily('前置摄像头'),'Front Camera');
assert.equal(componentFamily('后置主摄像头'),'Main Camera');
assert.equal(componentFamily('显示屏组件'),'Screen / LCD');
assert.equal(componentFamily('副板'),'Sub Board');
assert.equal(componentFamily('扬声器'),'Speaker');
assert.equal(componentFamily('受话器'),'Receiver');
assert.equal(componentFamily('天线'),'Antenna');
assert.equal(componentLabel('前置摄像头','pt-BR'),'Câmera frontal');
assert.equal(componentLabel('前置摄像头','en-US'),'Front Camera');
assert.equal(componentLabel('未知部件','pt-BR'),'未知部件','unknown raw MES labels must be preserved rather than guessed');

const links=[
 {line:'TAN10103',pcba:'0025-PCBA-1',material:'MAT-SCREEN',family:'Screen / LCD',component_group:'LCD Assembly',relations:'MESMA FALHA'},
 {line:'TAN10103',pcba:'0025-PCBA-1',material:'MAT-SUB',family:'Sub Board',component_group:'LCD Assembly',relations:'OUTRA FALHA'},
 {line:'TAN10103',pcba:'0025-PCBA-1',material:'MAT-SPK',family:'Speaker',component_group:'LCD Assembly',relations:null},
];
const pcbas=aggregatePcbas(links),kpis=reuseKpis(links);
assert.equal(pcbas.length,1,'three material links on the same current PCBA must not become three affected PCBAs');
assert.equal(pcbas[0].materials,3);
assert.equal(pcbas[0].component_groups,1);
assert.equal(pcbas[0].links,3);
assert.equal(kpis.pcbas,1);
assert.equal(kpis.materials,3);
assert.equal(kpis.groups,1);
assert.equal(kpis.links,3);
assert.equal(kpis.same,1);

const snapshot={
 line_id:'TAN10103',
 material_trace:{records:[{current_pcba_sn:'0025-PCBA-1',item_sn:'MAT-CAM',item_type:'前置摄像头',known_use_count:2,previous_pcbas:['0025-OLD-1']}]},
 occurrences:[{pcba_sn:'0025-PCBA-1',defect_code:'GN-CAM',defect_desc:'Camera fail'}],
 pcba_history:{records:[{pcba_sn:'0025-OLD-1',defect_code:'GN-OLD',defect_desc:'Old camera failure'}]},
 process_timeline:{events:[]},
 insights:{drilldowns:{material_analysis:[]}},
};
const parsed=reuseLinks(snapshot);
assert.equal(parsed.length,1);
assert.equal(parsed[0].family,'Front Camera');
assert.equal(parsed[0].item_type,'前置摄像头','raw Chinese evidence must remain available');
assert.equal(parsed[0].pcba,'0025-PCBA-1');
assert.equal(parsed[0].material,'MAT-CAM');

console.log('PASS: Chinese material labels are localized without mutating raw evidence; PCBA/link granularities stay distinct.');
