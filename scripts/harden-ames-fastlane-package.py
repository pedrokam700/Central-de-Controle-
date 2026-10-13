from __future__ import annotations

import argparse
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
PACKAGE = DIST / "ames-fastlane-test"
PAYLOAD = PACKAGE / "payload"
TEMPLATES = ROOT / "scripts" / "templates"

PREVIEW = "https://central-cora-v2-git-ui-ames-fastlane-sn-2ae6e4-pedrokam700-6477.vercel.app/central-de-Controle/"
ORIGIN = "https://central-cora-v2-git-ui-ames-fastlane-sn-2ae6e4-pedrokam700-6477.vercel.app"


def assert_no_bad_controls(path: Path) -> None:
    text = path.read_text(encoding="utf-8-sig")
    bad = sorted({ord(ch) for ch in text if ord(ch) < 32 and ch not in "\r\n\t"})
    if bad:
        raise SystemExit(f"{path}: control chars {bad}")
    if "```" in text:
        raise SystemExit(f"{path}: markdown/backtick escaping artifact")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("head")
    args = ap.parse_args()
    head = args.head

    if not PACKAGE.is_dir():
        raise SystemExit("dist/ames-fastlane-test missing; run builder first")

    # Runtime guard is fastlane-only. CLEAN V3 and frozen 3028 stay untouched.
    guard_src = ROOT / "ames" / "agent" / "fastlane_runtime_guard.py"
    guard_dst = PAYLOAD / "ames-agent" / "fastlane_runtime_guard.py"
    if not guard_src.is_file():
        raise SystemExit(f"missing {guard_src}")
    shutil.copy2(guard_src, guard_dst)

    # Canonical files replace generated variants entirely. We do not patch launchers
    # with string surgery anymore; the exact Windows scripts are versioned and gated.
    bootstrap_src = TEMPLATES / "agent_fastlane_bootstrap.pyw"
    launcher_src = TEMPLATES / "INICIAR_FASTLANE_TESTE.ps1"
    if not bootstrap_src.is_file() or not launcher_src.is_file():
        raise SystemExit("canonical fastlane templates missing")

    bootstrap = PAYLOAD / "agent_fastlane_bootstrap.pyw"
    shutil.copy2(bootstrap_src, bootstrap)

    launcher = PAYLOAD / "INICIAR_FASTLANE_TESTE.ps1"
    launcher_text = launcher_src.read_text(encoding="utf-8")
    launcher_text = launcher_text.replace("__ORIGIN__", ORIGIN).replace("__PREVIEW__", PREVIEW)
    if "__ORIGIN__" in launcher_text or "__PREVIEW__" in launcher_text:
        raise SystemExit("unresolved launcher placeholder")
    launcher.write_text(launcher_text, encoding="utf-8-sig")

    updater = PACKAGE / "APLICAR_FASTLANE_TESTE.ps1"
    u = updater.read_text(encoding="utf-8-sig")
    u = u.replace(
        "Copy-Item -LiteralPath (Join-Path $payloadAgent '*')",
        "Copy-Item -Path (Join-Path $payloadAgent '*')",
    )
    updater.write_text(u, encoding="utf-8-sig")

    # Package-level contracts run against the exact files that go into the ZIP.
    for p in (launcher, updater, bootstrap, guard_dst):
        assert_no_bad_controls(p)

    launch_text = launcher.read_text(encoding="utf-8-sig")
    boot_text = bootstrap.read_text(encoding="utf-8")
    if "/api/v1/ready" not in launch_text:
        raise SystemExit("generated launcher does not use lightweight /ready")
    if "api/v1/health' -TimeoutSec 2" in launch_text:
        raise SystemExit("generated launcher still polls heavy /health with 2s timeout")
    if launch_text.count("/api/v1/health") != 1:
        raise SystemExit("generated launcher must call full /health exactly once")
    if "fastlane_runtime_guard.install()" not in boot_text:
        raise SystemExit("generated bootstrap does not install runtime guard")
    if not guard_dst.is_file():
        raise SystemExit("runtime guard missing from payload")

    zip_path = DIST / f"CENTRAL_AMES_FASTLANE_3012_TESTE_{head[:8]}.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(PACKAGE.rglob("*")):
            if p.is_file():
                zf.write(p, p.relative_to(PACKAGE.parent))
    print(zip_path)


if __name__ == "__main__":
    main()
