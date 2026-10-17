"""Attach proven 3022 production context to an already collected live SN lookup.

This module never navigates A-MES or reruns a collector. It only enriches the
result returned by the validated individual lookup and reuses the existing
factory correlator to bind 3022 evidence to exact 2114 failure occurrences.
"""
from __future__ import annotations

import production_shift


def install(agent_module):
    """Wrap ``run_individual_lookup`` once, preserving all collector behavior."""
    original = agent_module.run_individual_lookup
    if getattr(original, "_sn_production_context_bridge", False):
        return original

    def wrapped(engine_dir, *args, **kwargs):
        result = original(engine_dir, *args, **kwargs)
        if not isinstance(result, dict) or kwargs.get("include_3022", True) is False:
            return result

        local = result.get("local_snapshot") or {}
        cached_contexts = list(local.get("process_contexts") or [])
        try:
            production_shift.enrich_sn(result, grid_offset=0)
            production_shift.correlate_sn(result, engine_dir, grid_offset=0)
            target = result.setdefault("local_snapshot", {})
            live_contexts = list(target.get("process_contexts") or [])
            # Exact live correlations lead. Cached contexts remain available for
            # older occurrences, but they can never replace or manufacture live proof.
            target["process_contexts"] = live_contexts + [
                context for context in cached_contexts if context not in live_contexts
            ]
        except Exception as exc:
            result.setdefault("warnings", []).append(
                "Contexto 3022 de producao indisponivel: "
                f"{type(exc).__name__}: {exc}"
            )
        return result

    wrapped._sn_production_context_bridge = True
    wrapped._sn_production_context_original = original
    agent_module.run_individual_lookup = wrapped
    return wrapped
