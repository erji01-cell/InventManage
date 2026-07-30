export function normalizeOrderRequest(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    assetId: String(row.child_asset_id),
    supplierId: row.supplier_id == null ? '' : String(row.supplier_id),
    assetName: row.asset_name || '',
    supplierName: row.supplier_name || '発注先未設定',
    quantity: Number(row.quantity) || 0,
    purchaseUnit: row.purchase_unit || '',
    memo: row.memo || '',
    requestedBy: row.requested_by || '',
    requestedAt: row.requested_at || '',
    status: row.status || 'requested',
    completedBy: row.completed_by || '',
    completedAt: row.completed_at || '',
    emailSentAt: row.email_sent_at || '',
  };
}

