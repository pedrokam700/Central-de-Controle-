from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
if str(AGENT) not in sys.path:
    sys.path.insert(0, str(AGENT))

import sn_lookup_context


def fake_agent(cached=True):
    def original(engine_dir, *args, **kwargs):
        local = {"process_contexts": [{"id": "cached"}]} if cached else {}
        return {"trace_3022": {"process_passages": []}, "local_snapshot": local}
    return SimpleNamespace(run_individual_lookup=original)


def main():
    calls=[]
    original_enrich=sn_lookup_context.production_shift.enrich_sn
    original_correlate=sn_lookup_context.production_shift.correlate_sn
    try:
        def enrich(result, *, grid_offset=0):
            calls.append(("enrich",grid_offset));return result
        def correlate(result, engine_dir, *, grid_offset=0):
            calls.append(("correlate",engine_dir,grid_offset))
            result.setdefault("local_snapshot",{})["process_contexts"]=[{"id":"live"}]
            return result
        sn_lookup_context.production_shift.enrich_sn=enrich
        sn_lookup_context.production_shift.correlate_sn=correlate

        agent=fake_agent()
        wrapper=sn_lookup_context.install(agent)
        assert wrapper is agent.run_individual_lookup
        assert sn_lookup_context.install(agent) is wrapper
        result=agent.run_individual_lookup("ENGINE",include_3022=True)
        assert calls==[("enrich",0),("correlate","ENGINE",0)],calls
        assert result["local_snapshot"]["process_contexts"]==[{"id":"live"},{"id":"cached"}]

        calls.clear()
        result=agent.run_individual_lookup("ENGINE",include_3022=False)
        assert calls==[],calls
        assert result["local_snapshot"]["process_contexts"]==[{"id":"cached"}]

        def boom(result, engine_dir, *, grid_offset=0):
            raise RuntimeError("correlation failed")
        sn_lookup_context.production_shift.correlate_sn=boom
        calls.clear()
        result=agent.run_individual_lookup("ENGINE",include_3022=True)
        assert calls==[("enrich",0)],calls
        assert result["local_snapshot"]["process_contexts"]==[{"id":"cached"}]
        assert any("RuntimeError" in item for item in result.get("warnings") or [])
    finally:
        sn_lookup_context.production_shift.enrich_sn=original_enrich
        sn_lookup_context.production_shift.correlate_sn=original_correlate

    print("agent-sn-lookup-context: OK")


if __name__ == "__main__":
    main()
