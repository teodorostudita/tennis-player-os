#!/usr/bin/env python3
import argparse
import ftplib
import io
import json
import os
from pathlib import Path, PurePosixPath

MANIFEST_NAME = ".tpos-deploy-manifest.json"
PROTECTED = {"mail-config.php", MANIFEST_NAME}
IGNORE_NAMES = {".DS_Store"}
IGNORE_PARTS = {"__MACOSX", ".git", "node_modules"}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=21)
    parser.add_argument("--user", required=True)
    parser.add_argument("--remote-dir", required=True)
    parser.add_argument("--local-dir", required=True)
    parser.add_argument("--changed-list")
    parser.add_argument("--test", action="store_true")
    return parser.parse_args()


def is_ignored(rel):
    return (
        rel.name in IGNORE_NAMES
        or any(part in IGNORE_PARTS for part in rel.parts)
        or rel.as_posix() in PROTECTED
        or rel.suffix.lower() == ".zip"
    )


def collect_local(root):
    return {
        path.relative_to(root).as_posix(): path
        for path in root.rglob("*")
        if path.is_file() and not is_ignored(path.relative_to(root))
    }


def read_changed_list(path):
    if not path:
        return None
    source = Path(path)
    if not source.is_file():
        raise SystemExit(f"Lista file modificati non trovata: {source}")
    changed = set()
    for raw in source.read_text(encoding="utf-8").splitlines():
        rel = raw.strip().replace("\\", "/").lstrip("./")
        if not rel:
            continue
        pure = PurePosixPath(rel)
        if is_ignored(Path(*pure.parts)):
            continue
        changed.add(pure.as_posix())
    return changed


def cwd_or_make(ftp, path):
    parts = [part for part in PurePosixPath(path).parts if part not in ("/", "")]
    ftp.cwd("/")
    for part in parts:
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            ftp.mkd(part)
            ftp.cwd(part)


def read_manifest(ftp, remote_dir):
    cwd_or_make(ftp, remote_dir)
    buffer = io.BytesIO()
    try:
        ftp.retrbinary(f"RETR {MANIFEST_NAME}", buffer.write)
    except ftplib.error_perm:
        return set()
    try:
        payload = json.loads(buffer.getvalue().decode("utf-8"))
        return set(str(item) for item in payload.get("files", []))
    except Exception:
        return set()


def delete_managed_file(ftp, remote_dir, rel):
    if rel in PROTECTED:
        return
    target = str(PurePosixPath(remote_dir) / PurePosixPath(rel))
    try:
        ftp.delete(target)
        print(f"  - rimosso: {rel}")
    except ftplib.error_perm:
        pass


def remove_empty_dirs(ftp, remote_dir, removed):
    dirs = sorted(
        {str(PurePosixPath(rel).parent) for rel in removed if "/" in rel},
        key=lambda value: value.count("/"),
        reverse=True,
    )
    for rel_dir in dirs:
        if rel_dir in (".", ""):
            continue
        try:
            ftp.rmd(str(PurePosixPath(remote_dir) / PurePosixPath(rel_dir)))
        except ftplib.error_perm:
            pass


def upload_file(ftp, remote_dir, rel, local_path):
    remote_path = PurePosixPath(remote_dir) / PurePosixPath(rel)
    cwd_or_make(ftp, str(remote_path.parent))
    with local_path.open("rb") as handle:
        ftp.storbinary(f"STOR {remote_path.name}", handle)
    print(f"  + {rel}")


def write_manifest(ftp, remote_dir, files):
    payload = json.dumps(
        {"version": 1, "files": sorted(files)},
        indent=2,
        ensure_ascii=False,
    ).encode("utf-8")
    cwd_or_make(ftp, remote_dir)
    ftp.storbinary(f"STOR {MANIFEST_NAME}", io.BytesIO(payload))


def main():
    args = parse_args()
    password = os.environ.get("TPOS_FTP_PASSWORD", "")
    if not password:
        raise SystemExit("Password FTP non disponibile.")

    local_dir = Path(args.local_dir).resolve()
    if not local_dir.is_dir():
        raise SystemExit(f"Cartella sito non trovata: {local_dir}")

    changed = read_changed_list(args.changed_list)

    ftp = ftplib.FTP()
    ftp.connect(args.host, args.port, timeout=25)
    ftp.login(args.user, password)
    ftp.set_pasv(True)

    try:
        cwd_or_make(ftp, args.remote_dir)
        if args.test:
            print("Connessione FTP riuscita.")
            print("Modalità passiva attiva.")
            return

        local_files = collect_local(local_dir)
        previous_files = read_manifest(ftp, args.remote_dir)

        if changed is None:
            upload_names = set(local_files)
            removed = previous_files - set(local_files)
            print(f"Sincronizzazione completa: {len(upload_names)} file locali.")
        else:
            upload_names = {rel for rel in changed if rel in local_files}
            removed = {rel for rel in changed if rel not in local_files and rel in previous_files}
            print(
                f"Deploy incrementale: {len(upload_names)} file da caricare, "
                f"{len(removed)} da rimuovere."
            )

        for rel in sorted(upload_names):
            upload_file(ftp, args.remote_dir, rel, local_files[rel])

        for rel in sorted(removed):
            delete_managed_file(ftp, args.remote_dir, rel)

        remove_empty_dirs(ftp, args.remote_dir, removed)
        write_manifest(ftp, args.remote_dir, local_files.keys())

        if changed is not None and not upload_names and not removed:
            print("Nessun file marketing trasferibile è cambiato.")

        print("Sito Aruba sincronizzato.")
        print("mail-config.php non è stato toccato.")
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == "__main__":
    main()
