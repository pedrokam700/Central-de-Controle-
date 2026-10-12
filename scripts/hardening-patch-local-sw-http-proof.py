from pathlib import Path

path=Path('scripts/agent-local-frontend-server.test.py')
text=path.read_text(encoding='utf-8')
anchor_stage='    (canonical / "app.js").write_text("export const localApp=true;", encoding="utf-8")\n'
insert_stage=anchor_stage+'    (canonical / "sw.js").write_text("self.addEventListener(\\\"fetch\\\",()=>{});", encoding="utf-8")\n'
anchor_fetch='            assert headers.get_content_type() == "text/javascript"\n\n            status, _, body = fetch(origin + server_module.HEALTH_PATH)\n'
insert_fetch='            assert headers.get_content_type() == "text/javascript"\n\n            status, headers, body = fetch(origin + "/Central-de-Controle-/sw.js")\n            assert status == 200 and b"addEventListener" in body and b"fetch" in body\n            assert headers.get_content_type() == "text/javascript"\n            assert headers.get("X-Content-Type-Options") == "nosniff"\n\n            status, _, body = fetch(origin + server_module.HEALTH_PATH)\n'
if text.count(anchor_stage)!=1:
    raise SystemExit(f'expected one stage anchor, found {text.count(anchor_stage)}')
if text.count(anchor_fetch)!=1:
    raise SystemExit(f'expected one fetch anchor, found {text.count(anchor_fetch)}')
if '/Central-de-Controle-/sw.js' in text:
    raise SystemExit('local sw HTTP proof already present unexpectedly')
next_text=text.replace(anchor_stage,insert_stage).replace(anchor_fetch,insert_fetch)
for required in ['(canonical / "sw.js").write_text','/Central-de-Controle-/sw.js','headers.get_content_type() == "text/javascript"']:
    if required not in next_text:
        raise SystemExit(f'missing patched proof: {required}')
path.write_text(next_text,encoding='utf-8')
print('PASS: local staged Service Worker HTTP proof patched exactly')
