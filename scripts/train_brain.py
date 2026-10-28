"""Reproducible public-data brain build. Never synthesizes missing training data."""
from pathlib import Path
import json, time, hashlib
import numpy as np
import requests
from rdkit import Chem, rdBase
from rdkit.Chem import rdFingerprintGenerator
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
from tdc.single_pred import Tox

OUT=Path('public/brain'); OUT.mkdir(parents=True,exist_ok=True)
DATA=Path('data/downloads'); DATA.mkdir(parents=True,exist_ok=True)
gen=rdFingerprintGenerator.GetMorganGenerator(radius=2,fpSize=2048,includeChirality=False)
def fingerprint(s):
    m=Chem.MolFromSmiles(s)
    return (Chem.MolToSmiles(m),gen.GetFingerprintAsNumPy(m).astype(np.uint8)) if m else None
def save(name,data):
    dest=OUT/name; tmp=dest.with_suffix('.tmp');tmp.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8');tmp.replace(dest)

models={}; holdout=[]; toxic=[]
# PyTDC 1.1.15 provides the ClinTox toxicity endpoint as Y; CT_TOX is not a column in this release.
tasks={'herg':dict(name='hERG'),'ames':dict(name='AMES'),'dili':dict(name='DILI'),'clintox':dict(name='ClinTox')}
for key,kwargs in tasks.items():
    print('Loading',key,flush=True)
    df=Tox(path=str(DATA),**kwargs).get_data()
    unique={}; conflicts=set()
    for s,y in zip(df['Drug'],df['Y']):
        f=fingerprint(s)
        if f is None or y not in (0,1):continue
        canonical,fp=f
        if canonical in unique and unique[canonical][1]!=int(y):conflicts.add(canonical)
        unique[canonical]=(fp,int(y))
    for c in conflicts:unique.pop(c,None)
    smiles=list(unique);X=np.array([unique[s][0] for s in smiles]);y=np.array([unique[s][1] for s in smiles])
    tr,te=train_test_split(np.arange(len(y)),test_size=.2,stratify=y,random_state=7)
    clf=LogisticRegression(C=.3,max_iter=2000,class_weight='balanced').fit(X[tr],y[tr])
    auc=float(roc_auc_score(y[te],clf.predict_proba(X[te])[:,1]))
    models[key]={'auc':round(auc,4),'n':len(y),'trainN':len(tr),'testN':len(te),'intercept':float(clf.intercept_[0]),'coef':[round(float(c),8) for c in clf.coef_[0]],'train_fps':[''.join(map(str,r)) for r in X[tr]],'source':'TDC '+kwargs['name'],'split':'canonical-deduplicated stratified random 80/20, seed 7','excludedConflicts':len(conflicts),'rdkitVersion':rdBase.rdkitVersion}
    if key=='clintox':
        holdout=[{'smiles':smiles[i],'label':int(y[i])} for i in te]
        # Evaluation holdout compounds must not leak into the precedent library.
        toxic=[{'name':None,'label':'tox_failed','smi':smiles[i],'fp':''.join(map(str,X[i])),'source':'ClinTox CT_TOX'} for i in tr if y[i]==1]
    print(key,'AUC',round(auc,4),'n',len(y),flush=True)
save('tox_models.json',models)
save('holdout.json',holdout)
aspirin='CC(=O)Oc1ccccc1C(=O)O'; f=fingerprint(aspirin)
save('parity.json',{'smiles':aspirin,'fp':''.join(map(str,f[1])),'radius':2,'nBits':2048,'useChirality':False,'rdkitVersion':rdBase.rdkitVersion})

session=requests.Session();precedents={};excluded={r['smiles'] for r in holdout}
for label,params in [('withdrawn',{'withdrawn_flag':'true','limit':1000}),('approved',{'max_phase':4,'molecule_type':'Small molecule','limit':1000})]:
    url='https://www.ebi.ac.uk/chembl/api/data/molecule.json';count=0
    while url and count<2500:
        response=session.get(url,params=params if '?' not in url else None,timeout=90);response.raise_for_status();packet=response.json()
        for m in packet['molecules']:
            s=(m.get('molecule_structures') or {}).get('canonical_smiles');f=fingerprint(s) if s else None
            if f is None or f[0] in excluded:continue
            canonical,fp=f
            if canonical in precedents:continue
            precedents[canonical]={'name':m.get('pref_name') or m['molecule_chembl_id'],'label':label,'smi':canonical,'fp':''.join(map(str,fp)),'source':'ChEMBL','chemblId':m['molecule_chembl_id']}
        count+=len(packet['molecules']);nxt=packet['page_meta']['next'];url=('https://www.ebi.ac.uk'+nxt) if nxt and nxt.startswith('/') else nxt
        print(label,len(precedents),'precedents',flush=True);time.sleep(.3)
for r in toxic:precedents.setdefault(r['smi'],r)
save('precedents.json',list(precedents.values()))
save('manifest.json',{'version':1,'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'models':{k:{a:v[a] for a in ['auc','n','trainN','testN','source','split']} for k,v in models.items()},'precedents':len(precedents),'holdout':len(holdout),'fingerprint':{'radius':2,'nBits':2048,'useChirality':False},'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.glob('*.json') if p.name!='manifest.json'}})
print('Brain build complete.',flush=True)
