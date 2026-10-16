# AWIP3012 mapped runtime regression — 2026-10-16

Status: automated regression reproduced and corrected; factory physical validation pending.

Canonical mapping source: read-only 3012 Home structure captures from the factory A-MES page (`UAWIP.form.VwDefectRepairView`).

## Root causes isolated

1. The previous result-store heuristic normalized real camelCase fields such as `repairComment`, `repairUser`, `repairTime`, and `defectCode` without splitting camelCase, but scored them against spaced phrases. The mapped `grdDefectRepair` store could therefore fail selection before View was ever executed.
2. Defect Time Start/End are composite `udc_datetimefield` controls. The old fuzzy resolver could classify the parent and hidden data field as time candidates and choose the parent instead of the exact `__Time` leaf.
3. The old query bound response observation to the pre-View store. A post-View ExtJS grid/store rebind could orphan the observer, the same lifecycle class previously reproduced on 3022.
4. Legacy zero-row successes could be persisted as checkpoint/coverage and suppress later physical A-MES requests even after the collector was corrected.

## Mapped V2 contract

- route: `/asymes/home#UAWIP.form.VwDefectRepairView`
- SN: `txtSnImei`
- start: `dteFromDate`, `dteFromDate__Date`, `dteFromDate__Time`, `dteFromDate__Data`
- end: `dteToDate`, `dteToDate__Date`, `dteToDate__Time`, `dteToDate__Data`
- result grid: `grdDefectRepair`
- execute: `btnView`
- source/coverage version: `AWIP3012_HOME_DIRECT_EXTJS_MAPPED_V2`

The collector now proves View execution from observable store/proxy activity instead of treating a click call as success, follows a rebound result store, records request/proxy parameters, and invalidates legacy checkpoint/coverage for query suppression.

Permanent executable regression: `scripts/agent-3012-runtime-contract.test.py`, wired by `scripts/ames-3012-runtime-contract.test.mjs`.

Required factory status until physical retest: **AUTOMATED GREEN / FACTORY PHYSICAL PENDING**.
