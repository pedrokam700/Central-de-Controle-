# 20/10/2026 — Reconciliation of original 3022 handoff and target-impact Top 3

**Primary source, preserved verbatim:** [HANDOFF_CANONICO_3022_R12_20261020.md](handoffs/HANDOFF_CANONICO_3022_R12_20261020.md) — operator-supplied historical R2–R12 technical specification, 773 source lines. This is not a declaration that old version R12 replaces today's PR42 behavior. Reconcile any change to 3022 against this source first. Do not silently redefine MES source-of-truth.

## 1. Why 3022 matters — four distinct clocks/contexts

1. **3028/3012 Defect Time:** time a particular failure was **recorded**. Used as a hard *upper temporal bound* and unique occurrence identifier, **never** as a substitute for the generation/assembly clock.
2. **3022 previous completed process:** general factory path context; can be different from the station relevant to this defect.
3. **3022 reference process:** last **completed** pass by the model/failure/mode-specific station at or before that exact defect occurrence (working station, completion status such as END LOT, chronological order and Hist Seq), **not** latest pass of the PCBA lifetime. This is a candidate process *of introduction or control*, not confirmed root cause.
4. **Detection/rework/AT/return:** separate processes. A7600 may detect camera dust, A5162 may be assembly/cleaning reference; Phone_Bat_Cover repair, A5201 return, new bind and later A5162 pass belong to their own cycles. Never use events *after* the investigated failure to explain that failure. Preserve all events in raw timeline.

Other invariant: **A5700 reached ≠ A5700 completed.** Working Oper / Current Oper / Station / Hist Seq / completion evidence matter; completed A5700 bounds packing. No evidence of completion => no artificial packing boundary. Physical fixtures previously recorded 66=62 assembly/test+4 packing and boundary Hist Seq 62; historical results are NOT proof of present PR42 factory correctness. A5100 for certain pre-mounted P-sensor/receiver cases is model-dependent provisional; A5150 linkage scanning ≠ A5202 current test; A5265 first test; A5700 last test. CPH2859 != CPH2859V unless an explicit family association warrants it.

**Shift** uses 3022 reference event in America/Sao_Paulo with plant shifts 07:30–17:30 and 17:30–07:30; production day 07:00→07:00 is independent. The later calendar day of a 03:00 event may still belong to the previous operational date. Unknown event times remain unknown rather than a guessed shift.

## 2. Code inventory and discrepancy status (exact PR42 review)

| Contract | Existing source | Status on PR42, 20/10 |
|---|---|---|
| Matrix by CPH, failure code/family, Manual/Automatic, station | `ames/factory-engine/config/regras_processo_3022.json` and `ames/factory-engine/ames/tela_3022.py` | **Partially implemented**: camera/appearance manual → A5162 and P-sensor/receiver → provisional A5100 are mapped; the config has **only these two explicit rules**, so many automatic/functional faults are correctly `UNMAPPED`. Do not infer a generation station from any earlier generic event |
| Last qualifying passage <= exact Defect Time; repeated passes/cycles | `selecionar_passagem_referencia`, `correlacionar_falha_3022` | Implemented in correlator; CI contracts and older fixtures exist, but **physical integrated PR42 proof pending** |
| Separate A5700 reached/completed; preserve post-A5700 raw timeline | `preparar_foco_montagem_teste` in `tela_3022.py`; R17/R18 tests | Implemented; physical older R4 case does not automatically certify latest build |
| Source-labelled generation shift | `ames/agent/production_shift.py`, `ames/data/production-evidence.mjs`, `ames/console-sn-temporal-proof.mjs` | Implemented when reference is proven. The 2114 UI often has **no Defect Time**: PR42 now attempts unique same-PCBA/Defect-Code time from stored 3028 and collected 3012, after 3012 completes; ambiguous multiple occurrences are **not** assigned. User's physical report still PENDING for new version |
| Automatic 3028 → 3074 → 2114 → 3022 for all relevant failures | `ames/agent/agent_entry.py`, `ames/agent/process_r11.py`, `ames/agent/agent.py` | **Partially wired**: explicit deep mode has 3022 R11 adapter; direct `3028` collection response still reports `3022:pending_adapter`. Do not describe *every* collection as automatically 3022-complete |
| 3074 material relation at exact failure time | `core/temporal_3074.py`, `core/varredura_3074.py` | Scope guard present; test physical new cycles and boundary statuses |
| 3028/2114 registration mismatch and source conflict | `process_r11._context_from_correlation` | **Open**: 3028 `manual_or_auto_3028` stored, 2114 variant `manual_or_auto_2114` still empty in batch contexts. Preserve conflict; never silently overwrite a 3028 classification with a 2114 value |
| Raw process data + SQLite and remote A→B | local `mes_process_timeline`, `process_defect_contexts` and sync layers | Offline SQLite implemented; full sharing of every raw 3022 event to B is not physically homologated. Never treat new CLEAN directory as sharing old SQLite |
| Actual AT name | repair 3012 and 3022 operator evidence | Show name only with explicit matching source fields; `BRM...` alone is an ID and cannot be decoded into someone's name |

**Safe sequencing for later completion:** physical test first to check real 2114 missing Defect Time and matching 3012/3028 before expanding matrix by verified CPH/functional family, then test repeated reference station cycles, A5700 stop/packing, 3022 persistence, A→B read and full 9-view drilldowns. Do not replace known rules, hard-code all functional faults to A5265/A5202, modify factory source_id/SQLite/port 8765, or merge/deploy just to address blanks.

## 3. Target-impact Top 3 policy (independent of true MES failure/FPY)

Production operator clarifies the **Top 3 is a Pareto of failures affecting the target**, *not* a frequency ranking of every raw system alert. Four known categories often reflect automatic false alerts or route/setup handling:

- `standard error` (including displayed `9999` only with this description), and `F1_9999`/displayed `F1.9999`: machine-origin standard/diagnostic alerts, may be deleted and retested by AT, may never arrive at AT;
- `Process: Skip station`: routing/skipped-station condition, not target-impact defect for this operational Top 3;
- `Process: Inconsistent scheme/work order/version`: change-of-setup/disassembly workflow condition, not target-impact defect for this Top 3.

**Business rule = display-only** in `ames/data/target-impact.mjs` (`target-impact-top3-v1`). The Top 3 summary, target-impact full Pareto and their leading defect use only eligible occurrences; ranking percentages use eligible occurrences as denominator. A small excluded count is shown for audit. **Do not remove** the four categories from the raw observations, Falhas general view, detailed occurrences, 3012/2114/3022 correlation, export, all-failure count, FPY, Check FPY or Quantity. These MES-provided indicators are displayed unchanged; changing their calculation would require separate documented authority and an end-to-end target measurement contract. Unsupported near-match labels remain eligible; do not build an unrestricted substring filter such as `error` or `process`.

Preservation gate `scripts/agent-3022-canonical-contract.test.py` runs the existing R17/R18 Python regression fixtures (A5700 boundary and R5 camera/AT/rework mapping) on Linux and Windows CI; it is a contract test, not a current factory claim.

Validate with `scripts/ames-target-impact-ranking.test.mjs`, existing top3 drill-down + daily analytics contracts, full CI and a physical print on TAN10103 showing excluded alert count alongside untouched overall failure total/FPY. Distinguish `pass 5/5 CI` from physical acceptance.

## 4. Persistent checkpoints

- This complete handoff is version-controlled as original input, not memory-only.
- This reconciliation documents current code gaps and explicit future factory gates.
- `docs/ames/handoffs/ISSUE41_PR42_INTEGRACAO_20261019.md` remains integration context; do not rewrite earlier handoffs or reopen completed PR34.
