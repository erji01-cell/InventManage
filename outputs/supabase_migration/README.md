# Supabase Migration CSV

Excel files were converted into CSV files matching the current Supabase schema.

## Import Order

Import the CSV files into Supabase in this order:

1. `invent_suppliers.csv`
2. `invent_staff.csv`
3. `invent_parent_assets.csv`
4. `invent_child_assets.csv`
5. `invent_stock_movements.csv`

## CSV Columns

`invent_suppliers.csv`

- `id`
- `name`

`invent_staff.csv`

- `id`
- `name`
- `is_active`

`invent_parent_assets.csv`

- `id`
- `generic_name`
- `category`
- `safety_stock`

`invent_child_assets.csv`

- `id`
- `parent_id`
- `maker`
- `brand_name`
- `kana_name`
- `opening_stock`
- `price`
- `delivery_price`
- `unit`
- `purchase_unit`
- `supplier_id`
- `jan_code`
- `is_active`

`invent_stock_movements.csv`

- `id`
- `child_asset_id`
- `movement_date`
- `movement_type`
- `quantity`
- `actual_delivery_price`
- `expiration_date`
- `lot_number`
- `staff_code`
- `staff_name`
- `memo`

## Notes

- `created_at` is omitted so Supabase can fill it automatically.
- Parent assets are grouped by normalized `メーカー + ヒンメイ`.
- Dates such as `令和07年07月02日` are converted to `YYYY-MM-DD`.
- Staff master data is saved in `invent_staff.csv`.
- Movement staff data is saved in `staff_code` and `staff_name`.
- Movement `memo` keeps only the source `摘要`.
- `opening_stock` is copied from `T_資産マスタ.xlsx` `期首在庫数`.
- One asset had no unit in Excel, so `unit` was filled with `個`.
- Review `parent_asset_review.csv` before importing if parent-child grouping matters.
- After importing CSVs with explicit integer IDs, run `reset_supabase_sequences.sql` in Supabase SQL Editor.
