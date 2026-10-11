from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "frontend_package.py"

spec = importlib.util.spec_from_file_location("frontend_package", MODULE_PATH)
assert spec and spec.loader
frontend_package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frontend_package)

SHA = "9" * 40


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def build_dist(path: Path) -> None:
    env = dict(os.environ)
    env.update(
        CENTRAL_STATIC_OUT=str(path),
        GITHUB_SHA=SHA,
        GITHUB_REF_NAME="hardening/p0-production-readiness",
        GITHUB_ACTIONS="true",
    )
    subprocess.run(
        ["node", "scripts/build-static.mjs"],
        cwd=ROOT,
        env=env,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def rewrite_with_tamper(source: Path, destination: Path) -> None:
    with zipfile.ZipFile(source, "r") as current, zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as target:
        for info in current.infolist():
            data = current.read(info.filename)
            if info.filename == "frontend/Central-de-Controle-/index.html":
                data += b"\n<!-- tampered -->\n"
            target.writestr(info, data)


def test_same_dist_builds_byte_for_byte_deterministic_package():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        dist = root / "dist"
        build_dist(dist)
        first, second = root / "first.zip", root / "second.zip"
        a = frontend_package.build_package(dist, first, SHA)
        b = frontend_package.build_package(dist, second, SHA)
        check(first.read_bytes() == second.read_bytes(), "immutable frontend package is not deterministic")
        check(a["package_sha256"] == b["package_sha256"], "deterministic package digest drifted")
        check(a["frontend_sha"] == SHA, "frontend SHA missing from package verification")
        check(a["verified"] is True, "frontend package did not self-verify")


def test_package_is_exact_projection_of_static_dist_and_contains_no_runtime_private_data():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        dist = root / "dist"
        build_dist(dist)
        package = root / "frontend.zip"
        result = frontend_package.build_package(dist, package, SHA)
        check(result["verified"] is True, "package verification failed")
        with zipfile.ZipFile(package, "r") as archive:
            manifest = json.loads(archive.read(frontend_package.MANIFEST_NAME))
            check(manifest["activation"] == "package_only_not_launcher_default", "package must not silently become launcher default")
            check(manifest["runtime_private_data_included"] is False, "private runtime marker is unsafe")
            paths = {item["path"] for item in manifest["files"]}
            actual = {path.relative_to(dist).as_posix() for path in dist.rglob("*") if path.is_file()}
            check(paths == actual, "immutable package is not an exact static dist projection")
            for forbidden in frontend_package.FORBIDDEN_NAMES:
                check(not any(Path(path).name == forbidden for path in paths), f"private runtime file leaked: {forbidden}")
            release = json.loads(archive.read("frontend/release-build.json"))
            check(release["sha"] == SHA, "release-build SHA diverged inside package")
            check(release["release_identity_sha256"] == manifest["release_identity_sha256"], "identity digest diverged inside package")


def test_tamper_and_wrong_sha_fail_closed():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        dist = root / "dist"
        build_dist(dist)
        package = root / "frontend.zip"
        frontend_package.build_package(dist, package, SHA)
        try:
            frontend_package.verify_package(package, expected_sha="8" * 40)
        except ValueError:
            pass
        else:
            raise AssertionError("wrong expected SHA must fail closed")

        tampered = root / "tampered.zip"
        rewrite_with_tamper(package, tampered)
        try:
            frontend_package.verify_package(tampered, expected_sha=SHA)
        except ValueError as exc:
            message = str(exc)
            check(
                "size mismatch" in message or "hash mismatch" in message,
                f"tamper failed for unexpected reason: {exc}",
            )
        else:
            raise AssertionError("tampered frontend package was accepted")


def test_builder_rejects_dist_with_wrong_release_sha():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        dist = root / "dist"
        build_dist(dist)
        try:
            frontend_package.build_package(dist, root / "bad.zip", "7" * 40)
        except ValueError as exc:
            check("release-build SHA mismatch" in str(exc), f"unexpected mismatch error: {exc}")
        else:
            raise AssertionError("builder accepted dist from another commit")


if __name__ == "__main__":
    tests = [
        test_same_dist_builds_byte_for_byte_deterministic_package,
        test_package_is_exact_projection_of_static_dist_and_contains_no_runtime_private_data,
        test_tamper_and_wrong_sha_fail_closed,
        test_builder_rejects_dist_with_wrong_release_sha,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS immutable frontend package ({len(tests)} tests)")
