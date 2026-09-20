#!/usr/bin/env python3
"""Reproducible OpenArena 0.8.8 subset. No commercial Quake data."""
from pathlib import Path
import sys, zipfile, io, hashlib, json, re, struct
root = Path(__file__).resolve().parents[1]
archive = Path(sys.argv[1]) if len(sys.argv)>1 else root/'.build/openarena-0.8.8.zip'
engine_build = Path(sys.argv[2]) if len(sys.argv)>2 else root/'.build/native/Release'
raw = archive.read_bytes()
assert hashlib.md5(raw).hexdigest() == '9f353d96d7889c377349d692c3905e5b', 'OpenArena archive checksum mismatch'
assert hashlib.sha256(raw).hexdigest() == '5a8faf7f5b51f351b0a1618c06b6b98a5f1a6758f1d39818de2c87df2a0bac4a', 'OpenArena SHA-256 mismatch'
z=zipfile.ZipFile(io.BytesIO(raw)); entries={}
maps={'oa_dm1','oa_rpg3dm2'}; players={'sarge','smarine','beret','grism'}
for name in sorted(z.namelist()):
    if '/baseoa/' not in name or not name.endswith('.pk3') or 'mature' in name: continue
    pak=zipfile.ZipFile(io.BytesIO(z.read(name)))
    for n in pak.namelist():
        if n.endswith('/') or n.startswith(('video/','vm/','demos/')): continue
        if n.startswith('maps/') and Path(n).stem not in maps: continue
        if n.startswith('levelshots/') and Path(n).stem not in maps: continue
        if n.startswith('models/players/') and n.split('/')[2] not in players: continue
        if n.startswith('sound/player/') and len(n.split('/'))>3 and n.split('/')[2] not in players|{'footsteps'}: continue
        entries[n]=pak.read(n)

# Retain textures reachable from the two BSPs and included models. Shader names
# resolve recursively to their image maps, light stages and skybox faces.
shaders={}
for n,b in entries.items():
    if not n.endswith('.shader'): continue
    text=re.sub(r'/\*.*?\*/|//[^\n]*','',b.decode(errors='replace'),flags=re.S)
    tokens=re.findall(r'[^\s{}]+|[{}]',text);i=0
    while i+1<len(tokens):
        name=tokens[i];i+=1
        if tokens[i]!='{':continue
        depth=1;i+=1;body=[]
        while i<len(tokens) and depth:
            t=tokens[i];i+=1
            if t=='{':depth+=1
            if t=='}':depth-=1
            body.append(t)
        shaders.setdefault(name.lower(), []).extend(body)
# The legacy map names an absent track; use a bundled OpenArena track.
entries['music/sonic6.ogg']=entries['music/OA01.ogg']
needed=set();music={'music/OA01.ogg'}
for m in maps:
    b=entries[f'maps/{m}.bsp'];off,length=struct.unpack_from('<ii',b,16)
    for at in range(off,off+length,72):needed.add(b[at:at+64].split(b'\0')[0].decode().lower())
    eo,el=struct.unpack_from('<ii',b,8);entities=b[eo:eo+el].decode(errors='replace')
    for item in re.findall(r'"music"\s*"([^" ]+)',entities):music.add(item)
for n,b in entries.items():
    if n.endswith(('.skin','.md3','.mdr')):
        needed.update(x.decode().lower().rstrip('"') for x in re.findall(rb'[A-Za-z0-9_]+(?:/[A-Za-z0-9_.-]+)+',b))
for n,b in entries.items():
    if n.endswith(('.md3','.mdr','.skin')):
        needed.update(t.decode().lower() for t in re.findall(rb'[A-Za-z0-9_./-]+',b) if t.decode().lower() in shaders)
# Cgame registers several effect shaders by name (including numbered frames).
source=Path(sys.argv[3]) if len(sys.argv)>3 else root/'.build/ioquake3'
for c in (source/'code/cgame').glob('*.c'):
    for literal in re.findall(r'"([^"\n]+)"',c.read_text(errors='replace')):
        prefix=literal.split('%')[0].lower()
        if prefix in shaders:needed.add(prefix)
        if '%' in literal and prefix:needed.update(k for k in shaders if k.startswith(prefix))
queue=list(needed);seen=set()
while queue:
    name=queue.pop()
    if name in seen:continue
    seen.add(name)
    for token in shaders.get(name,[]):
        if '/' in token and not token.startswith('$'):
            token=token.lower().strip('"');needed.add(token);queue.append(token)
# Quake resolves a requested .tga to .jpg/.png too. Preserve these alternatives.
needed.update(str(Path(x).with_suffix('')) for x in list(needed) if Path(x).suffix.lower() in {'.tga','.jpg','.jpeg','.png'})
# Keep sky textures (many use indexed suffixes in skyparms), plus non-map UI media.
for n in list(entries):
    if n.startswith('textures/') and not n.startswith('textures/sfx/') and n.lower() not in needed and str(Path(n).with_suffix('')).lower() not in needed:
        if not any(n.lower().startswith(x+'_') for x in needed if x.startswith('textures/')):del entries[n]
    if n.startswith('music/') and n not in music:del entries[n]

# Curated bot identities only reference the included models.
entries['scripts/bots.txt']=b'{ name Sarge model sarge aifile bots/sarge_c.c }\n{ name Grunt model smarine aifile bots/grunt_c.c }\n{ name Beret model beret aifile bots/beret_c.c }\n'
entries['scripts/arenas.txt']=b'{ map oa_dm1 longname "The Atrium" type "ffa tourney" }\n{ map oa_rpg3dm2 longname "Reactor" type "ffa tourney" }\n'
entries['default.cfg']+=b'\nseta model sarge\nseta headmodel sarge\nseta cg_forceModel 1\nseta com_introplayed 1\nseta ui_cdkeychecked 1\n'
for n in ['COPYING','CREDITS','README','readme_088.txt']:
    entries['licenses/openarena/'+n]=z.read('openarena-0.8.8/'+n)
for name in ['cgame','qagame','ui']:
    entries['vm/'+name+'.qvm']=(engine_build/'baseq3/vm'/f'{name}.qvm').read_bytes()
# Player skins can reference shared textures outside their model folder.
# Fail the build instead of shipping invisible or checkerboard opponents.
asset_names={str(Path(n).with_suffix('')).lower() for n in entries}
for name,data in entries.items():
    if not name.startswith('models/players/') or not name.endswith('.skin'): continue
    for line in data.decode(errors='replace').splitlines():
        parts=line.split(',',1)
        if len(parts)!=2 or parts[0].strip().startswith('tag_'): continue
        ref=parts[1].strip().lower()
        if not ref: continue
        assert str(Path(ref).with_suffix('')) in asset_names or ref in shaders, f'Missing player skin dependency: {name} -> {ref}'

out=root/'public/assets';out.mkdir(parents=True,exist_ok=True)
for m,label in [('oa_dm1','atrium'),('oa_rpg3dm2','reactor')]:
    (out/f'{label}.jpg').write_bytes(entries[f'levelshots/{m}.jpg'])
target=out/'arena.pk3'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as pack:
    for n, b in sorted(entries.items()):
        info=zipfile.ZipInfo(n,(2026,9,19,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
        pack.writestr(info,b)
manifest={'version':1,'engine':'83a776283bdb958f82db25554b5ed0966aaf6e49','content':'OpenArena 0.8.8 (curated subset)','files':[{'url':'/assets/arena.pk3','path':'/baseq3/arena.pk3','bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}],'maps':[{'id':'oa_dm1','name':'The Atrium'},{'id':'oa_rpg3dm2','name':'Reactor'}]}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(root/'docs').mkdir(exist_ok=True)
(root/'docs/asset-inventory.json').write_text(json.dumps({'archive_sha256':hashlib.sha256(raw).hexdigest(),'files':sorted(entries)},indent=2))
print(f'{len(entries)} files, {target.stat().st_size/1024**2:.1f} MiB → {target}')
