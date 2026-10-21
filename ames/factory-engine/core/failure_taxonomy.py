"""Shared, versioned deterministic matcher. Configuration is also compiled for the UI."""
import json,re,unicodedata
from pathlib import Path
CONFIG=Path(__file__).resolve().parents[1]/'config'
def configuration():
    return {**json.loads((CONFIG/'failure_taxonomy.json').read_text()),'families':json.loads((CONFIG/'familias_falhas.json').read_text())}
def normalize(value):
    text=''.join(c for c in unicodedata.normalize('NFKD',str(value or '')) if not unicodedata.combining(c)).lower()
    return ' '.join(re.sub('[^a-z0-9]+',' ',text).split())
def contains(text,phrase):return bool(phrase) and (' '+phrase+' ') in (' '+text+' ')
def describe(code,desc,rules=None):
    rules=rules or configuration();text=normalize(desc)
    for old,new in sorted(rules['aliases'].items(),key=lambda x:-len(x[0])):
        text=re.sub(r'(?<!\w)'+re.escape(normalize(old))+r'(?!\w)',normalize(new),text)
    family=next((f for f,words in rules['families'].items() if any(contains(text,normalize(w)) for w in words)),'OUTRO')
    subtypes=[s for s,words in rules['subtypes'].get(family,{}).items() if any(contains(text,normalize(w)) for w in words)]
    normalized_code=str(code or '').strip().upper();normalized_code=rules['code_aliases'].get(normalized_code,normalized_code)
    if normalized_code in rules['unknown_codes']:normalized_code=''
    return {'code':normalized_code,'text':text,'family':family,'subtype':subtypes[0] if len(subtypes)==1 else None,'ambiguous':len(subtypes)>1,'negative':any(contains(text,normalize(p)) for p in rules['negative_phrases'])}
def compare(cc,cd,oc,od,context=None):
    rules=configuration();a=describe(cc,cd,rules);b=describe(oc,od,rules)
    for key,item in [('currentFamily',a),('oldFamily',b)]:
        if context and key in context:item['family']=context[key] if context[key] in rules['families'] else 'OUTRO'
    relation,reason='UNKNOWN','INSUFFICIENT_EVIDENCE'
    if a['negative'] or b['negative']:reason='NEGATED_FAILURE'
    elif a['ambiguous'] or b['ambiguous']:reason='AMBIGUOUS_SUBTYPE'
    elif a['family']==b['family'] and a['subtype'] and b['subtype'] and a['subtype']!=b['subtype'] and a['family'] not in rules['cross_subtype_similar']:
        relation,reason=('UNKNOWN','CODE_SUBTYPE_CONFLICT') if a['code'] and a['code']==b['code'] else ('OTHER','DISTINCT_SUBTYPES')
    elif a['code'] and a['code']==b['code']:relation,reason='EXACT','CODE_EQUAL_OR_FORMAL_ALIAS'
    elif a['family']!='OUTRO' and a['family']==b['family']:
        if a['family'] in rules['subtypes'] and (not a['subtype'] or not b['subtype']):reason='SUBTYPE_UNPROVEN'
        else:relation,reason='SIMILAR','SAME_OPERATIONAL_SUBSYSTEM'
    elif a['family']!='OUTRO' and b['family']!='OUTRO':relation,reason='OTHER','DISTINCT_SUBSYSTEMS'
    return {'classification':relation,'reason_code':reason,'version':rules['version'],'current_family':a['family'],'old_family':b['family'],'current_subtype':a['subtype'],'old_subtype':b['subtype'],'current_code':cc,'current_desc':cd,'old_code':oc,'old_desc':od}
