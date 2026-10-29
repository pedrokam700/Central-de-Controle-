# PR69 — Agent runtime hotfix candidate (NOT production approved)
Date: 2026-10-29. The reference archive is CENTRAL_AMES_PR69_TRACE_REVISAO_82311F5_CANDIDATA.zip (312 files).

**Physical evidence**: first selected-one-PCBA trace executed and finished with 3074 partial, 2114/3022 complete; second wider trace never began and returned `Trace revision changed; reload the selected period`. Treat these as two independent failures.

## Agent runtime changes
The adjacent `PR69_agent_3074_revision.patch` applies to **ames-agent/agent_entry.py** and **ames-agent/engine_bridge.py** inside the integrated package. These Python sources are shipped in the bundle, not at the repository branch's existing source path. This evidence directory versions the exact unified patch; it does NOT itself deploy or patch a factory workstation.

1. At worker start (after queue admission), re-export only the same immutable 3028 local snapshot and verify source ID, line ID, snapshot ID, production-period identity and revision floor, then revalidate current epoch. Retry at most three times for a racing write; fail closed otherwise. The frontend-only recheck in 82311f5 did not cover this gap.
2. The frozen 3074 collector previously returned `items`, requested/processed/error counts but no top-level `source_status` on normal completion; the agent interpreted missing status as not-run and the operator saw 3074 partial. Now derive COMPLETE **only if every requested PCBA completed and no ExtJS page is incomplete**, otherwise PARTIAL or ERROR; attach diagnostic counts/reasons. This certifies extraction coverage only, **not actual component reuse**. It does not mask real pagination or uncertain bindings.

## Tests and scope
- 9 direct Python off-line regression tests passed: two successive jobs on the same snapshot with SQLite clock change, clock-only update, bounded races, cross-PC/day/snapshot rejection, 3074 all-complete vs true partial, failures/count mismatches. Real shipped Python functions (AST-extracted) are used with SQLite.
- Full frozen factory-engine suite: 89 passed + 6 subtests.
- No runtime SQLite/database migration; no changes to network, scripts for swapping agents, 3028/2114/3022 collectors, or frontend.
- **NOT YET validated**: Windows integration of the patched agent and real A-MES pagination. Reuse indicators remain pending real MES source evidence. No merge/main/release or production permission.

Before handing a bundle to the operator: build from baseline archive, apply patch, update integrity manifests (and script sha when branch commits change), check old 312 paths bytewise except allowlisted agent sources plus generated manifests, and verify both extracted files match recorded hashes. Preserve existing installation and backups, PR69 remains DRAFT.
