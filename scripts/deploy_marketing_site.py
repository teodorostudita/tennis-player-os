#!/usr/bin/env python3
import argparse, ftplib, io, json, os
from pathlib import Path, PurePosixPath
MANIFEST_NAME = ".tpos-deploy-manifest.json"
PROTECTED = {"mail-config.php", MANIFEST_NAME}
IGNORE_NAMES = {".DS_Store"}
IGNORE_PARTS = {"__MACOSX", ".git", "node_modules"}
def parse_args():
    p=argparse.ArgumentParser(); p.add_argument("--host",required=True); p.add_argument("--port",type=int,default=21); p.add_argument("--user",required=True); p.add_argument("--remote-dir",required=True); p.add_argument("--local-dir",required=True); p.add_argument("--test",action="store_true"); return p.parse_args()
def is_ignored(rel):
    return rel.name in IGNORE_NAMES or any(part in IGNORE_PARTS for part in rel.parts) or rel.as_posix() in PROTECTED or rel.suffix.lower()==".zip"
def collect_local(root):
    return {p.relative_to(root).as_posix():p for p in root.rglob("*") if p.is_file() and not is_ignored(p.relative_to(root))}
def cwd_or_make(ftp,path):
    parts=[p for p in PurePosixPath(path).parts if p not in ("/","")]; ftp.cwd("/")
    for part in parts:
        try: ftp.cwd(part)
        except ftplib.error_perm: ftp.mkd(part); ftp.cwd(part)
def read_manifest(ftp,remote_dir):
    cwd_or_make(ftp,remote_dir); buf=io.BytesIO()
    try: ftp.retrbinary(f"RETR {MANIFEST_NAME}",buf.write)
    except ftplib.error_perm: return set()
    try: return set(str(x) for x in json.loads(buf.getvalue().decode("utf-8")).get("files",[]))
    except Exception: return set()
def delete_managed_file(ftp,remote_dir,rel):
    if rel in PROTECTED: return
    target=str(PurePosixPath(remote_dir)/PurePosixPath(rel))
    try: ftp.delete(target); print(f"  - rimosso: {rel}")
    except ftplib.error_perm: pass
def remove_empty_dirs(ftp,remote_dir,removed):
    dirs=sorted({str(PurePosixPath(rel).parent) for rel in removed if "/" in rel},key=lambda x:x.count("/"),reverse=True)
    for rel_dir in dirs:
        if rel_dir in (".",""): continue
        try: ftp.rmd(str(PurePosixPath(remote_dir)/PurePosixPath(rel_dir)))
        except ftplib.error_perm: pass
def upload_file(ftp,remote_dir,rel,local_path):
    remote_path=PurePosixPath(remote_dir)/PurePosixPath(rel); cwd_or_make(ftp,str(remote_path.parent))
    with local_path.open("rb") as f: ftp.storbinary(f"STOR {remote_path.name}",f)
    print(f"  + {rel}")
def write_manifest(ftp,remote_dir,files):
    payload=json.dumps({"version":1,"files":sorted(files)},indent=2,ensure_ascii=False).encode("utf-8"); cwd_or_make(ftp,remote_dir); ftp.storbinary(f"STOR {MANIFEST_NAME}",io.BytesIO(payload))
def main():
    args=parse_args(); password=os.environ.get("TPOS_FTP_PASSWORD","")
    if not password: raise SystemExit("Password FTP non disponibile.")
    local_dir=Path(args.local_dir).resolve()
    if not local_dir.is_dir(): raise SystemExit(f"Cartella sito non trovata: {local_dir}")
    ftp=ftplib.FTP(); ftp.connect(args.host,args.port,timeout=25); ftp.login(args.user,password); ftp.set_pasv(True)
    try:
        cwd_or_make(ftp,args.remote_dir)
        if args.test:
            print("Connessione FTP riuscita."); print("Modalità passiva attiva."); return
        local_files=collect_local(local_dir); previous_files=read_manifest(ftp,args.remote_dir)
        print(f"Pubblico {len(local_files)} file su Aruba...")
        for rel,path in sorted(local_files.items()): upload_file(ftp,args.remote_dir,rel,path)
        removed=sorted(previous_files-set(local_files))
        for rel in removed: delete_managed_file(ftp,args.remote_dir,rel)
        remove_empty_dirs(ftp,args.remote_dir,removed); write_manifest(ftp,args.remote_dir,local_files.keys())
        print("Sito Aruba sincronizzato."); print("mail-config.php non è stato toccato.")
    finally:
        try: ftp.quit()
        except Exception: ftp.close()
if __name__=="__main__": main()
