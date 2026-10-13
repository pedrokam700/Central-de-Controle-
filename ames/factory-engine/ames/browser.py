import json
from pathlib import Path

class AmesBrowser:
    def __init__(self, base_dir: Path, endpoint: str = None):
        self.base_dir = Path(base_dir)
        settings = json.loads((self.base_dir / "config" / "settings.json").read_text(encoding="utf-8"))
        self.endpoint = endpoint or settings.get("cdp_endpoint", "http://127.0.0.1:9222")
        self._pw = None
        self.browser = None
        self.context = None

    def connect(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError("Playwright nao instalado.") from exc

        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.connect_over_cdp(self.endpoint)
        if not self.browser.contexts:
            raise RuntimeError("Chrome conectado, mas nenhum contexto foi encontrado.")
        self.context = self.browser.contexts[0]
        return self

    @property
    def pages(self):
        return list(self.context.pages) if self.context else []

    def choose_active_page(self, hint=None):
        pages = self.pages
        if not pages:
            raise RuntimeError("Nenhuma pagina aberta no Chrome de automacao.")

        if hint:
            hint = str(hint).lower()
            for page in reversed(pages):
                try:
                    marker = f"{page.url} {page.title()} {page.locator('body').inner_text(timeout=1200)[:6000]}".lower()
                except Exception:
                    marker = f"{page.url}".lower()
                if hint in marker:
                    return page
        return pages[-1]

    def disconnect(self):
        # Nao chamar browser.close(): o Chrome pertence ao usuario.
        if self._pw:
            try:
                self._pw.stop()
            except Exception:
                pass
        self.browser = None
        self.context = None
        self._pw = None
