"""A-MES network diagnostics and conservative self-healing for Windows workstations.

The guardian never changes the Ethernet default gateway, DNS or proxy. It may only:
- reconnect the configured Wi-Fi profile used by A-MES;
- inspect/repair the single host route to the configured A-MES host (/32), and only
  when running elevated.

All repairs are best-effort and observable. A failure to repair must never crash the
local agent or destroy an in-flight MES job.
"""
from __future__ import annotations

import ctypes
import json
import os
import re
import socket
import subprocess
import threading
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

AMES_HOST_DEFAULT = "172.29.185.215"
AMES_PORT_DEFAULT = 80
WIFI_PROFILE_DEFAULT = "TAXXX_5G"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _norm(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(ch for ch in text if not unicodedata.combining(ch)).strip().casefold()


def _run(args, timeout=8):
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return {"ok": proc.returncode == 0, "code": proc.returncode,
                "stdout": proc.stdout or "", "stderr": proc.stderr or ""}
    except Exception as exc:
        return {"ok": False, "code": None, "stdout": "", "stderr": f"{type(exc).__name__}: {exc}"}


def _powershell(script, timeout=10):
    exe = os.environ.get("SystemRoot", r"C:\Windows") + r"\System32\WindowsPowerShell\v1.0\powershell.exe"
    if not Path(exe).exists():
        exe = "powershell.exe"
    return _run([exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], timeout=timeout)


def _ps_json(script, default=None):
    result = _powershell(script)
    if not result["ok"]:
        return default
    raw = result["stdout"].strip()
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


def is_admin():
    if os.name != "nt":
        return False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def tcp_probe(host=AMES_HOST_DEFAULT, port=AMES_PORT_DEFAULT, timeout=1.2):
    try:
        with socket.create_connection((str(host), int(port)), timeout=timeout):
            return True
    except OSError:
        return False


def wlan_state():
    """Return the current Windows WLAN interface/SSID without assuming UI language."""
    if os.name != "nt":
        return {"supported": False, "connected": None, "ssid": None, "interface": None, "signal": None}
    result = _run(["netsh", "wlan", "show", "interfaces"], timeout=6)
    values = {}
    for line in result["stdout"].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        values[_norm(key)] = value.strip()
    name = values.get("name") or values.get("nome")
    state = values.get("state") or values.get("estado") or ""
    ssid = values.get("ssid")
    signal = values.get("signal") or values.get("sinal")
    connected = _norm(state) in {"connected", "conectado"}
    return {"supported": True, "ok": result["ok"], "connected": connected,
            "ssid": ssid, "interface": name, "signal": signal, "raw_state": state}


def interface_state(interface_name=None):
    if os.name != "nt":
        return None
    if interface_name:
        safe = str(interface_name).replace("'", "''")
        where = f"Where-Object {{$_.Name -eq '{safe}'}} | "
    else:
        where = "Where-Object {$_.Status -eq 'Up'} | "
    return _ps_json(
        "Get-NetAdapter | " + where +
        "Select-Object -First 1 Name,ifIndex,Status,InterfaceDescription,MacAddress,LinkSpeed | ConvertTo-Json -Compress",
        default=None,
    )


def route_state(host=AMES_HOST_DEFAULT):
    if os.name != "nt":
        return {"supported": False, "route": None, "best": None}
    host = str(host)
    prefix = host + "/32"
    route = _ps_json(
        f"Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '{prefix}' -ErrorAction SilentlyContinue | "
        "Sort-Object RouteMetric | Select-Object -First 1 DestinationPrefix,InterfaceIndex,NextHop,RouteMetric,PolicyStore,State | ConvertTo-Json -Compress",
        default=None,
    )
    best = _ps_json(
        f"$r=Find-NetRoute -RemoteIPAddress '{host}' -ErrorAction SilentlyContinue; "
        "if($r){$r|Select-Object InterfaceIndex,InterfaceAlias,NextHop,RouteMetric,DestinationPrefix|ConvertTo-Json -Compress}",
        default=None,
    )
    return {"supported": True, "route": route, "best": best}


def snapshot(host=AMES_HOST_DEFAULT, port=AMES_PORT_DEFAULT, expected_ssid=WIFI_PROFILE_DEFAULT):
    wlan = wlan_state()
    route = route_state(host)
    current_ssid = str(wlan.get("ssid") or "")
    return {
        "at": _now(),
        "host": str(host),
        "port": int(port),
        "reachable": tcp_probe(host, port),
        "expected_ssid": expected_ssid,
        "wifi": wlan,
        "wifi_expected": bool(wlan.get("connected") and _norm(current_ssid) == _norm(expected_ssid)),
        "interface": interface_state(wlan.get("interface")),
        "route": route,
        "elevated": is_admin(),
    }


def reconnect_wifi(profile=WIFI_PROFILE_DEFAULT, wait_seconds=12):
    before = wlan_state()
    if before.get("connected") and _norm(before.get("ssid")) == _norm(profile):
        return {"ok": True, "changed": False, "before": before, "after": before, "message": "Wi-Fi A-MES ja conectado"}
    if os.name != "nt":
        return {"ok": False, "changed": False, "before": before, "message": "Reconexao automatica suportada apenas no Windows"}
    result = _run(["netsh", "wlan", "connect", f"name={profile}"], timeout=8)
    deadline = time.time() + max(1, int(wait_seconds))
    after = before
    while time.time() < deadline:
        time.sleep(1)
        after = wlan_state()
        if after.get("connected") and _norm(after.get("ssid")) == _norm(profile):
            return {"ok": True, "changed": True, "before": before, "after": after,
                    "message": "Wi-Fi A-MES reconectado", "command": result}
    return {"ok": False, "changed": False, "before": before, "after": after,
            "message": "Perfil Wi-Fi nao reconectou dentro do limite", "command": result}


def _gateway_for_interface(index):
    if not index:
        return None
    data = _ps_json(
        f"$c=Get-NetIPConfiguration -InterfaceIndex {int(index)} -ErrorAction SilentlyContinue; "
        "if($c -and $c.IPv4DefaultGateway){$c.IPv4DefaultGateway.NextHop|Select-Object -First 1|ConvertTo-Json -Compress}",
        default=None,
    )
    if isinstance(data, str):
        return data.strip() or None
    return None


def repair_host_route(host=AMES_HOST_DEFAULT, interface_name=None):
    """Repair only host/32 route. Requires elevation; never changes default routes."""
    before = route_state(host)
    if os.name != "nt":
        return {"ok": False, "changed": False, "before": before, "message": "Rota automatica suportada apenas no Windows"}
    if not is_admin():
        return {"ok": False, "changed": False, "before": before, "needs_admin": True,
                "message": "Reparo da rota requer permissao de administrador"}
    wlan = wlan_state()
    name = interface_name or wlan.get("interface")
    adapter = interface_state(name)
    if not adapter or not adapter.get("ifIndex"):
        return {"ok": False, "changed": False, "before": before, "message": "Interface Wi-Fi A-MES nao encontrada"}
    index = int(adapter["ifIndex"])
    gateway = _gateway_for_interface(index) or "0.0.0.0"
    prefix = str(host) + "/32"
    script = (
        f"$p='{prefix}'; $i={index}; $g='{gateway}'; "
        "Get-NetRoute -AddressFamily IPv4 -DestinationPrefix $p -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue; "
        "New-NetRoute -DestinationPrefix $p -InterfaceIndex $i -NextHop $g -RouteMetric 1 -PolicyStore PersistentStore -ErrorAction Stop | Out-Null"
    )
    command = _powershell(script, timeout=12)
    after = route_state(host)
    ok = bool(command["ok"] and after.get("route") and int(after["route"].get("InterfaceIndex") or -1) == index)
    return {"ok": ok, "changed": ok, "before": before, "after": after, "interface": adapter,
            "gateway": gateway, "command": command,
            "message": "Rota A-MES /32 reparada" if ok else "Nao foi possivel confirmar a rota A-MES /32"}


def repair(host=AMES_HOST_DEFAULT, port=AMES_PORT_DEFAULT, expected_ssid=WIFI_PROFILE_DEFAULT):
    before = snapshot(host, port, expected_ssid)
    actions = []
    if before.get("reachable"):
        return {"ok": True, "changed": False, "before": before, "after": before, "actions": actions,
                "message": "A-MES ja alcancavel"}
    wifi = reconnect_wifi(expected_ssid)
    actions.append({"wifi": wifi})
    if tcp_probe(host, port):
        after = snapshot(host, port, expected_ssid)
        return {"ok": True, "changed": bool(wifi.get("changed")), "before": before, "after": after,
                "actions": actions, "message": "A-MES recuperado apos reconectar Wi-Fi"}
    route = repair_host_route(host, (wifi.get("after") or {}).get("interface"))
    actions.append({"route": route})
    after = snapshot(host, port, expected_ssid)
    return {"ok": bool(after.get("reachable")), "changed": bool(wifi.get("changed") or route.get("changed")),
            "before": before, "after": after, "actions": actions,
            "message": "A-MES recuperado" if after.get("reachable") else "A-MES continua indisponivel apos reparo conservador"}


class NetworkGuardian:
    """Background observer with hysteresis; repairs only after repeated failures."""
    def __init__(self, *, host=AMES_HOST_DEFAULT, port=AMES_PORT_DEFAULT, expected_ssid=WIFI_PROFILE_DEFAULT,
                 log_path=None, interval=15, failures_before_repair=3, cooldown=90):
        self.host = host
        self.port = int(port)
        self.expected_ssid = expected_ssid
        self.log_path = Path(log_path) if log_path else None
        self.interval = max(5, int(interval))
        self.failures_before_repair = max(2, int(failures_before_repair))
        self.cooldown = max(30, int(cooldown))
        self.stop_event = threading.Event()
        self.thread = None
        self.failures = 0
        self.last_repair = 0.0
        self.last_signature = None
        self.last = None

    def _write(self, event, payload):
        if not self.log_path:
            return
        try:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            with self.log_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps({"at": _now(), "event": event, "payload": payload}, ensure_ascii=False, default=str) + "\n")
        except Exception:
            pass

    def _loop(self):
        while not self.stop_event.wait(self.interval):
            state = snapshot(self.host, self.port, self.expected_ssid)
            self.last = state
            signature = (state.get("reachable"), state.get("wifi_expected"),
                         (state.get("wifi") or {}).get("ssid"),
                         json.dumps((state.get("route") or {}).get("route"), sort_keys=True, default=str))
            if signature != self.last_signature:
                self._write("NETWORK_STATE", state)
                self.last_signature = signature
            if state.get("reachable"):
                self.failures = 0
                continue
            self.failures += 1
            now = time.monotonic()
            if self.failures < self.failures_before_repair or now - self.last_repair < self.cooldown:
                continue
            self.last_repair = now
            result = repair(self.host, self.port, self.expected_ssid)
            self._write("NETWORK_REPAIR", result)
            if result.get("ok"):
                self.failures = 0

    def start(self):
        if self.thread and self.thread.is_alive():
            return self
        self.thread = threading.Thread(target=self._loop, name="ames-network-guardian", daemon=True)
        self.thread.start()
        return self

    def stop(self):
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)

    def state(self):
        return {"running": bool(self.thread and self.thread.is_alive()), "failures": self.failures,
                "last_repair_monotonic": self.last_repair, "last": self.last}
