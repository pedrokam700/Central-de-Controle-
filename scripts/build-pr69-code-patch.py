"""Build strictly bounded, data-preserving code delta for the fresh PR69.

Compare two verified CLEAN candidate ZIPs. No SQLite, config, token or guardian
file is included; the update applies only with the operator-stopped agent.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/ames-workstation'))
from pr69_apply_code import BASE_SHA, safe_relative, PatchBlocked


def digest(data):
    return hashlib.sha256(data).hexdigest()


def _verified(z):
    names=set(z.namelist())
    manifest=json.loads(z.read('CANDIDATE_MANIFEST.json'))
    files=manifest.get('files',{})
    if set(files)|{'CANDIDATE_MANIFEST.json'}!=names:
        raise ValueError('Candidate missing files or contains extras')
    for path,expected in files.items():
        if digest(z.read(path))!=expected:
            raise ValueError('Corrupted candidate: '+path)
    return manifest


def build(previous, current, destination):
    with zipfile.ZipFile(previous) as old,zipfile.ZipFile(current) as new:
        before=_verified(old);after=_verified(new)
        if before['sha']!=BASE_SHA or after['sha']==BASE_SHA:
            raise ValueError('Wrong exact PR69 base/target')
        before_names=set(old.namelist());after_names=set(new.namelist())
        if before_names-after_names:
            raise ValueError('A code-only patch cannot delete candidate files')
        changed=[]
        for name in sorted(after_names):
            now=new.read(name)
            was=old.read(name) if name in before_names else None
            if was==now:continue
            safe_relative(name)
            if (name.endswith('.bat') or name.endswith('.ps1') or name.endswith('.cmd') or
                    name.startswith('ames-agent/data/')):
                raise PatchBlocked('unsafe_runtime_change:'+name)
            changed.append({'path':name,'old_sha256':digest(was) if was is not None else None,
                            'new_sha256':digest(now)})
        required={'CANDIDATE_MANIFEST.json','LOCAL_BUNDLE_MANIFEST.json'}
        if not required<=set(item['path'] for item in changed):
            raise ValueError('Missing candidate identity update')
        meta={'format':'PR69_CODE_ONLY_V1','base_sha':before['sha'],
              'target_sha':after['sha'],'files':changed,'sqlite_touched':False,
              'requires_stopped_agent':True,'requires_disabled_guardian':True}
        destination=Path(destination)
        destination.parent.mkdir(parents=True,exist_ok=True)
        with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('PR69_APLICAR_CODIGO.bat',
                (ROOT/'tools/ames-workstation/PR69_APLICAR_CODIGO.bat').read_bytes())
            z.writestr('_PR69_PATCH/pr69_apply_code.py',
                (ROOT/'tools/ames-workstation/pr69_apply_code.py').read_bytes())
            z.writestr('_PR69_PATCH/PATCH_PR69_MANIFEST.json',json.dumps(meta,indent=2).encode())
            for item in changed:
                z.writestr('_PR69_PATCH/files/'+item['path'],new.read(item['path']))
    print(json.dumps({'path':str(destination),'base':before['sha'],
                      'target':after['sha'],'patched_program_files':len(changed),
                      'sha256':digest(destination.read_bytes())}))
    return meta


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('previous');parser.add_argument('current');parser.add_argument('destination')
    args=parser.parse_args()
    build(args.previous,args.current,args.destination)
