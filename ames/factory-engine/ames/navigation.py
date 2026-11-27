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
        "3012": "UAWIP.form.VwDefectRepairView",
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
        """Require a visible live control, not merely a DOM match.

        Hidden ExtJS copies can survive view transitions. Bound the number of
        matches inspected so an old large page cannot stall navigation.
        """
        for frame in page.frames:
            try:
                locator = frame.locator(selector)
                for index in range(min(locator.count(), 12)):
                    try:
                        if locator.nth(index).is_visible(timeout=350):
                            return True
                    except Exception:
                        # A control can be detached/recreated between count and
                        # is_visible; never treat that transition as readiness.
                        continue
            except Exception:
                pass
        return False

    @staticmethod
    def _is_home_surface(page) -> bool:
        try:
            u = (page.url or "").lower()
            return "/asymes/home" in u and "/asymes/opc" not in u and "/login" not in u
        except Exception:
            return False

    def _main_page(self):
        """Reuse Home, or recover it from the already connected OPC origin.

        Never start another Chrome, log in, or guess a production host. Opening
        Home is a read-only navigation in the *same* existing CDP context.
        An ambiguous origin or login redirects must stop before any MES query.
        """
        homes, opcs, logins = [], [], []
        for p in self.browser.pages:
            try:
                parts = urlsplit(p.url or "")
                if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
                    continue
                path = parts.path.lower().rstrip("/")
                origin = (parts.scheme.lower(), parts.netloc.lower())
                if path == "/asymes/home":
                    homes.append((p, parts, origin))
                elif path == "/asymes/opc":
                    opcs.append((p, parts, origin))
                elif path.endswith("/login") and "/asymes" in path:
                    logins.append((p, parts, origin))
            except Exception:
                continue

        if homes:
            # Never silently attach an unrelated host's Home when multiple
            # A-MES origins share this CDP browser.
            if len({entry[2] for entry in homes + opcs}) != 1:
                raise RuntimeError("HOME_ORIGIN_AMBIGUOUS: múltiplas origens A-MES no Chrome dedicado.")
            page = homes[-1][0]
            if self._is_login(page):
                raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES e tente novamente.")
            return page

        if logins:
            raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES e tente novamente.")
        if not opcs:
            raise RuntimeError("Aba principal do A-MES não encontrada no Chrome dedicado.")
        if len({entry[2] for entry in opcs}) != 1:
            raise RuntimeError("HOME_ORIGIN_AMBIGUOUS: múltiplas origens OPC; não é seguro escolher o servidor.")

        opc_page, parts, _ = opcs[-1]
        if self._is_login(opc_page):
            raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES/OPC e tente novamente.")
        home_url = urlunsplit((parts.scheme, parts.netloc, "/asymes/home", parts.query, ""))
        page = self.browser.context.new_page()
        try:
            page.goto(home_url, wait_until="domcontentloaded", timeout=15000)
            if self._is_login(page):
                raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES e tente novamente.")
            if not self._is_home_surface(page):
                raise RuntimeError("HOME_SESSION_NOT_READY: navegação Home não confirmada, sem consulta ao MES.")
            return page
        except Exception:
            self._close_created(page)
            raise

    @staticmethod
    def _close_created(page):
        try:
            page.close()
        except Exception:
            pass

    def _wait_view(self, page, route: str, selector: str | None, timeout_s: float):
        deadline = time.time() + timeout_s
        route_low = route.lower()
        while time.time() < deadline:
            if self._is_login(page):
                raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES e tente novamente.")
            try:
                # A field in another ExtJS view is never proof that this
                # requested route has loaded, even when the name is identical.
                if route_low in (page.url or "").lower() and (not selector or self._has_visible(page, selector)):
                    return page
            except Exception:
                pass
            time.sleep(0.35)
        raise RuntimeError(f"A-MES não confirmou a view {route} dentro de {timeout_s:.0f}s.")

    def ensure_main_view(self, view: str, selector: str | None = None, timeout_s: float = 15.0):
        route = self.ROUTES[view]
        for p in reversed(self.browser.pages):
            try:
                if self._is_home_surface(p) and route.lower() in (p.url or "").lower() and (not selector or self._has_visible(p, selector)):
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

    def ensure_3012(self, timeout_s: float = 18.0):
        """Open the canonical 3012 on Home, never the look-alike OPC surface."""
        route = self.ROUTES["3012"]
        for p in reversed(self.browser.pages):
            try:
                if self._is_home_surface(p) and route.lower() in (p.url or "").lower():
                    if self._is_login(p):
                        raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES e tente novamente.")
                    return p
            except Exception:
                pass
        page = self._main_page()
        if not self._is_home_surface(page):
            raise RuntimeError("3012 canônica exige a superfície /asymes/home; variante OPC recusada.")
        try:
            page.evaluate("r => { if (location.hash !== '#' + r) location.hash = '#' + r; }", route)
        except Exception:
            base = (page.url or "").split("#", 1)[0]
            page.goto(base + "#" + route, wait_until="domcontentloaded", timeout=int(timeout_s * 1000))
        page = self._wait_view(page, route, None, timeout_s)
        if not self._is_home_surface(page):
            raise RuntimeError("3012 abriu fora da superfície Home; variante OPC recusada.")
        return page

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
                # 2114 is canonical on OPC. The same hash/control
                # found on Home must not be reused as an OPC session.
                if "/asymes/opc" in (p.url or "").lower() and route.lower() in (p.url or "").lower() and self._has_visible(p, 'input[name="snImei"]:visible'):
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
        created = opc is None
        if created:
            # Resolving Home can raise LOGIN_AMES_REQUIRED. Do it before new_page.
            url = self._opc_url_from_main()
            opc = self.browser.context.new_page()
        try:
            if created:
                opc.goto(url, wait_until="domcontentloaded", timeout=int(timeout_s * 1000))
            if self._is_login(opc):
                raise RuntimeError("LOGIN_AMES_REQUIRED: faça login manualmente no A-MES/OPC e tente novamente.")
            try:
                opc.evaluate("r => { if (location.hash !== '#' + r) location.hash = '#' + r; }", route)
            except Exception:
                base = (opc.url or "").split("#", 1)[0]
                opc.goto(base + "#" + route, wait_until="domcontentloaded", timeout=int(timeout_s * 1000))
            return self._wait_view(opc, route, 'input[name="snImei"]:visible', timeout_s)
        except Exception:
            if created:
                self._close_created(opc)
            raise

    def ensure_current_shift_2114(self, page=None, strict: bool = False):
        """Best-effort preparation of the 2114 shift selector.

        A missing/unrecognized Shift is a 2114-source failure, not a reason to
        suppress 3074/3022.  Callers that truly need a hard prerequisite can pass
        strict=True; normal composite collection degrades per source.
        """
        from ames.shift_2114 import ensure_shift, current_shift
        try:
            target = page or self.ensure_2114()
            expected = current_shift()[1]
            # First lookup must be real. Once committed in the MES field,
            # do not re-open/probe every visible ExtJS grid for each PCBA.
            try:
                desc = target.locator('input[name="desc"]:visible')
                if desc.count() == 1 and (desc.first.input_value(timeout=800) or '').strip() == expected:
                    return expected
            except Exception:
                # A missing/transitioning field is not a committed Shift.
                # Let the real ExtJS lookup try to open and confirm it.
                pass
            return ensure_shift(target)
        except Exception:
            if strict:
                raise
            return None
