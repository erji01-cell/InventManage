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

export function normalizeAsset(row, parentMap, supplierMap) {
  const parent = parentMap.get(row.parent_id);
  const supplier = supplierMap.get(row.supplier_id);

  return {
    id: String(row.id),
    parentId: row.parent_id,
    maker: row.maker,
    name: row.brand_name,
    kanaName: row.kana_name || '',
    category: parent?.category || '',
    parentGenericName: parent?.generic_name || '',
    parentCategory: parent?.category || '',
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
    memo: row.child_memo || '',
  };
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
  };
}
