from __future__ import annotations

# Supabase の移行対象テーブルを「全削除 → CSV から新規投入」で完全置換する。
# invent_categories は移行対象外なので一切触らない。
# 破壊的操作のため、実行には --yes フラグを必須にしている。
#
# 実行前に scripts/backup_supabase.py で必ずバックアップを取得すること。
# 実行後、シーケンスは setval が必要（REST では流せないため SQL Editor で
# outputs/supabase_migration/reset_supabase_sequences.sql を実行する）。

import argparse
import json
import sys
import urllib.error
import urllib.request

from import_csv_to_supabase import (  # 既存のテスト済みヘルパを再利用
    CSV_DIR,
    CSV_FILES,
    ENV_PATH,
    get_count,
    load_env,
    read_csv,
    require_env,
    upsert_rows,
)

# 投入順（親→子）。削除は FK の都合でこの逆順 + fiscal_snapshots。
IMPORT_ORDER = [
    "invent_suppliers",
    "invent_staff",
    "invent_parent_assets",
    "invent_child_assets",
    "invent_stock_movements",
]

# 削除順（子→親）。fiscal_snapshots は child_assets を参照するので先に消す。
DELETE_ORDER = [
    "invent_stock_movements",
    "invent_fiscal_snapshots",
    "invent_child_assets",
    "invent_parent_assets",
    "invent_suppliers",
    "invent_staff",
]


def delete_all(url: str, key: str, table: str) -> None:
    # PostgREST は無条件 DELETE を禁止するため、全件マッチのフィルタ id=not.is.null を付ける。
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    req = urllib.request.Request(
        f"{url}/rest/v1/{table}?id=not.is.null",
        headers=headers,
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            resp.read()
    except urllib.error.HTTPError as err:
        text = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"DELETE {table} failed ({err.code}): {text}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Replace Supabase tables with migration CSVs.")
    parser.add_argument("--yes", action="store_true", help="破壊的操作を承認して実行する")
    args = parser.parse_args()

    env = load_env(ENV_PATH)
    url = require_env(env, "SUPABASE_URL").rstrip("/")
    key = require_env(env, "SUPABASE_SERVICE_ROLE_KEY")
    if not key.startswith("sb_secret_"):
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY does not look like a secret key.")

    all_tables = list(dict.fromkeys(DELETE_ORDER + IMPORT_ORDER))
    before = {t: get_count(url, key, t) for t in all_tables}
    before["invent_categories"] = get_count(url, key, "invent_categories")

    # 投入予定の CSV 件数を先に読み込み（削除前にファイル不備を検出するため）
    csv_rows = {t: read_csv(CSV_DIR / CSV_FILES[t], t) for t in IMPORT_ORDER}
    csv_counts = {t: len(rows) for t, rows in csv_rows.items()}

    sys.stdout.buffer.write(("=== BEFORE counts ===\n" + json.dumps(before, ensure_ascii=False, indent=2) + "\n").encode())
    sys.stdout.buffer.write(("=== CSV row counts ===\n" + json.dumps(csv_counts, ensure_ascii=False, indent=2) + "\n").encode())

    if not args.yes:
        sys.stdout.buffer.write("\nDRY RUN: --yes が無いため削除・投入は行いません。\n".encode())
        return

    sys.stdout.buffer.write("\n=== DELETE (子→親, categories は除外) ===\n".encode())
    for table in DELETE_ORDER:
        delete_all(url, key, table)
        sys.stdout.buffer.write((f"  deleted all rows: {table}\n").encode())

    sys.stdout.buffer.write("\n=== IMPORT (親→子) ===\n".encode())
    for table in IMPORT_ORDER:
        rows = csv_rows[table]
        upsert_rows(url, key, table, rows)
        sys.stdout.buffer.write((f"  imported {len(rows)} rows: {table}\n").encode())

    after = {t: get_count(url, key, t) for t in all_tables}
    after["invent_categories"] = get_count(url, key, "invent_categories")

    # 照合
    ok = all(after[t] == csv_counts[t] for t in IMPORT_ORDER)
    after["invent_fiscal_snapshots_after"] = after.get("invent_fiscal_snapshots", 0)

    summary = {
        "before_counts": before,
        "csv_counts": csv_counts,
        "after_counts": after,
        "match": ok,
        "categories_untouched": before["invent_categories"] == after["invent_categories"],
    }
    sys.stdout.buffer.write(("\n=== SUMMARY ===\n" + json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode())
    if not ok:
        raise SystemExit("WARNING: 投入後の件数が CSV と一致しません。確認してください。")


if __name__ == "__main__":
    main()
