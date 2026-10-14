from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

import origin_policy


def test_loopback_is_always_allowed_and_remote_https_is_explicit():
    state = origin_policy.evaluate(
        {"allowed_origins": ["https://central-cora-v2.vercel.app/"]},
        8765,
    )
    assert "http://127.0.0.1:8765" in state["allowed"]
    assert "http://localhost:8765" in state["allowed"]
    assert "https://central-cora-v2.vercel.app" in state["allowed"]
    assert state["summary"]["remote_origins"] == 1
    assert state["summary"]["rejected_entries"] == 0
    assert state["summary"]["ok"] is True


def test_legacy_invalid_origins_are_rejected_at_runtime_without_mutating_config():
    config = {
        "allowed_origins": [
            "http://attacker.example",
            "https://example.com/path",
            "javascript:alert(1)",
            "https://central-cora-v2.vercel.app",
        ]
    }
    before = list(config["allowed_origins"])
    state = origin_policy.evaluate(config, 8765)
    assert config["allowed_origins"] == before
    assert "http://attacker.example" not in state["allowed"]
    assert "https://example.com/path" not in state["allowed"]
    assert "https://central-cora-v2.vercel.app" in state["allowed"]
    assert state["summary"]["rejected_entries"] == 3
    assert state["summary"]["remote_origins"] == 1
    assert state["summary"]["ok"] is False


def test_duplicate_and_non_list_legacy_values_fail_closed():
    duplicated = origin_policy.evaluate(
        {"allowed_origins": ["https://central-cora-v2.vercel.app", "https://central-cora-v2.vercel.app/"]},
        8765,
    )
    assert duplicated["summary"]["duplicate_entries"] == 1

    scalar = origin_policy.evaluate({"allowed_origins": "http://remote.example"}, 8765)
    assert scalar["summary"]["rejected_entries"] == 1
    assert scalar["summary"]["remote_origins"] == 0
    assert scalar["allowed"] == {"http://127.0.0.1:8765", "http://localhost:8765"}


def main():
    tests = [
        test_loopback_is_always_allowed_and_remote_https_is_explicit,
        test_legacy_invalid_origins_are_rejected_at_runtime_without_mutating_config,
        test_duplicate_and_non_list_legacy_values_fail_closed,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS runtime origin policy ({len(tests)} tests)")


if __name__ == "__main__":
    main()
