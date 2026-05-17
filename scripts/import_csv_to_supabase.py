from __future__ import annotations

import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / ".env"
CSV_DIR = ROOT_DIR / "outputs" / "supabase_migration"

BATCH_SIZE = 500

TABLES = [
    "invent_suppliers",
    "invent_staff",
    "invent_parent_assets",
    "invent_child_assets",
    "invent_stock_movements",
]

CSV_FILES = {
    "invent_suppliers": "invent_suppliers.csv",
    "invent_staff": "invent_staff.csv",
    "invent_parent_assets": "invent_parent_assets.csv",
    "invent_child_assets": "invent_child_assets.csv",
    "invent_stock_movements": "invent_stock_movements.csv",
}

INTEGER_COLUMNS = {
    "invent_suppliers": {"id"},
    "invent_staff": {"id"},
    "invent_parent_assets": {"safety_stock"},
    "invent_child_assets": {"id", "opening_stock", "supplier_id"},
    "invent_stock_movements": {"id", "child_asset_id", "quantity", "staff_code"},
}

NUMERIC_COLUMNS = {
    "invent_child_assets": {"delivery_price"},
    "invent_stock_movements": {"actual_delivery_price"},
}

BOOLEAN_COLUMNS = {
    "invent_staff": {"is_active"},
    "invent_child_assets": {"is_active"},
}


def main() -> None:
    env = load_env(ENV_PATH)
    supabase_url = require_env(env, "SUPABASE_URL").rstrip("/")
    service_key = require_env(env, "SUPABASE_SERVICE_ROLE_KEY")

    if "ここに" in service_key or not service_key.startswith("sb_secret_"):
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY in .env does not look like a secret key.")

    print("Starting Supabase CSV import...")
    before_counts = {table: get_count(supabase_url, service_key, table) for table in TABLES}

    imported_counts = {}
    for table in TABLES:
        rows = read_csv(CSV_DIR / CSV_FILES[table], table)
        imported_counts[table] = len(rows)
        upsert_rows(supabase_url, service_key, table, rows)
        print(f"Imported {len(rows)} rows into {table}.")

    after_counts = {table: get_count(supabase_url, service_key, table) for table in TABLES}

    print(
        json.dumps(
            {
                "before_counts": before_counts,
                "imported_counts": imported_counts,
                "after_counts": after_counts,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


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


def require_env(env: dict[str, str], key: str) -> str:
    value = env.get(key, "").strip()
    if not value:
        raise SystemExit(f"{key} is not set in .env")
    return value


def read_csv(path: Path, table: str) -> list[dict[str, Any]]:
    if not path.exists():
        raise SystemExit(f"CSV file not found: {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        return [convert_row(table, row) for row in reader]


def convert_row(table: str, row: dict[str, str]) -> dict[str, Any]:
    converted: dict[str, Any] = {}
    for key, value in row.items():
        value = value.strip() if isinstance(value, str) else value
        if value == "":
            converted[key] = None
        elif key in INTEGER_COLUMNS.get(table, set()):
            converted[key] = int(value)
        elif key in NUMERIC_COLUMNS.get(table, set()):
            converted[key] = float(value)
        elif key in BOOLEAN_COLUMNS.get(table, set()):
            converted[key] = value.lower() == "true"
        else:
            converted[key] = value
    return converted


def upsert_rows(supabase_url: str, service_key: str, table: str, rows: list[dict[str, Any]]) -> None:
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start : start + BATCH_SIZE]
        request_json(
            f"{supabase_url}/rest/v1/{table}?on_conflict=id",
            service_key,
            method="POST",
            body=batch,
            extra_headers={
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )


def get_count(supabase_url: str, service_key: str, table: str) -> int:
    response_headers, _ = request_json(
        f"{supabase_url}/rest/v1/{table}?select=id",
        service_key,
        method="GET",
        extra_headers={
            "Prefer": "count=exact",
            "Range": "0-0",
        },
    )
    content_range = response_headers.get("content-range") or response_headers.get("Content-Range")
    if not content_range:
        return 0
    return int(content_range.split("/")[-1])


def request_json(
    url: str,
    service_key: str,
    *,
    method: str,
    body: Any | None = None,
    extra_headers: dict[str, str] | None = None,
) -> tuple[dict[str, str], Any]:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            text = response.read().decode("utf-8")
            parsed = json.loads(text) if text else None
            return dict(response.headers), parsed
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", errors="replace")
        print(f"Supabase request failed: {method} {url}", file=sys.stderr)
        print(text, file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
