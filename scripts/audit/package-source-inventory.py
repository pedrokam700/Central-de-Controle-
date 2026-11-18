"""Read Git trees and AST literals only. NEVER import or execute a builder."""
import ast, hashlib, json, re, subprocess
from pathlib import Path, PurePosixPath
ROOT=Path(__file__).resolve().parents[2]
OLD='eedacc65445dea9967a92085777b878c1ee9c123'
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def sources(ref):
 paths=git('ls-tree','-r','--name-only',ref).decode().splitlines()
 source=git('show',ref+':scripts/build-integrated-candidate.py').decode()
 constants={}
 for n in ast.parse(source).body:
  if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
   try:constants[n.targets[0].id]=ast.literal_eval(n.value)
   except (ValueError,TypeError):pass
 mapping={};derived=set()
 def add(target,source,transform=False):
  assert target not in mapping,target
  assert source is None or source in paths,source
  mapping[target]=source
  if transform or source is None:derived.add(target)
 for p in paths:
  name=PurePosixPath(p)
  if name.parent.as_posix()=='ames/agent' and (name.suffix=='.py' or name.name in ('requirements.txt','config.example.json')):add('ames-agent/'+name.name,p)
  if p.startswith('ames/factory-engine/') and '__pycache__' not in name.parts and (name.suffix=='.py' or name.parent.name=='config' and name.suffix=='.json' or name.name=='requirements.txt'):add('factory-engine/'+p[len('ames/factory-engine/'):],p)
 for c,dest in [('SUPPORT_FILES','suporte/ames-workstation/'),('AT_SETUP_FILES','at-setup/'),('VERIFIER_FILES',''),('FIRST_RUN_FILES',''),('PACKAGE_DOCS','')]:
  for name in constants[c]:
   src='tools/ames-workstation/'+('at-setup/' if c=='AT_SETUP_FILES' else 'package-docs/' if c=='PACKAGE_DOCS' else '')+name
   add(dest+name,src,name=='TROCAR_PARA_PR69_NOVA.ps1' or c=='PACKAGE_DOCS')
 for name in ('01_INSTALAR_UMA_VEZ.bat','05_ABRIR_CHROME_AMES.bat','START_LOCAL_CANDIDATE.ps1'):add(name,'tools/ames-workstation/'+name)
 add('09_REPARAR_DEPENDENCIAS.bat','tools/ames-workstation/09_REPARAR_DEPENDENCIAS_CLEAN.bat')
 add('network/ensure_ames_route.ps1','tools/ames-workstation/ensure_ames_route.ps1')
 for name in ('00_INICIAR_AQUI.bat','INICIAR_POSTO_CENTRAL_V2.bat','INICIAR_CENTRAL_AMES.cmd'):add(name,None)
 front={'index.html','app.js','offline-bootstrap.mjs','styles.css','mobile.css','sw.js','manifest.webmanifest'}
 for p in paths:
  parts=PurePosixPath(p).parts
  if parts[0] in ('ames','core','icons') and not {'agent','factory-engine'}&set(parts[1:-1]) and re.search(r'\.(mjs|css|svg|png|json|html)$',p):front.add(p)
 for p in sorted(front):add('frontend/Central-de-Controle-/'+p,p,p in ('index.html','app.js','sw.js'))
 for p in ('frontend/index.html','frontend/release-build.json','LOCAL_BUNDLE_MANIFEST.json','CANDIDATE_MANIFEST.json','LEIA_PRIMEIRO.txt'):add(p,None)
 for p in paths:
  name=PurePosixPath(p)
  if name.parent.as_posix()=='docs/ames' and name.name.startswith('integrated-v5'):add('evidence/'+name.name,p)
 for p in ('docs/ames/falhas-do-dia-analytics.md','docs/ames/handoffs/ISSUE66_CANDIDATA_CONSOLIDADA_20261023.md','docs/ames/handoffs/PR69_RECOVERY_20261030.md','docs/ames/handoffs/PR69_3012_REUSO_20261106.md','docs/ames/handoffs/PR69_AUDITORIA_3012_REUSO_20261105.md'):add('evidence/'+PurePosixPath(p).name,p)
 return mapping,derived
new=git('rev-parse','HEAD').decode().strip();old,od=sources(OLD);current,cd=sources(new)
hashes=lambda ref,m:{k:hashlib.sha256(git('show',ref+':'+v)).hexdigest() for k,v in m.items() if v is not None}
a=hashes(OLD,old);b=hashes(new,current)
def group(n):return n.split('/')[0] if '/' in n else 'ROOT'
groups={}
for key in sorted(set(map(group,old))|set(map(group,current))):
 groups[key]={'old':sum(group(p)==key for p in old),'current':sum(group(p)==key for p in current),'added':sorted(p for p in current.keys()-old.keys() if group(p)==key),'removed':sorted(p for p in old.keys()-current.keys() if group(p)==key),'changed_source':sorted(p for p in old.keys()&current.keys() if group(p)==key and a.get(p)!=b.get(p))}
up=ast.parse(git('show',new+':ames/agent/update_candidate.py').decode());u={}
for n in up.body:
 if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('FILES','ROOT_FILES'):u[n.targets[0].id]=ast.literal_eval(n.value)
result={'scope':'STATIC_SOURCE_SELECTION_MODEL_NOT_BUILD_OR_ZIP_PARITY','old':OLD,'current':new,'old_count':len(old),'current_count':len(current),'groups':groups,'derived_members':sorted(cd),'legacy_updater_required_missing_from_clean_model':sorted(set(u['ROOT_FILES'])-current.keys()),'candidate_files_json_in_clean_model':'ames-agent/candidate-files.json' in current,'mapping':{p:{'source':s,'source_sha256':b.get(p),'output_transformed_or_generated':p in cd} for p,s in sorted(current.items())}}
print(json.dumps(result,ensure_ascii=False,indent=2))
