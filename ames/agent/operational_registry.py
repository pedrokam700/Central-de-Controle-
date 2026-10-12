"""Canonical factory identity shared by hardened Python consumers.

MES line IDs are operational identities and must not be inferred from labels.
This mirrors ames/data/operational-registry.mjs while the frozen collector is
migrated gradually; changing these IDs requires an explicit factory migration.
"""
from __future__ import annotations

SITE_ID = "extrema"
SITE_LABEL = "Extrema"
SITE_TIMEZONE = "America/Sao_Paulo"

LINES = (
    {"id": "TAN10101", "label": "Linha 1", "enabled": True},
    {"id": "TAN10102", "label": "Linha 2", "enabled": True},
    {"id": "TAN10103", "label": "Linha 3", "enabled": True},
)

LINE_IDS = tuple(line["id"] for line in LINES if line["enabled"])
LINE_LABELS = {line["id"]: line["label"] for line in LINES}
LINE_ALIASES = {line["label"]: line["id"] for line in LINES}


def require_line(value: object) -> str:
    line = str(value or "").strip().upper()
    if line not in LINE_IDS:
        raise ValueError("An explicit registered MES line is required")
    return line


def public_contract() -> dict:
    return {
        "schema": "central-operational-registry-v1",
        "site": {"id": SITE_ID, "label": SITE_LABEL, "timezone": SITE_TIMEZONE},
        "lines": [dict(line) for line in LINES],
    }
