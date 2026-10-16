import json
from datetime import datetime
from pathlib import Path


def executar_diagnostico(browser, log_dir: Path):
    log_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    paginas = []

    print("[OK] Conectado ao Chrome via CDP 9222")
    print(f"[INFO] Paginas abertas: {len(browser.pages)}")

    for idx, page in enumerate(browser.pages):
        try:
            title = page.title()
        except Exception:
            title = "<titulo indisponivel>"
        item = {"index": idx, "title": title, "url": page.url, "frames": len(page.frames)}
        paginas.append(item)
        print(f"  [{idx}] {title} | {page.url} | frames={len(page.frames)}")

    page = browser.choose_active_page()
    print(f"[OK] Pagina selecionada: {page.title()} | {page.url}")

    screenshot = log_dir / f"diagnostico_{stamp}.png"
    try:
        page.screenshot(path=str(screenshot), full_page=True)
        print(f"[OK] Screenshot: {screenshot}")
    except Exception as exc:
        print(f"[AVISO] Screenshot nao gerado: {exc}")

    saida = log_dir / f"diagnostico_{stamp}.json"
    saida.write_text(
        json.dumps({"selected_url": page.url, "pages": paginas}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"[OK] Diagnostico: {saida}")
    return saida
