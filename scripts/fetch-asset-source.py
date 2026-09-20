from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import unquote
import subprocess,re,json,sys
base='https://openarena.ws/svn/!svn/bc/951/source/assets/'
out=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'.build/openarena-source'
out.mkdir(parents=True,exist_ok=True)
def get(p):return subprocess.check_output(['curl','-fsSL','--max-time','120','--retry','1',base+p])
def listing(p):
 text=get(p).decode();return [p+x for x in re.findall(r'href="([^"]+)"',text) if not x.startswith(('../','http','/','#'))]
folders=[''];files=[]
with ThreadPoolExecutor(max_workers=4) as pool:
 while folders:
  nexts=[]
  for links in pool.map(listing,folders):
   for p in links:
    if p.endswith('/'):nexts.append(p)
    else:files.append(p)
  folders=nexts
  print('catalog',len(files),'files;',len(folders),'directories',flush=True)
 # Preserve the complete upstream preferred-source tree so no layered source is missed.
 def fetch(p):
  target=out/unquote(p);target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists():target.write_bytes(get(p))
  return target.stat().st_size
 total=0
 for i,amount in enumerate(pool.map(fetch,files)):
  total+=amount
  if i%50==0:print('downloaded',i+1,'/',len(files),round(total/1048576),'MiB',flush=True)
 (out/'provenance.json').write_text(json.dumps({'upstream':base,'revision':951,'files':files},indent=2))
 print('done',len(files),round(total/1048576),'MiB',flush=True)
