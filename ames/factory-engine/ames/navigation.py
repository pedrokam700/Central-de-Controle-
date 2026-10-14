from __future__ import annotations

import time
from urllib.parse import urlsplit, urlunsplit


class AmesNavigation:
    """Navigation helper for the already-authenticated dedicated A-MES Chrome.

    It only changes/open read-only views. It never enters credentials or presses
    mutation buttons such as Confirm/Update/Cancel.
    """

    ROUTES = {
        "3028": "UAWIP.form.VwFpyInquireView",
        "3074": "UAWIP.form.VwAutoScanSnView",
        "3022": "UAWIP.form.VwViewLotHistoryView",
        "2114": "UAWIP.form.TrDefectLotByHandView",
    }

    def __init__(self, browser):
        self.browser = browser

    @staticmethod
    def _is_login(page) -> bool:
        try:
            url = (page.url or "").lower()
            if "/login" in url:
                return True
            txt = (page.locator("body").inner_text(timeout=700) or "").lower()
            return "welcome to a-mes" in txt and "password" in txt and "login" in txt
        except Exception:
            return False

    @staticmethod
    def _has_visible(page, selector: str) -> bool:
        for frame in page.frames:
            try:
                if frame.locator(selector).count():
                    return True
            except Exception:
                pass
        return False

    def _main_page(self):
        candidates = []
        for p in self.browser.pages:
            try:
                u = (p.url or "").lower()
                if "/asymes/home" in u or "/asymes/home" in u.replace("asymes", "asymes"):
                    candidates.append(p)
            except Exception:
                pass
        if not candidates:
            for p in self.browser.pages:
                try:
                    u = (p.url or "").lower()
                    if "172.29.185.215" in u and "/opc" not in u and "/login" not in u:
                        candidates.append(p)
                except Exception:
                    pass
        if not candidates:
            raise RuntimeError("Aba principal do A-MES não encontrada no Chrome dedicado.")
        page = candidates[-1]
        if self._is_login(page):
            raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES e tente novamente.")
        return page

    def _wait_view(self, page, route: str, selector: str | None, timeout_s: float):
        deadline = time.time() + timeout_s
        route_low = route.lower()
        while time.time() < deadline:
            if self._is_login(page):
                raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES e tente novamente.")
            try:
                if route_low in (page.url or "").lower() and (not selector or self._has_visible(page, selector)):
                    return page
            except Exception:
                pass
            if selector and self._has_visible(page, selector):
                return page
            time.sleep(0.35)
        raise RuntimeError(f"A-MES não confirmou a view {route} dentro de {timeout_s:.0f}s.")

    def ensure_main_view(self, view: str, selector: str | None = None, timeout_s: float = 15.0):
        route = self.ROUTES[view]
        for p in reversed(self.browser.pages):
            try:
                if route.lower() in (p.url or "").lower() and (not selector or self._has_visible(p, selector)):
                    if self._is_login(p):
                        raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES e tente novamente.")
                    return p
            except Exception:
                pass
        page = self._main_page()
        try:
            page.evaluate("r => { if (location.hash !== '#' + r) location.hash = '#' + r; }", route)
        except Exception:
            base = (page.url or "").split("#", 1)[0]
            page.goto(base + "#" + route, wait_until="domcontentloaded", timeout=int(timeout_s * 1000))
        return self._wait_view(page, route, selector, timeout_s)

    def ensure_3074(self, timeout_s: float = 15.0):
        return self.ensure_main_view("3074", 'input[name="sn"]:visible', timeout_s)

    def ensure_3022(self, timeout_s: float = 15.0):
        # 3022 field names vary by MES release; route is the stable anchor.
        return self.ensure_main_view("3022", None, timeout_s)

    def _opc_url_from_main(self) -> str:
        page = self._main_page()
        parts = urlsplit(page.url.split("#", 1)[0])
        path = parts.path
        low = path.lower()
        if low.endswith("/home"):
            path = path[:-4] + "opc"
        elif "/home" in low:
            idx = low.rfind("/home")
            path = path[:idx] + "/opc" + path[idx + 5:]
        else:
            path = "/asymes/opc"
        return urlunsplit((parts.scheme, parts.netloc, path, parts.query, ""))

    def ensure_2114(self, timeout_s: float = 18.0):
        route = self.ROUTES["2114"]
        for p in reversed(self.browser.pages):
            try:
                if route.lower() in (p.url or "").lower() and self._has_visible(p, 'input[name="snImei"]:visible'):
                    if self._is_login(p):
                        raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES/OPC e tente novamente.")
                    return p
            except Exception:
                pass
        opc = None
        for p in reversed(self.browser.pages):
            try:
                if "/asymes/opc" in (p.url or "").lower():
                    opc = p
                    break
            except Exception:
                pass
        if opc is None:
            opc = self.browser.context.new_page()
            opc.goto(self._opc_url_from_main(), wait_until="domcontentloaded", timeout=int(timeout_s * 1000))
        if self._is_login(opc):
            raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES/OPC e tente novamente.")
        try:
            opc.evaluate("r => { if (location.hash !== '#' + r) location.hash = '#' + r; }", route)
        except Exception:
            base = (opc.url or "").split("#", 1)[0]
            opc.goto(base + "#" + route, wait_until="domcontentloaded", timeout=int(timeout_s * 1000))
        return self._wait_view(opc, route, 'input[name="snImei"]:visible', timeout_s)

    def ensure_current_shift_2114(self, page=None, strict: bool = False):
        """Best-effort preparation of the 2114 shift selector.

        A missing/unrecognized Shift is a 2114-source failure, not a reason to
        suppress 3074/3022.  Callers that truly need a hard prerequisite can pass
        strict=True; normal composite collection degrades per source.
        """
        from ames.shift_2114 import ensure_shift
        try:
            return ensure_shift(page or self.ensure_2114())
        except Exception:
            if strict:
                raise
            return None
