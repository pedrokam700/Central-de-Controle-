"""Canonical agent entrypoint with production hardening enabled.

Keeps agent_entry.py as the R11/R12 compatibility boundary and layers database
migrations, transactional snapshot visibility and atomic config handling on top.
"""
from __future__ import annotations

import agent_entry as entry
import hardening

HARDENING_STATE = hardening.install(entry.a, entry.canonical)


def main():
    entry.main()


if __name__ == "__main__":
    main()
