from __future__ import annotations

# 現在の Supabase 全テーブルをローカル JSON へ退避する（読み取りのみ・破壊操作なし）。
# 移行（全削除→新規インポート）の前の安全用バックアップ。

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / ".env"
BACKUP_DIR = ROOT_DIR / "backups"

# 退避対象（参照系も含め、現状を丸ごと保存）
TABLES = [
    "invent_suppliers",
    "invent_staff",
    "invent_categories",
    "invent_parent_assets",
    "invent_child_assets",
    "invent_stock_movements",
    "invent_fiscal_snapshots",
]

PAGE_SIZE = 1000


def load_env(path: Path) -> dict[str, str]:
    if not path.exists():
        raise SystemExit(f".env file not found: {path}")
    env = dict(os.environ)
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def fetch_all(url: str, key: str, table: str) -> list[dict]:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows: list[dict] = []
    offset = 0
    while True:
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}?select=*&order=id.asc&limit={PAGE_SIZE}&offset={offset}",
            headers=headers,
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                page = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            text = err.read().decode("utf-8", errors="replace")
            raise SystemExit(f"{table} backup failed ({err.code}): {text}")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def main() -> None:
    env = load_env(ENV_PATH)
    url = env.get("SUPABASE_URL", "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key.startswith("sb_secret_"):
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env に正しく設定されていません。")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    out_path = BACKUP_DIR / f"supabase_full_backup_{stamp}.json"

    payload = {
        "exported_at": dt.datetime.now().isoformat(),
        "supabase_url": url,
        "tables": {},
    }
    counts = {}
    for table in TABLES:
        data = fetch_all(url, key, table)
        payload["tables"][table] = data
        counts[table] = len(data)

    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    sys.stdout.buffer.write((f"Backup saved: {out_path}\n").encode("utf-8"))
    sys.stdout.buffer.write((json.dumps(counts, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
