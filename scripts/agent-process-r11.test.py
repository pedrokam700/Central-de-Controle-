from pathlib import Path
import tempfile
import sys

ROOT=Path(__file__).resolve().parents[1]
AGENT=ROOT/'ames'/'agent'
sys.path.insert(0,str(AGENT))

from store import Store
import process_r11


def main():
    with tempfile.TemporaryDirectory() as td:
        td=Path(td)
        store=Store(td/'ames.sqlite3');store.initialize();process_r11.patch_store(store)
        wid=store.ensure_window('today','2026-10-10T07:30:00','2026-10-10T08:00:00',None,['TAN10101'])
        sid=store.create_snapshot(window_id=wid,source_kind='test')
        # Processo 3022 só pode receber linha/CPH pelo contexto da ocorrência atual.
        # O fixture precisa representar o mesmo vínculo real 3028 -> PCBA -> 3022.
        store.ingest_defects(sid,[{
            'line':'TAN10101','pcba_sn':'002527TEST','defect_code':'E1','defect_desc':'Camera impurity',
            'defect_time':'2026-10-10 10:32:00','product_model':'CPH2859','manual_or_auto':'MANUAL'
        }],reconcile_window=False)
        ctx={
            'line':'TAN10101','product_model':'CPH2859','pcba_sn':'002527TEST','defect_key':'d1','defect_code':'E1',
            'defect_desc':'Camera impurity','defect_time':'2026-10-10 10:32:00','defect_time_utc':'2026-10-10T13:32:00+00:00',
            'registration_mode':'MANUAL','registration_mode_source':'3028','failure_family':'CAMERA_APPEARANCE',
            'reference_station_code':'A5162','reference_event_time':'2026-10-10T13:10:00+00:00','reference_pass_count_before_defect':2,
            'previous_operation_code':'A5700','previous_event_time':'2026-10-10T13:20:00+00:00','status':'COMPLETE_REFERENCE','source':'3022'
        }
        process_r11._persist_contexts(store,sid,[ctx])
        process_r11._persist_legacy_events(store,sid,'002527TEST',[{
            'station':'A5162','operation_code':'A5162','operation_name':'Camera appearance','event_time':'2026-10-10 13:10:00',
            'event_group':'FOCO_MONTAGEM_TESTE','raw':{'Hist Seq':'10'}
        }])
        catalog={x['dataset']:x['rows'] for x in store.dataset_catalog(sid)}
        assert catalog['process_defect_contexts']==1,catalog
        rows=store.dataset_rows('process_defect_contexts',sid,line='TAN10101')
        assert len(rows)==1 and rows[0]['reference_station_code']=='A5162',rows
        events=store.dataset_rows('process_events',sid,line='TAN10101')
        assert len(events)==1 and events[0]['line']=='TAN10101',events
        assert events[0]['pcba_sn']=='002527TEST' and events[0]['operation_code']=='A5162',events

        engine=td/'engine';(engine/'ames').mkdir(parents=True)
        (engine/'ames'/'__init__.py').write_text('',encoding='utf-8')
        (engine/'ames'/'tela_3022.py').write_text(
            'class Tela3022: pass\n'
            'def correlacionar_falha_3022(*a,**k): return {}\n'
            'def extrair_passagens_processo(*a,**k): return []\n',encoding='utf-8')
        for name in list(sys.modules):
            if name=='ames' or name.startswith('ames.'):
                del sys.modules[name]
        support=process_r11.engine_support(engine)
        assert support['ready'] is True,support
        assert len(support['sha256'])==64
    print('agent-process-r11: OK')

if __name__=='__main__':main()
