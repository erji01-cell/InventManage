export const toNumber = (value) => Number(value ?? 0) || 0;
export const toNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function getNextParentId(assets) {
  const maxId = assets.reduce((max, asset) => {
    const match = String(asset.parentId || '').match(/^P-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `P-${String(maxId + 1).padStart(4, '0')}`;
}

export function normalizeAsset(row, parentMap, supplierMap, categoryMap = new Map()) {
  const parent = parentMap.get(row.parent_id);
  const supplier = supplierMap.get(row.supplier_id);

  let resolvedCategoryId = parent?.category_id || null;
  let category = resolvedCategoryId ? categoryMap.get(resolvedCategoryId) : null;
  // category_id が未設定のとき、テキスト名で照合してIDを解決する
  if (!resolvedCategoryId && parent?.category) {
    for (const [id, cat] of categoryMap) {
      if (cat.name === parent.category) {
        resolvedCategoryId = id;
        category = cat;
        break;
      }
    }
  }
  const categoryName = category?.name || parent?.category || '';

  return {
    id: String(row.id),
    parentId: row.parent_id,
    maker: row.maker,
    name: row.brand_name,
    kanaName: row.kana_name || '',
    category: categoryName,
    categoryId: resolvedCategoryId,
    categoryOrder: category?.display_order ?? 9999,
    parentGenericName: parent?.generic_name || '',
    parentCategory: categoryName,
    parentSafetyStock: parent?.safety_stock ?? '',
    parentCreatedAt: parent?.created_at || '',
    packSize: toNumber(row.pack_size || 1),
    deliveryPrice: toNumber(row.delivery_price),
    usageUnitPrice: toNumber(row.usage_unit_price),
    usageUnit: row.usage_unit,
    purchaseUnit: row.purchase_unit || '',
    supplierId: row.supplier_id ? String(row.supplier_id) : '',
    supplier: supplier?.name || '',
    janCode: row.jan_code || '',
    isActive: row.is_active !== false,
    childCreatedAt: row.created_at || '',
    openingStock: toNumber(row.opening_stock),
    fiscalYearClosedAt: row.fiscal_year_closed_at || null,
    memo: row.child_memo || '',
  };
}

// クローズ日（YYYY-MM-DD / YYYY/MM/DD）の翌日を YYYY-MM-DD で返す。
// 締め済み資産で入力可能な最小日（date input の min）として使う。
export function dayAfter(dateStr) {
  if (!dateStr) return undefined;
  const [year, month, day] = String(dateStr).replaceAll('/', '-').split('-').map(Number);
  if (!year || !month || !day) return undefined;
  const next = new Date(year, month - 1, day + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

// 日付（YYYY-MM-DD / YYYY/MM/DD）が属する会計年度の開始年を返す。
// 会計年度は7月開始（7〜12月→その年、1〜6月→前年）。
export function fiscalStartYearOf(dateStr) {
  const [year, month] = String(dateStr || '').replaceAll('/', '-').split('-').map(Number);
  if (!year || !month) return null;
  return month >= 7 ? year : year - 1;
}

// 入出庫が「年度クローズ日より後」かどうか
// closedAt が null（未クローズ）なら全期間カウント
export function isMovementAfterClose(movementDate, closedAt) {
  if (!closedAt) return true;
  if (!movementDate) return false;
  const md = String(movementDate).replaceAll('/', '-');
  return md > closedAt;
}

export function normalizeMovementType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'in') return 'in';
  if (text === 'out') return 'out';
  return '';
}

export function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).replaceAll('/', '-').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function normalizeMovement(row, staffMap) {
  const staffId = row.staff_code ? String(row.staff_code) : '';
  const staff = staffMap.get(row.staff_code);

  return {
    id: row.id,
    assetId: String(row.child_asset_id),
    date: row.movement_date,
    type: normalizeMovementType(row.movement_type),
    quantity: toNumber(row.quantity),
    actualDeliveryPrice: toNumber(row.actual_delivery_price),
    expirationDate: row.expiration_date || '',
    lotNumber: row.lot_number || '',
    staffId,
    staffName: row.staff_name || staff?.name || '',
    memo: row.memo || '',
    stocktakingCountId: row.stocktaking_count_id ?? null,
  };
}
