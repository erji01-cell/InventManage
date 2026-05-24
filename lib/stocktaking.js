// 棚卸し機能のAPIラッパー
// - 棚卸しセッション (invent_inventory_counts)
// - 棚卸し明細 (invent_inventory_count_items)
// - 確定時は invent_stock_movements に「棚卸し調整」として差分を登録

import { supabaseRequest } from './supabase.js';
import { isMovementAfterClose } from '../utils/inventory.js';

export async function fetchStocktakings(session) {
  return supabaseRequest(
    'invent_inventory_counts?select=*&order=started_at.desc',
    {},
    session
  );
}

export async function fetchStocktakingItems(countId, session) {
  return supabaseRequest(
    `invent_inventory_count_items?count_id=eq.${countId}&select=*&order=asset_id.asc`,
    {},
    session
  );
}

// 新規棚卸しセッション作成 + 全資産のシステム在庫をスナップショット保存
// basisDate: 基準日（YYYY-MM-DD）。指定があればその日までの入出庫でシステム在庫を計算
export async function createStocktaking({ staffId, memo, basisDate, assets, movements }, session) {
  const assetMap = new Map(assets.map((a) => [String(a.id), a]));
  const inboundByAsset = new Map();
  const outboundByAsset = new Map();
  movements.forEach((m) => {
    const key = String(m.assetId);
    const asset = assetMap.get(key);
    const closedAt = asset?.fiscalYearClosedAt || null;
    // 年度クローズ済み期間の入出庫は opening_stock に反映済みのためスキップ
    if (!isMovementAfterClose(m.date, closedAt)) return;
    // 基準日が指定されている場合、その日付より後の入出庫はカウントしない
    const md = m.date ? String(m.date).replaceAll('/', '-') : null;
    if (basisDate && md && md > basisDate) return;
    const qty = Number(m.quantity) || 0;
    if (m.type === 'in') inboundByAsset.set(key, (inboundByAsset.get(key) || 0) + qty);
    else if (m.type === 'out') outboundByAsset.set(key, (outboundByAsset.get(key) || 0) + qty);
  });

  const [count] = await supabaseRequest(
    'invent_inventory_counts?select=*',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        staff_id: staffId ? String(staffId) : null,
        memo: memo || null,
        basis_date: basisDate || null,
        status: 'in_progress',
      }),
    },
    session
  );

  const items = assets.map((a) => {
    const key = String(a.id);
    const systemQty = Number(a.openingStock || 0)
      + (inboundByAsset.get(key) || 0)
      - (outboundByAsset.get(key) || 0);
    return {
      count_id: count.id,
      asset_id: String(a.id),
      system_qty: systemQty,
      counted_qty: null,
      unit_price: Number(a.deliveryPrice || 0),
    };
  });

  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    await supabaseRequest(
      'invent_inventory_count_items',
      {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(items.slice(i, i + CHUNK)),
      },
      session
    );
  }

  return count;
}

export async function updateStocktakingItem(itemId, patch, session) {
  await supabaseRequest(
    `invent_inventory_count_items?id=eq.${itemId}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    },
    session
  );
}

// 棚卸し確定：差分を入出庫データに記録し、セッションを完了状態へ
export async function completeStocktaking({ countId, items, staffId, staffName, date }, session) {
  const newMovements = [];
  items.forEach((item) => {
    if (item.counted_qty == null) return;
    const diff = Number(item.counted_qty) - Number(item.system_qty);
    if (diff === 0) return;
    newMovements.push({
      child_asset_id: Number(item.asset_id),
      movement_date: date,
      movement_type: diff > 0 ? 'in' : 'out',
      quantity: Math.abs(diff),
      actual_delivery_price: diff > 0 ? Number(item.unit_price || 0) : 0,
      staff_code: staffId ? Number(staffId) : null,
      staff_name: staffName || null,
      memo: `[棚卸し調整] ${item.note || ''}`.trim(),
      stocktaking_count_id: countId,
    });
  });

  let createdMovements = [];
  if (newMovements.length > 0) {
    createdMovements = await supabaseRequest(
      'invent_stock_movements?select=*',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(newMovements),
      },
      session
    );
  }

  await supabaseRequest(
    `invent_inventory_counts?id=eq.${countId}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }),
    },
    session
  );

  return { createdMovements, diffCount: newMovements.length };
}

// 削除前に「紐づく入出庫データ件数」を確認するためのヘルパー
export async function countLinkedMovements(countId, session) {
  // count=exact ヘッダで件数だけ高速取得
  const url = `invent_stock_movements?stocktaking_count_id=eq.${countId}&select=id`;
  return supabaseRequest(url, {}, session).then((rows) => rows.length);
}

export async function deleteStocktaking(countId, session) {
  // 紐づく「[棚卸し調整]」入出庫データを先に削除（在庫を元に戻す）
  await supabaseRequest(
    `invent_stock_movements?stocktaking_count_id=eq.${countId}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    },
    session
  );
  // 棚卸し明細は ON DELETE CASCADE で連動削除される
  await supabaseRequest(
    `invent_inventory_counts?id=eq.${countId}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    },
    session
  );
}
