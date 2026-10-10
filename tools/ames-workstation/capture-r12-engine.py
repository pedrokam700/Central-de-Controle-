from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
import zipfile
from pathlib import Path

EXCLUDED_DIRS={'.git','.venv','venv','__pycache__','data','logs','log','output','outputs','checkpoints','chromeprofile','chrome_profile','profile','profiles','node_modules'}
ALLOWED_SUFFIXES={'.py','.json','.txt','.md','.toml','.yaml','.yml'}
SENSITIVE=re.compile(r'password|passwd|senha|cookie|token|secret|credential|authorization|session|wifi|ssid',re.I)
REQUIRED={
    'ames/browser.py':('class AmesBrowser',),
    'ames/tela_3022.py':('class Tela3022','def correlacionar_falha_3022','def extrair_passagens_processo'),
}


def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()


def sanitize_json(value):
    if isinstance(value,dict):
        return {k:sanitize_json(v) for k,v in value.items() if not SENSITIVE.search(str(k))}
    if isinstance(value,list):return [sanitize_json(v) for v in value]
    return value


def locate_engine(root:Path)->Path:
    root=root.resolve()
    candidates=[root,root/'AMES_Automacao_V0_16_PADRAO_VALIDADO']
    candidates += [p for p in root.iterdir() if p.is_dir() and p.name.startswith('AMES_Automacao_')] if root.is_dir() else []
    for candidate in candidates:
        if (candidate/'main.py').is_file() and (candidate/'ames'/'browser.py').is_file():
            return candidate.resolve()
    raise SystemExit('Motor A-MES não encontrado. Informe a pasta que contém main.py e ames/browser.py, ou a raiz do pacote R12.')


def safe_file(engine:Path,path:Path)->tuple[str,bytes]|None:
    rel=path.relative_to(engine).as_posix()
    if any(part.lower() in EXCLUDED_DIRS for part in path.relative_to(engine).parts):return None
    if path.suffix.lower() not in ALLOWED_SUFFIXES:return None
    raw=path.read_bytes()
    if path.suffix.lower()=='.json':
        try:
            obj=json.loads(raw.decode('utf-8-sig'))
            raw=(json.dumps(sanitize_json(obj),ensure_ascii=False,indent=2,sort_keys=True)+'\n').encode('utf-8')
        except Exception:
            # JSON inválido não é necessário para a captura segura.
            return None
    return rel,raw


def validate(engine:Path):
    for rel,symbols in REQUIRED.items():
        path=engine/rel
        if not path.is_file():raise SystemExit(f'R12 incompleta: {rel} ausente')
        text=path.read_text(encoding='utf-8-sig',errors='replace')
        missing=[s for s in symbols if s not in text]
        if missing:raise SystemExit(f'R12 incompatível: {rel} não contém {missing}')
    nav=engine/'ames'/'navigation.py'
    if nav.is_file():
        text=nav.read_text(encoding='utf-8-sig',errors='replace')
        if 'ensure_current_shift_2114' not in text:
            raise SystemExit('R12 incompatível: navigation.py sem ensure_current_shift_2114')


def capture(root:Path,out:Path):
    engine=locate_engine(root);validate(engine)
    files=[]
    for path in sorted(engine.rglob('*')):
        if not path.is_file():continue
        item=safe_file(engine,path)
        if not item:continue
        rel,data=item
        files.append((rel,data))
    if not files:raise SystemExit('Nenhum arquivo seguro encontrado')
    manifest={
        'schema':'central-r12-engine-capture-v1',
        'engine_dir_name':engine.name,
        'files':[{'path':rel,'sha256':sha(data),'size':len(data)} for rel,data in files],
        'required_contract':{
            '3022':['Tela3022','correlacionar_falha_3022','extrair_passagens_processo'],
            '2114_shift':'ensure_current_shift_2114' if (engine/'ames'/'navigation.py').is_file() else 'not_proven_in_navigation.py'
        },
        'excluded':'databases, logs, outputs, checkpoints, virtualenv, Chrome profiles and sensitive JSON keys'
    }
    out=out.resolve();out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists():raise SystemExit(f'Arquivo já existe: {out}')
    with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED) as z:
        for rel,data in files:z.writestr('engine/'+rel,data)
        z.writestr('capture-manifest.json',(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
        z.writestr('README_CAPTURE.txt',('Captura de código do motor R12 para fusão na Central V2.\nNão contém SQLite, logs, outputs, perfil Chrome ou credenciais JSON.\n').encode('utf-8'))
    print(out)
    print('SHA-256:',sha(out.read_bytes()))
    print('Arquivos:',len(files))


if __name__=='__main__':
    p=argparse.ArgumentParser(description='Captura segura do código do motor R12, sem dados/sessão.')
    p.add_argument('root',type=Path,help='Pasta da R12 ou pasta do motor AMES_Automacao_*')
    p.add_argument('output',type=Path,help='ZIP novo de saída')
    a=p.parse_args();capture(a.root,a.output)
