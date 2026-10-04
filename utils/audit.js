export const AUDIT_TABLES = {
  invent_child_assets: '資産',
  invent_parent_assets: '品目',
  invent_categories: '分類',
  invent_stock_movements: '入出庫',
  invent_suppliers: '取引先',
  invent_staff: '担当者',
  invent_order_requests: '発注',
  invent_inventory_counts: '棚卸し',
  invent_inventory_count_items: '棚卸し明細',
  invent_fiscal_snapshots: '年度在庫',
};

export const AUDIT_OPERATIONS = { INSERT: '追加', UPDATE: '修正', DELETE: '削除' };

const FIELD_LABELS = {
  id: 'ID', parent_id: '品目ID', maker: 'メーカー', brand_name: '資産名',
  kana_name: '読み仮名', delivery_price: '購入価格', usage_unit_price: '受払単価',
  usage_unit: '受払単位', purchase_unit: '購入単位', pack_size: '入数',
  supplier_id: '取引先ID', jan_code: 'JANコード', is_active: '使用状態',
  opening_stock: '期首在庫', child_memo: '摘要', generic_name: '品目名',
  category: '分類名', category_id: '分類ID', safety_stock: '安全在庫',
  name: '名称', display_order: '表示順', child_asset_id: '資産ID', asset_id: '資産ID',
  movement_date: '入出庫日', movement_type: '入出庫区分', quantity: '数量',
  actual_delivery_price: '実購入単価', expiration_date: '使用期限', lot_number: 'ロット番号',
  staff_code: '担当者ID', staff_id: '担当者ID', staff_name: '担当者名', memo: '摘要',
  created_at: '登録日時', updated_at: '更新日時', asset_name: '資産名',
  supplier_name: '取引先名', requested_by: '依頼者', requested_at: '発注依頼日時',
  status: '状態', completed_by: '完了者', completed_at: '完了日時',
  delivered_by: '納品確認者', delivered_at: '納品日時', email_sent_at: 'メール送信日時',
  stocktaking_count_id: '棚卸しID', count_id: '棚卸しID', basis_date: '基準日',
  started_at: '開始日時', system_qty: '帳簿在庫', counted_qty: '実在庫',
  unit_price: '単価', note: '備考', fiscal_year: '年度', closing_stock: '期末在庫',
  closed_at: '年度締め日', fiscal_year_closed_at: '年度締め日',
};

export function getAuditChanges(log) {
  const before = log.old_data || {};
  const after = log.new_data || {};
  const fields = log.changed_fields || [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields
    .filter((field) => log.operation !== 'UPDATE' || JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, label: FIELD_LABELS[field] || field, before: before[field], after: after[field] }));
}

export function formatAuditValue(field, value, tableName) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? '有効' : '無効';
  if (field === 'movement_type') return { in: '入庫', out: '出庫' }[value] || String(value);
  if (field === 'status') {
    const labels = tableName === 'invent_order_requests'
      ? { requested: '発注未完了', completed: '発注完了', delivered: '納品完了', cancelled: '取消' }
      : { in_progress: '実施中', completed: '完了' };
    return labels[value] || String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function getAuditTarget(log) {
  const row = log.new_data || log.old_data || {};
  return row.brand_name || row.generic_name || row.asset_name || row.name
    || (row.child_asset_id != null ? `資産ID: ${row.child_asset_id}` : '')
    || (row.asset_id != null ? `資産ID: ${row.asset_id}` : '')
    || (row.count_id != null ? `棚卸しID: ${row.count_id}` : '')
    || (row.basis_date ? `基準日: ${row.basis_date}` : '') || '-';
}

export function getAuditActor(log) {
  if (log.actor_email) return log.actor_email;
  if (log.actor_user_id) return `ユーザーID: ${log.actor_user_id}`;
  return log.actor_role === 'service_role' ? '自動処理' : 'DB管理・自動処理';
}

export function buildAuditQuery(filters = {}, cursor = null, pageSize = 50) {
  const params = new URLSearchParams({ select: '*', order: 'occurred_at.desc,id.desc', limit: String(pageSize + 1) });
  if (filters.tableName) params.set('table_name', `eq.${filters.tableName}`);
  if (filters.operation) params.set('operation', `eq.${filters.operation}`);
  if (filters.recordId?.trim()) params.set('record_id', `eq.${filters.recordId.trim()}`);
  // 日付フィルターは日本時間の0時を境界にする。終了日は翌日0時未満。
  if (filters.fromDate) params.append('occurred_at', `gte.${filters.fromDate}T00:00:00+09:00`);
  if (filters.toDate) {
    const nextDay = new Date(`${filters.toDate}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    params.append('occurred_at', `lt.${nextDay.toISOString().slice(0, 10)}T00:00:00+09:00`);
  }
  // 新しい履歴が追加されても、次ページで重複・読み飛ばしが起きないようにする。
  if (cursor) params.set('or', `(occurred_at.lt.${cursor.occurred_at},and(occurred_at.eq.${cursor.occurred_at},id.lt.${cursor.id}))`);
  return `invent_audit_logs?${params}`;
}
