from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import unicodedata
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Any

import openpyxl


DEFAULT_INPUT_DIR = Path(r"G:\マイドライブ\吉野個人用\WebApp\InventManage")
DEFAULT_OUTPUT_DIR = Path("outputs/supabase_migration")

WORKBOOKS = {
    "assets": "T_資産マスタ.xlsx",
    "suppliers": "T_取引先マスタ.xlsx",
    "staff": "T_担当者マスタ.xlsx",
    "movements": "T_入出庫データ.xlsx",
    "categories": "T_分類マスタ.xlsx",
}

ERA_START_YEARS = {
    "明治": 1868,
    "大正": 1912,
    "昭和": 1926,
    "平成": 1989,
    "令和": 2019,
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert InventManage Excel exports into CSV files for Supabase import."
    )
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    input_dir = args.input_dir
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    suppliers = read_sheet(input_dir / WORKBOOKS["suppliers"])
    staff = read_sheet(input_dir / WORKBOOKS["staff"])
    categories = read_sheet(input_dir / WORKBOOKS["categories"])
    assets = read_sheet(input_dir / WORKBOOKS["assets"])
    movements = read_sheet(input_dir / WORKBOOKS["movements"])

    supplier_rows, supplier_map = build_suppliers(suppliers)
    staff_rows, staff_map = build_staff(staff)
    category_map = build_category_map(categories)
    parent_rows, parent_id_by_key = build_parent_assets(assets, category_map)
    child_rows, asset_map = build_child_assets(assets, supplier_map, parent_id_by_key)
    movement_rows, movement_warnings = build_stock_movements(movements, asset_map, staff_map)

    write_csv(output_dir / "invent_suppliers.csv", supplier_rows)
    write_csv(output_dir / "invent_staff.csv", staff_rows)
    write_csv(output_dir / "invent_parent_assets.csv", parent_rows)
    write_csv(output_dir / "invent_child_assets.csv", child_rows)
    write_csv(output_dir / "invent_stock_movements.csv", movement_rows)
    write_parent_review(output_dir / "parent_asset_review.csv", assets, category_map, parent_id_by_key)

    manifest = {
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "files": {
            "invent_suppliers.csv": len(supplier_rows),
            "invent_staff.csv": len(staff_rows),
            "invent_parent_assets.csv": len(parent_rows),
            "invent_child_assets.csv": len(child_rows),
            "invent_stock_movements.csv": len(movement_rows),
        },
        "source_rows": {
            "T_取引先マスタ.xlsx": len(suppliers),
            "T_分類マスタ.xlsx": len(categories),
            "T_資産マスタ.xlsx": len(assets),
            "T_入出庫データ.xlsx": len(movements),
            "T_担当者マスタ.xlsx": len(staff),
        },
        "warnings": movement_warnings,
        "supabase_schema_notes": {
            "invent_suppliers": ["id", "name"],
            "invent_staff": ["id", "name", "is_active"],
            "invent_parent_assets": ["id", "generic_name", "category", "safety_stock"],
            "invent_child_assets": [
                "id",
                "parent_id",
                "maker",
                "brand_name",
                "kana_name",
                "opening_stock",
                "price",
                "delivery_price",
                "unit",
                "purchase_unit",
                "supplier_id",
                "jan_code",
                "is_active",
            ],
            "invent_stock_movements": [
                "id",
                "child_asset_id",
                "movement_date",
                "movement_type",
                "quantity",
                "actual_delivery_price",
                "expiration_date",
                "lot_number",
                "staff_code",
                "staff_name",
                "memo",
            ],
        },
        "notes": [
            "CSV files now match the Supabase table columns provided by SQL Editor.",
            "created_at columns are omitted so Supabase can fill defaults.",
            "Parent assets are grouped by normalized maker and kana product name.",
            "Review parent_asset_review.csv before importing if equivalent-product grouping matters.",
        ],
    }
    (output_dir / "migration_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def read_sheet(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")

    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook.worksheets[0]
        rows = sheet.iter_rows(values_only=True)
        headers = [str(value).strip() if value is not None else "" for value in next(rows)]
        records = []
        for row in rows:
            record = {headers[index]: value for index, value in enumerate(row) if index < len(headers)}
            if any(clean_text(value) for value in record.values()):
                records.append(record)
        return records
    finally:
        workbook.close()


def build_suppliers(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    output = []
    supplier_map = {}

    for row in rows:
        supplier_code = clean_code(row.get("取引先コード"))
        supplier_name = clean_text(row.get("取引先"))
        if not supplier_code or not supplier_name:
            continue

        supplier_id = int(supplier_code)
        supplier_map[supplier_code] = supplier_id
        output.append(
            {
                "id": supplier_id,
                "name": supplier_name,
            }
        )

    return output, supplier_map


def build_staff(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    output = []
    staff_map = {}
    for row in rows:
        staff_code = clean_code(row.get("担当者コード"))
        staff_name = clean_text(row.get("担当者名"))
        if staff_code and staff_name:
            output.append(
                {
                    "id": int(staff_code),
                    "name": staff_name,
                    "is_active": "true",
                }
            )
            staff_map[staff_code] = staff_name
    return output, staff_map


def build_category_map(rows: list[dict[str, Any]]) -> dict[str, str]:
    category_map = {}
    for row in rows:
        category_code = clean_code(row.get("分類コード"))
        category_name = clean_text(row.get("分類"))
        if category_code and category_name:
            category_map[category_code] = category_name
    return category_map


def build_parent_assets(
    rows: list[dict[str, Any]], category_map: dict[str, str]
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    parent_groups: OrderedDict[str, dict[str, Any]] = OrderedDict()

    for row in rows:
        key = parent_key(row)
        category_code = clean_code(row.get("分類コード"))
        if key not in parent_groups:
            kana_name = clean_text(row.get("ヒンメイ"))
            brand_name = clean_text(row.get("品名"))
            parent_groups[key] = {
                "generic_name": kana_name or brand_name,
                "category": category_map.get(category_code, ""),
                "child_count": 0,
            }
        parent_groups[key]["child_count"] += 1

    parent_rows = []
    parent_id_by_key = {}
    for index, (key, group) in enumerate(parent_groups.items(), start=1):
        parent_id = f"P-{index:04d}"
        parent_id_by_key[key] = parent_id
        parent_rows.append(
            {
                "id": parent_id,
                "generic_name": group["generic_name"],
                "category": group["category"],
                "safety_stock": "",
            }
        )

    return parent_rows, parent_id_by_key


def build_child_assets(
    rows: list[dict[str, Any]],
    supplier_map: dict[str, int],
    parent_id_by_key: dict[str, str],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    output = []
    asset_map = {}

    for row in rows:
        asset_code = clean_code(row.get("資産コード"))
        supplier_code = clean_code(row.get("取引先コード"))
        asset_id = int(asset_code)
        unit = clean_text(row.get("単位")) or clean_text(row.get("購入単位")) or "個"

        child = {
            "id": asset_id,
            "parent_id": parent_id_by_key[parent_key(row)],
            "maker": clean_text(row.get("メーカー")),
            "brand_name": clean_text(row.get("品名")),
            "kana_name": clean_text(row.get("ヒンメイ")),
            "opening_stock": number_or_blank(row.get("期首在庫数")),
            "price": number_or_blank(row.get("単価")),
            "delivery_price": number_or_blank(row.get("納入価格")),
            "unit": unit,
            "purchase_unit": clean_text(row.get("購入単位")),
            "supplier_id": supplier_map.get(supplier_code, ""),
            "jan_code": "",
            "is_active": "true",
        }
        output.append(child)
        asset_map[asset_code] = {
            **child,
            "expiration_date": parse_date(row.get("使用期限")),
            "staff_memo": clean_text(row.get("摘要")),
        }

    return output, asset_map


def build_stock_movements(
    rows: list[dict[str, Any]], asset_map: dict[str, dict[str, Any]], staff_map: dict[str, str]
) -> tuple[list[dict[str, Any]], list[str]]:
    output = []
    warnings = []
    missing_assets = Counter()

    for row in rows:
        original_id = clean_code(row.get("ID"))
        asset_code = clean_code(row.get("資産コード"))
        asset = asset_map.get(asset_code)
        if not asset:
            missing_assets[asset_code] += 1

        inbound = int_or_zero(row.get("入庫数"))
        outbound = int_or_zero(row.get("出庫数"))
        if inbound == 0 and outbound == 0:
            continue

        if inbound and outbound:
            warnings.append(f"Movement {original_id} has both inbound and outbound quantities.")

        movement_type = "in" if inbound >= outbound else "out"
        quantity = inbound if movement_type == "in" else outbound
        staff_code = clean_code(row.get("担当者コード"))
        staff_name = staff_map.get(staff_code, "")
        base_memo = clean_text(row.get("摘要"))

        output.append(
            {
                "id": int(original_id),
                "child_asset_id": asset.get("id", "") if asset else "",
                "movement_date": parse_date(row.get("日付")),
                "movement_type": movement_type,
                "quantity": quantity,
                "actual_delivery_price": asset.get("delivery_price", "") if asset else "",
                "expiration_date": asset.get("expiration_date", "") if asset else "",
                "lot_number": "",
                "staff_code": int(staff_code) if staff_code else "",
                "staff_name": staff_name,
                "memo": base_memo,
            }
        )

    if missing_assets:
        warnings.append(f"Missing assets referenced by movements: {dict(missing_assets)}")

    return output, warnings


def write_parent_review(
    path: Path,
    rows: list[dict[str, Any]],
    category_map: dict[str, str],
    parent_id_by_key: dict[str, str],
) -> None:
    review_rows = []
    for row in rows:
        category_code = clean_code(row.get("分類コード"))
        review_rows.append(
            {
                "parent_id": parent_id_by_key[parent_key(row)],
                "asset_code": clean_code(row.get("資産コード")),
                "maker": clean_text(row.get("メーカー")),
                "generic_name": clean_text(row.get("ヒンメイ")),
                "brand_name": clean_text(row.get("品名")),
                "category": category_map.get(category_code, ""),
            }
        )
    write_csv(path, review_rows)


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8-sig")
        return

    with path.open("w", encoding="utf-8-sig", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def parent_key(row: dict[str, Any]) -> str:
    maker = normalize_key(row.get("メーカー"))
    kana_name = normalize_key(row.get("ヒンメイ"))
    if maker or kana_name:
        return f"{maker}|{kana_name}"
    return normalize_key(row.get("品名"))


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, dt.date):
        return value.isoformat()
    text = str(value).replace("\u3000", " ").strip()
    return "" if text in {"", "None"} else text


def clean_code(value: Any) -> str:
    text = clean_text(value)
    if re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return text


def normalize_key(value: Any) -> str:
    text = unicodedata.normalize("NFKC", clean_text(value))
    text = text.upper()
    return re.sub(r"\s+", "", text)


def int_or_zero(value: Any) -> int:
    if value is None or clean_text(value) == "":
        return 0
    return int(float(value))


def number_or_blank(value: Any) -> Any:
    if value is None or clean_text(value) == "":
        return ""
    number = float(value)
    return int(number) if number.is_integer() else number


def parse_date(value: Any) -> str:
    if value is None or clean_text(value) == "":
        return ""
    if isinstance(value, dt.datetime):
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()

    text = unicodedata.normalize("NFKC", clean_text(value))
    text = text.replace("元年", "1年")

    era_match = re.fullmatch(r"(明治|大正|昭和|平成|令和)(\d{1,2})年(\d{1,2})月(\d{1,2})日", text)
    if era_match:
        era, year, month, day = era_match.groups()
        western_year = ERA_START_YEARS[era] + int(year) - 1
        return dt.date(western_year, int(month), int(day)).isoformat()

    compact_era_match = re.fullmatch(r"([MTSHR])(\d{1,2})[./-](\d{1,2})[./-](\d{1,2})", text, re.I)
    if compact_era_match:
        era_symbol, year, month, day = compact_era_match.groups()
        era_name = {"M": "明治", "T": "大正", "S": "昭和", "H": "平成", "R": "令和"}[
            era_symbol.upper()
        ]
        western_year = ERA_START_YEARS[era_name] + int(year) - 1
        return dt.date(western_year, int(month), int(day)).isoformat()

    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y年%m月%d日"):
        try:
            return dt.datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass

    return text


if __name__ == "__main__":
    main()
