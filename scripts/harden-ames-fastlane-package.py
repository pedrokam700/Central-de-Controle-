from __future__ import annotations

import argparse
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
PACKAGE = DIST / "ames-fastlane-test"
PAYLOAD = PACKAGE / "payload"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"fastlane hardener: contract not found: {label}")
    return text.replace(old, new, 1)


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

    # Runtime guard is deliberately fastlane-only: the validated CLEAN V3 collectors stay untouched.
    guard_src = ROOT / "ames" / "agent" / "fastlane_runtime_guard.py"
    guard_dst = PAYLOAD / "ames-agent" / "fastlane_runtime_guard.py"
    if not guard_src.is_file():
        raise SystemExit(f"missing {guard_src}")
    shutil.copy2(guard_src, guard_dst)

    bootstrap = PAYLOAD / "agent_fastlane_bootstrap.pyw"
    b = bootstrap.read_text(encoding="utf-8")
    marker = "if str(BASE) not in sys.path:\n    sys.path.insert(0, str(BASE))\ntry:\n"
    replacement = (
        "if str(BASE) not in sys.path:\n"
        "    sys.path.insert(0, str(BASE))\n"
        "import fastlane_runtime_guard\n"
        "fastlane_runtime_guard.install()\n"
        "try:\n"
    )
    b = replace_once(b, marker, replacement, "bootstrap runtime guard install")
    bootstrap.write_text(b, encoding="utf-8")

    updater = PACKAGE / "APLICAR_FASTLANE_TESTE.ps1"
    u = updater.read_text(encoding="utf-8-sig")
    u = u.replace(
        "Copy-Item -LiteralPath (Join-Path $payloadAgent '*')",
        "Copy-Item -Path (Join-Path $payloadAgent '*')",
    )
    updater.write_text(u, encoding="utf-8-sig")

    launcher = PAYLOAD / "INICIAR_FASTLANE_TESTE.ps1"
    text = launcher.read_text(encoding="utf-8-sig")

    old = """    L '[6/7] Aguardando agente CANONICAL-R11-BATCH...'
    $health = $null
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 1
        try {
            $h = Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 2
            if ($h.ok -and [string]$h.agent_build -eq 'CANONICAL-R11-BATCH') { $health = $h; break }
        } catch {}
    }
    if (-not $health) {
        $stderr = Join-Path $Root 'logs\\agent_fastlane_stderr.log'
        $stdout = Join-Path $Root 'logs\\agent_fastlane_stdout.log'
        if (Test-Path $stderr) { Get-Content -LiteralPath $stderr -Tail 80 | ForEach-Object { L $_ Yellow } }
        if (Test-Path $stdout) { Get-Content -LiteralPath $stdout -Tail 80 | ForEach-Object { L $_ Yellow } }
        F 'Agente fastlane nao respondeu.'
    }
    L ('      Agente OK | A-MES=' + $health.ames_reachable + ' | CDP=' + $health.chrome_cdp_reachable) Green
"""

    new = """    L '[6/7] Aguardando agente CANONICAL-R11-BATCH...'
    # Startup readiness MUST be lightweight. /health performs the full preflight and
    # can legitimately take longer than a short launcher timeout on factory PCs.
    $ready = $null
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        try {
            $r = Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/ready' -TimeoutSec 3
            if ($r.ok -and $r.ready -and [string]$r.agent_build -eq 'CANONICAL-R11-BATCH') { $ready = $r; break }
        } catch {}
    }
    if (-not $ready) {
        $stderr = Join-Path $Root 'logs\\agent_fastlane_stderr.log'
        $stdout = Join-Path $Root 'logs\\agent_fastlane_stdout.log'
        if (Test-Path $stderr) { Get-Content -LiteralPath $stderr -Tail 80 | ForEach-Object { L $_ Yellow } }
        if (Test-Path $stdout) { Get-Content -LiteralPath $stdout -Tail 80 | ForEach-Object { L $_ Yellow } }
        F 'Agente fastlane nao respondeu ao readiness leve.'
    }
    L ('      Agente pronto | PID=' + $ready.pid + ' | build=' + $ready.agent_build) Green

    # Full health is diagnostic, not a startup gate. Run it once with a generous
    # timeout; if it is slow, keep going and let the interface show the diagnostics.
    $health = $null
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8765/api/v1/health' -TimeoutSec 20
    } catch {
        L ('[AVISO] Agente pronto, mas diagnostico /health demorou: ' + $_.Exception.Message) Yellow
    }
    if ($health) {
        L ('      Diagnostico | A-MES=' + $health.ames_reachable + ' | CDP=' + $health.chrome_cdp_reachable) Green
    }
"""

    text = replace_once(text, old, new, "launcher readiness handshake")
    launcher.write_text(text, encoding="utf-8-sig")

    # Package-level contracts. These are intentionally strict because this is the
    # exact artifact a factory user will run.
    for p in (launcher, updater):
        assert_no_bad_controls(p)
    assert_no_bad_controls(bootstrap)

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
