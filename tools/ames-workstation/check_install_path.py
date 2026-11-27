"""Check the Windows destination of offline wheels before creating or repairing a venv."""
from importlib.util import cache_from_source
from pathlib import Path
import sys
import zipfile


def windows_length(path):
    return len(str(path).encode("utf-16-le")) // 2


def longest_target(root):
    site = root / ".venv" / "Lib" / "site-packages"
    # Also covers older online-only bundles with the NumPy layout seen on the station.
    longest = site / "numpy/f2py/tests/src/modules/gh26920/two_mods_with_no_public_entities.f90"
    max_length = windows_length(longest)
    for wheel in (root / "vendor" / "wheels").glob("*.whl"):
        with zipfile.ZipFile(wheel) as package:
            for member in package.namelist():
                target = site / member
                if member.endswith(".py"):
                    target = Path(cache_from_source(str(target)))
                length = windows_length(target)
                if length > max_length:
                    max_length = length
                    longest = target
    return longest


def long_paths_enabled():
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\FileSystem") as key:
            return winreg.QueryValueEx(key, "LongPathsEnabled")[0] == 1
    except OSError:
        return False


def check(root, enabled):
    if windows_length(longest_target(root)) < 260:
        return 0
    print("[AVISO] Caminho de dependencia ultrapassa o limite classico do Windows.", flush=True)
    print("Extraia o ZIP interno em uma pasta NOVA e curta, como %USERPROFILE%\\AMES2.")
    print("Preserve a pasta anterior. Na nova pasta, abra 00_CONFERIR_ATUALIZACAO.bat.")
    if enabled:
        print("Caminhos longos habilitados. Prosseguindo com a instalacao.")
        return 0
    print("[ERRO] CAMINHO_LONGO: instalacao interrompida antes do pip.")
    return 22


if __name__ == "__main__":
    sys.exit(check(Path.cwd(), long_paths_enabled()))
