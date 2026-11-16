# Red-first architecture contracts (not shipped)

This directory contains **standalone, intentionally failing regression specifications** for defects confirmed by source inspection. They must not run in the release pipeline as long as the source still contains the failure. Do not delete or weaken them to obtain a green job.

## 16/11/2026 — navigation readiness

`python3 scripts/audit/ames_navigation_readiness_red.py`

Three fake-browser tests, no CDP/HTTP/network/SQLite interaction:
- ExtJS element that exists but is hidden is NOT visible;
- a selector in the wrong route cannot prove the requested page;
- 3022 route in the URL without rendered controls cannot be READY.

The current `navigation.py` violates all three:
- `_has_visible` uses `locator.count()`, which measures presence, not visibility;
- `_wait_view` accepts a selector independently of the requested route;
- `ensure_main_view('3022', selector=None)` trusts the route string even when ExtJS has not rendered.

**Next engineering step:** an independent reviewer must reproduce this RED, change navigation in isolation (not the collector), then run the same tests GREEN plus all normal 3022, 3074, 2114, 3012 and Chrome/CDP flow tests. Never solve it by force-clicks, blanket sleeps, or injecting a second agent.

References: `docs/ames/audits/AUDITORIA_TRANSVERSAL_CENTRAL_20261116.md`, PR #70 DRAFT. Factory GREEN always requires operator validation.
