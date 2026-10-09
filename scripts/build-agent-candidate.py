"""Derive a separate candidate ZIP. Never edit an installed agent or its data."""
import argparse
import hashlib
from pathlib import Path
import zipfile

SOURCE_SHA = '1c0e7a37af4fb4b0b08b377d7c17c6895be5891e27c2ba9d37a9cc8cb6708167'
COLLECTORS = {'ames_3028.py':'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1',
              'ames_3028_live.py':'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}
def build(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination.exists() or source == destination:
        raise ValueError('Destination must be a new file; no overwrite is allowed')
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError('Original V0.5.23 ZIP hash mismatch')
    root = Path(__file__).resolve().parents[1]
    replacements = {name:(root/'ames'/'agent'/name).read_bytes() for name in ['agent.py','engine_bridge.py','mes_scheduler.py']}
    with zipfile.ZipFile(source) as old:
        prefix = next(n[:-len('agent.py')] for n in old.namelist() if n.endswith('/ames-agent/agent.py'))
        for name,digest in COLLECTORS.items():
            assert hashlib.sha256(old.read(prefix+name)).hexdigest() == digest
            assert hashlib.sha256((root/'ames'/'agent'/name).read_bytes()).hexdigest() == digest
        # Source ZipInfo preserves original timestamps/metadata. Added files are deterministic.
        with zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_DEFLATED) as new:
            for info in old.infolist():
                name=info.filename.removeprefix(prefix) if info.filename.startswith(prefix) else ''
                new.writestr(info,replacements[name] if name in replacements else old.read(info.filename))
            new.writestr(zipfile.ZipInfo(prefix+'mes_scheduler.py',(2026,10,9,0,0,0)),replacements['mes_scheduler.py'])
            new.writestr(zipfile.ZipInfo(prefix+'PATCH_FIFO.md',(2026,10,9,0,0,0)),(root/'ames'/'agent'/'README.md').read_bytes())
    with zipfile.ZipFile(source) as old,zipfile.ZipFile(destination) as new:
        for name in old.namelist():
            if name not in [prefix+'agent.py',prefix+'engine_bridge.py']:
                assert old.read(name)==new.read(name), name
        assert new.testzip() is None
    print('Candidate:',destination)
    print('SHA-256:',hashlib.sha256(destination.read_bytes()).hexdigest())
    print('Original entries unchanged except agent.py/engine_bridge.py; scheduler and instructions added.')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('destination');args=parser.parse_args()
    build(args.source,args.destination)
