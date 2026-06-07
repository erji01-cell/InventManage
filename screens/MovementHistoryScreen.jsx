import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Printer, Save, Table2, Trash2, X } from 'lucide-react';

import { Button, Card, DetailItem, EditableDetail } from '../components/ui.jsx';
import AssetSearchInput from './AssetSearchInput.jsx';
import { isMovementAfterClose, normalizeMovementType, parseLocalDate } from '../utils/inventory.js';

// 棚卸し調整かどうか判定
// 新データは stocktakingCountId、旧データは memo プレフィックスで後方互換
const isAdjustmentMovement = (m) =>
  m?.stocktakingCountId != null
  || /^\s*\[棚卸し調整\]/.test(m?.memo || '');

export default function MovementHistoryScreen({ movements, setView, assets, staff = [], updateMovement, deleteMovement, pinnedAssetId = '' }) {
  const [filterType, setFilterType] = useState('all');
  const [adjustmentFilter, setAdjustmentFilter] = useState('all'); // 'all' | 'normal' | 'adjustment'
  const [movementSearchTerm, setMovementSearchTerm] = useState('');
  const [pinnedId, setPinnedId] = useState(pinnedAssetId);
  const [assetResetSignal, setAssetResetSignal] = useState(0);

  const handleSearchTermChange = (term) => {
    if (pinnedId) setPinnedId('');
    setMovementSearchTerm(term);
  };
  const [movementDateFrom, setMovementDateFrom] = useState('');
  const [movementDateTo, setMovementDateTo] = useState('');
  const [appliedDateFrom, setAppliedDateFrom] = useState('');
  const [appliedDateTo, setAppliedDateTo] = useState('');
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [movementEditForm, setMovementEditForm] = useState(null);
  const [movementSaveError, setMovementSaveError] = useState('');
  const [isMovementSaving, setIsMovementSaving] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [editAssetCodeInput, setEditAssetCodeInput] = useState('');

  // AssetSearchInput 等で assetId が変わった場合、コード入力枠にも反映
  useEffect(() => {
    if (movementEditForm) {
      setEditAssetCodeInput(movementEditForm.assetId || '');
    }
  }, [movementEditForm?.assetId]);

  const selectEditAssetByCode = () => {
    const normalized = String(editAssetCodeInput).trim();
    if (!normalized) {
      setMovementSaveError('資産コードを入力してください。');
      return;
    }
    const matched = assets.find((a) => String(a.id) === normalized);
    if (!matched) {
      setMovementSaveError(`資産コード ${normalized} は見つかりません。`);
      return;
    }
    setMovementSaveError('');
    setMovementEditForm(prev => ({ ...prev, assetId: matched.id }));
  };

  // 品目ごとに日付・ID順で累積計算し、各取引後の残在庫を求める
  const runningStockMap = useMemo(() => {
    const map = new Map();
    const byAsset = new Map();
    movements.forEach(m => {
      if (!byAsset.has(m.assetId)) byAsset.set(m.assetId, []);
      byAsset.get(m.assetId).push(m);
    });
    byAsset.forEach((assetMovements, assetId) => {
      const asset = assets.find(a => a.id === assetId);
      const openingStock = asset?.openingStock || 0;
      const closedAt = asset?.fiscalYearClosedAt || null;
      const sorted = [...assetMovements].sort((a, b) => {
        const dateA = Date.parse(String(a.date || '').replaceAll('/', '-')) || 0;
        const dateB = Date.parse(String(b.date || '').replaceAll('/', '-')) || 0;
        if (dateA !== dateB) return dateA - dateB;
        return Number(a.id || 0) - Number(b.id || 0);
      });
      let stock = openingStock;
      sorted.forEach(m => {
        // 年度クローズ済み期間の入出庫は opening_stock に反映済みなので残在庫計算から除外
        if (!isMovementAfterClose(m.date, closedAt)) {
          map.set(String(m.id), null); // 過去年度の行は残在庫表示なし
          return;
        }
        const type = normalizeMovementType(m.type);
        if (type === 'in') stock += m.quantity;
        else if (type === 'out') stock -= m.quantity;
        map.set(String(m.id), stock);
      });
    });
    return map;
  }, [movements, assets]);

    const normalizedSearchTerm = movementSearchTerm.trim().toLowerCase();
  const appliedFromDate = parseLocalDate(appliedDateFrom);
  const appliedToDate = parseLocalDate(appliedDateTo);

  const displayedMovements = movements
    .map(m => ({ ...m, normalizedType: normalizeMovementType(m.type) }))
    .filter(m => {
      if (filterType === 'in') return m.normalizedType === 'in';
      if (filterType === 'out') return m.normalizedType === 'out';
      return true;
    })
    .filter(m => {
      if (adjustmentFilter === 'normal') return !isAdjustmentMovement(m);
      if (adjustmentFilter === 'adjustment') return isAdjustmentMovement(m);
      return true;
    })
    .filter(m => {
      if (!appliedFromDate && !appliedToDate) return true;
      const movementDate = parseLocalDate(m.date);
      if (!movementDate) return false;
      if (appliedFromDate && movementDate < appliedFromDate) return false;
      if (appliedToDate && movementDate > appliedToDate) return false;
      return true;
    })
    .filter(m => {
      if (pinnedId) return m.assetId === pinnedId;
      if (!normalizedSearchTerm) return true;
      const asset = assets.find(a => a.id === m.assetId);
      return [
        m.assetId,
        m.staffName,
        m.memo,
        asset?.maker,
        asset?.name,
        asset?.category,
      ].some(value => String(value || '').toLowerCase().includes(normalizedSearchTerm));
    })
    .sort((a, b) => {
      const dateA = Date.parse(String(a.date || '').replaceAll('/', '-')) || 0;
      const dateB = Date.parse(String(b.date || '').replaceAll('/', '-')) || 0;
      if (dateA !== dateB) return dateB - dateA;
      return Number(b.id || 0) - Number(a.id || 0);
    });

  const openMovementDetail = (movement, asset) => {
    setSelectedMovement({ movement, asset });
    setMovementEditForm({
      assetId: movement.assetId || '',
      date: movement.date || '',
      type: normalizeMovementType(movement.type) || 'in',
      quantity: movement.quantity || 0,
      actualDeliveryPrice: movement.actualDeliveryPrice ?? 0,
      expirationDate: movement.expirationDate || '',
      lotNumber: movement.lotNumber || '',
      staffId: movement.staffId || '',
      staffName: movement.staffName || '',
      memo: movement.memo || '',
    });
    setEditAssetCodeInput(movement.assetId || '');
    setMovementSaveError('');
  };

  const updateMovementEditForm = (field, value) => {
    setMovementEditForm(prev => ({ ...prev, [field]: value }));
  };

  const closeMovementDetail = () => {
    setSelectedMovement(null);
    setMovementEditForm(null);
    setMovementSaveError('');
  };

  const applyMovementDateFilter = () => {
    setAppliedDateFrom(movementDateFrom);
    setAppliedDateTo(movementDateTo);
  };

  const printStyles = `
    @page { size: A4 portrait; margin: 12mm 10mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; font-size: 8pt; color: #111; margin: 0; padding: 0; }
    h1 { font-size: 13pt; font-weight: bold; margin: 0 0 2mm; }
    .subtitle { font-size: 8pt; color: #555; margin-bottom: 4mm; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #f1f5f9; font-weight: bold; text-align: left; padding: 2.5mm 2mm; border: 0.3mm solid #cbd5e1; font-size: 7.5pt; white-space: nowrap; overflow: hidden; }
    td { padding: 2mm; border: 0.3mm solid #e2e8f0; vertical-align: top; word-break: break-all; overflow: hidden; }
    tr:nth-child(even) td { background: #f8fafc; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .in { color: #059669; font-weight: bold; }
    .out { color: #e11d48; font-weight: bold; }
    .neg { color: #dc2626; background: #fff1f2; }
    .summary { margin-top: 5mm; border: 0.4mm solid #bfdbfe; border-radius: 2mm; padding: 3mm 5mm; background: #eff6ff; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-top: 2mm; }
    .summary-item { text-align: center; }
    .summary-label { font-size: 7pt; color: #64748b; }
    .summary-value { font-size: 12pt; font-weight: bold; color: #1e40af; }
  `;

  const buildPrintDoc = (title, subtitle, tableHTML, summaryHTML = '') => `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>${title}</title>
<style>${printStyles}</style></head>
<body>
<h1>${title}</h1>
<div class="subtitle">${subtitle}</div>
${tableHTML}
${summaryHTML}
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`;

  const buildTableHTML = (rows) => {
    const headers = ['日付','分類','ID','メーカー','品名','入庫','出庫','残在庫','使用単位','実購入価格','使用期限'];
    const widths =  ['11%', '8%', '6%', '10%', '22%', '6%', '6%', '7%', '6%', '10%', '8%'];
    const ths = headers.map((h, i) => `<th style="width:${widths[i]}">${h}</th>`).join('');
    const tds = rows.map(({ m, asset, rs }) => {
      const type = m.normalizedType;
      const rsVal = rs !== undefined ? rs : null;
      return `<tr>
        <td>${m.date || '-'}</td>
        <td>${asset?.category || '-'}</td>
        <td>${m.assetId}</td>
        <td>${asset?.maker || '-'}</td>
        <td>${asset?.name || '-'}</td>
        <td class="text-right${type === 'in' ? ' in' : ''}">${type === 'in' ? m.quantity.toLocaleString() : '-'}</td>
        <td class="text-right${type === 'out' ? ' out' : ''}">${type === 'out' ? m.quantity.toLocaleString() : '-'}</td>
        <td class="text-right${rsVal !== null && rsVal < 0 ? ' neg' : ''}">${rsVal !== null ? rsVal.toLocaleString() : '-'}</td>
        <td class="text-center">${asset?.usageUnit || '-'}</td>
        <td class="text-right">${type === 'in' ? '¥' + m.actualDeliveryPrice.toLocaleString() : '-'}</td>
        <td>${m.expirationDate || '-'}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${tds}</tbody></table>`;
  };

  const openPrintWindow = (html) => {
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
  };

  const handlePrintList = () => {
    setShowPrintMenu(false);
    const today = new Date().toLocaleDateString('ja-JP');
    const rows = displayedMovements.map(m => ({ m, asset: assets.find(a => a.id === m.assetId), rs: runningStockMap.get(String(m.id)) }));
    const subtitle = `印刷日: ${today}　件数: ${rows.length}件`;
    const html = buildPrintDoc('入出庫データ一覧', subtitle, buildTableHTML(rows));
    openPrintWindow(html);
  };

  const handlePrintIndividual = () => {
    if (!pinnedId) return;
    setShowPrintMenu(false);
    const asset = assets.find(a => a.id === pinnedId);
    const today = new Date().toLocaleDateString('ja-JP');
    const rows = displayedMovements.map(m => ({ m, asset, rs: runningStockMap.get(String(m.id)) }));
    const totalIn = rows.filter(({ m }) => m.normalizedType === 'in').reduce((s, { m }) => s + m.quantity, 0);
    const totalOut = rows.filter(({ m }) => m.normalizedType === 'out').reduce((s, { m }) => s + m.quantity, 0);
    const lastRs = rows.length > 0 ? runningStockMap.get(String(rows[0].m.id)) : null;
    const subtitle = `${asset?.name || pinnedId}　ID: ${pinnedId}　メーカー: ${asset?.maker || '-'}　印刷日: ${today}`;
    const summaryHTML = `<div class="summary">
      <div style="font-weight:bold;font-size:9pt;">サマリー</div>
      <div class="summary-grid">
        <div class="summary-item"><div class="summary-label">合計入庫数</div><div class="summary-value" style="color:#059669">${totalIn.toLocaleString()} ${asset?.usageUnit || ''}</div></div>
        <div class="summary-item"><div class="summary-label">合計出庫数</div><div class="summary-value" style="color:#e11d48">${totalOut.toLocaleString()} ${asset?.usageUnit || ''}</div></div>
        <div class="summary-item"><div class="summary-label">現在庫</div><div class="summary-value" style="color:${lastRs !== null && lastRs < 0 ? '#dc2626' : '#1e40af'}">${lastRs !== null ? lastRs.toLocaleString() : '-'} ${asset?.usageUnit || ''}</div></div>
      </div>
    </div>`;
    const html = buildPrintDoc(`入出庫データ（個別）`, subtitle, buildTableHTML(rows), summaryHTML);
    openPrintWindow(html);
  };

  const saveMovementDetail = async () => {
    if (!selectedMovement || !movementEditForm) return;

    const quantity = Number(movementEditForm.quantity);
    const actualDeliveryPrice = Number(movementEditForm.actualDeliveryPrice || 0);
    const assetIdNum = Number(movementEditForm.assetId);
    if (!movementEditForm.assetId || !Number.isFinite(assetIdNum) || assetIdNum <= 0) {
      setMovementSaveError('品名を選択してください。');
      return;
    }
    if (!assets.find((a) => String(a.id) === String(movementEditForm.assetId))) {
      setMovementSaveError('選択された品名が見つかりません。');
      return;
    }
    if (!movementEditForm.date) {
      setMovementSaveError('入出庫日を入力してください。');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMovementSaveError('数量は1以上で入力してください。');
      return;
    }
    if (movementEditForm.type === 'in' && (!Number.isFinite(actualDeliveryPrice) || actualDeliveryPrice < 0)) {
      setMovementSaveError('実購入単価は0以上で入力してください。');
      return;
    }

    const staffMember = staff.find((member) => String(member.id) === String(movementEditForm.staffId));
    setIsMovementSaving(true);
    setMovementSaveError('');
    try {
      const updated = await updateMovement(selectedMovement.movement.id, {
        child_asset_id: Number(movementEditForm.assetId),
        movement_date: movementEditForm.date,
        movement_type: movementEditForm.type,
        quantity,
        actual_delivery_price: movementEditForm.type === 'in' ? actualDeliveryPrice : 0,
        expiration_date: movementEditForm.expirationDate || null,
        lot_number: movementEditForm.lotNumber || null,
        staff_code: staffMember ? Number(staffMember.id) : null,
        staff_name: staffMember?.name || movementEditForm.staffName || null,
        memo: movementEditForm.memo || null,
      });
      const updatedAsset = assets.find((asset) => asset.id === updated.assetId) || selectedMovement.asset;
      setSelectedMovement({ movement: updated, asset: updatedAsset });
      setMovementEditForm({
        assetId: updated.assetId || '',
        date: updated.date || '',
        type: updated.type || 'in',
        quantity: updated.quantity || 0,
        actualDeliveryPrice: updated.actualDeliveryPrice ?? 0,
        expirationDate: updated.expirationDate || '',
        lotNumber: updated.lotNumber || '',
        staffId: updated.staffId || '',
        staffName: updated.staffName || '',
        memo: updated.memo || '',
      });
    } catch (err) {
      setMovementSaveError(err.message || '入出庫データを保存できませんでした。');
    } finally {
      setIsMovementSaving(false);
    }
  };

  const handleDeleteMovement = async () => {
    if (!selectedMovement?.movement?.id) return;
    if (isAdjustmentMovement(selectedMovement.movement)) {
      setMovementSaveError('棚卸し調整の行は削除できません。棚卸し画面から該当セッションを削除してください。');
      return;
    }
    if (!window.confirm('この入出庫データを削除しますか？\nこの操作は取り消せません。')) return;
    setIsMovementSaving(true);
    setMovementSaveError('');
    try {
      await deleteMovement(selectedMovement.movement.id);
      closeMovementDetail();
    } catch (err) {
      setMovementSaveError(err.message || '削除に失敗しました。');
    } finally {
      setIsMovementSaving(false);
    }
  };

  return (
    <Card className="max-h-[90vh] flex flex-col relative">
      <button
        onClick={() => setView('menu')}
        className="absolute top-3 right-3 rounded-full p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors z-10"
        title="閉じる"
      >
        <X size={20} />
      </button>
      <div className="mb-5 flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Stock Movement</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">入出庫データ</h2>
          <p className="mt-2 text-sm text-slate-500">残在庫は現在の在庫ではありません</p>
        </div>
        <div className="flex items-center gap-3 mr-8">
          <Button variant="assets" onClick={() => setView('assets')}><ArrowLeftRight size={18} /> 資産マスタ</Button>
          <Button variant="stock" onClick={() => setView('stock')}><Table2 size={18} /> 在庫表</Button>
          <Button variant="history" onClick={() => setShowPrintMenu(true)}><Printer size={18} /> 印刷</Button>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-5">
          <div className="space-y-2">
            <span className="block text-sm font-bold text-slate-500">入出庫</span>
            <div className="flex bg-white border border-slate-200 rounded-md p-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-1 rounded-md text-sm ${filterType === 'all' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600'}`}
              >入出庫</button>
              <button
                onClick={() => setFilterType('in')}
                className={`px-4 py-1 rounded-md text-sm ${filterType === 'in' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600'}`}
              >入庫</button>
              <button
                onClick={() => setFilterType('out')}
                className={`px-4 py-1 rounded-md text-sm ${filterType === 'out' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-600'}`}
              >出庫</button>
            </div>
          </div>
          <div className="space-y-2">
            <span className="block text-sm font-bold text-slate-500">棚卸し調整</span>
            <div className="flex bg-white border border-slate-200 rounded-md p-1">
              <button
                onClick={() => setAdjustmentFilter('all')}
                className={`px-3 py-1 rounded-md text-sm ${adjustmentFilter === 'all' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600'}`}
              >全て</button>
              <button
                onClick={() => setAdjustmentFilter('normal')}
                className={`px-3 py-1 rounded-md text-sm ${adjustmentFilter === 'normal' ? 'bg-slate-500 text-white shadow-sm' : 'text-slate-600'}`}
              >通常のみ</button>
              <button
                onClick={() => setAdjustmentFilter('adjustment')}
                className={`px-3 py-1 rounded-md text-sm ${adjustmentFilter === 'adjustment' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-600'}`}
              >調整のみ</button>
            </div>
          </div>
          <div className="space-y-2">
            <span className="block text-sm font-bold text-slate-500">入出庫日</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={movementDateFrom}
                onChange={(event) => setMovementDateFrom(event.target.value)}
                className="w-36 border border-slate-200 rounded-md px-3 py-2"
              />
              <span className="text-slate-400">〜</span>
              <input
                type="date"
                value={movementDateTo}
                onChange={(event) => setMovementDateTo(event.target.value)}
                className="w-36 border border-slate-200 rounded-md px-3 py-2"
              />
              <Button variant="primary" className="h-[42px] px-5" onClick={applyMovementDateFilter}>
                抽出
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-bold text-slate-500">資産を選択して絞り込み</span>
          <div className="flex items-center gap-2">
            <div className="w-80">
              <AssetSearchInput
                assets={assets}
                value={pinnedId}
                onChange={(id) => {
                  setPinnedId(id);
                  setMovementSearchTerm('');
                }}
                isIn={true}
                showListSignal={0}
                resetSignal={assetResetSignal}
                onSearchTermChange={handleSearchTermChange}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setPinnedId('');
                setMovementSearchTerm('');
                setMovementDateFrom('');
                setMovementDateTo('');
                setAppliedDateFrom('');
                setAppliedDateTo('');
                setAssetResetSignal(s => s + 1);
              }}
            >
              リセット
            </Button>
          </div>
        </div>
      </div>

      {pinnedId && (() => {
        const pinnedAsset = assets.find(a => a.id === pinnedId);
        return (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 w-fit">
            <span>絞り込み中: {pinnedAsset?.name || pinnedId}</span>
            <button onClick={() => setPinnedId('')} className="ml-1 text-blue-400 hover:text-blue-700">×</button>
          </div>
        );
      })()}
            <div className="overflow-auto border border-slate-200 rounded-lg flex-1">
        <table className="w-full text-left border-collapse min-w-[1180px] text-sm">
          <thead className="bg-slate-100 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 border-b border-slate-200 w-24">日付</th>
              <th className="px-3 py-2 border-b border-slate-200 w-20">分類</th>
              <th className="px-3 py-2 border-b border-slate-200 w-20">ID</th>
              <th className="px-3 py-2 border-b border-slate-200 w-28">メーカー</th>
              <th className="px-3 py-2 border-b border-slate-200 min-w-[300px]">品名</th>
              <th className="px-2 py-2 border-b border-slate-200 text-right w-16">入庫</th>
              <th className="px-2 py-2 border-b border-slate-200 text-right w-16">出庫</th>
              <th className="px-2 py-2 border-b border-slate-200 text-right w-20 bg-blue-50/70">残在庫</th>
              <th className="px-2 py-2 border-b border-slate-200 text-center w-14">使用単位</th>
              <th className="px-3 py-2 border-b border-slate-200 text-right w-28">実購入価格</th>
              <th className="px-3 py-2 border-b border-slate-200 w-24">使用期限</th>
            </tr>
          </thead>
          <tbody>
            {displayedMovements.map((m, index) => {
              const asset = assets.find(a => a.id === m.assetId);
              const movementType = m.normalizedType;
              const isAdjust = isAdjustmentMovement(m);
              return (
                <tr key={`${filterType}-${m.id || 'movement'}-${movementType}-${m.assetId}-${m.date}-${index}`} className={`cursor-pointer transition-colors border-b border-slate-100 group align-top ${isAdjust ? 'bg-teal-50 hover:bg-teal-100 border-l-4 border-l-teal-400' : 'hover:bg-blue-50'}`} onClick={() => openMovementDetail(m, asset)}>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{m.date}</td>
                  <td className="px-3 py-3 w-20 max-w-20 whitespace-normal break-words">{asset?.category || '-'}</td>
                  <td className="px-3 py-3 font-mono">{m.assetId}</td>
                  <td className="px-3 py-3 w-28 max-w-28 whitespace-normal break-words">{asset?.maker}</td>
                  <td className="px-3 py-3 min-w-[300px] font-medium whitespace-normal break-words text-blue-700">
                    {isAdjust && (
                      <span className="inline-block mr-2 px-2 py-0.5 rounded text-xs font-bold bg-teal-200 text-teal-800">🔧 棚卸調整</span>
                    )}
                    {asset?.name || '-'}
                  </td>
                  <td className={`px-2 py-3 text-right font-bold ${movementType === 'in' ? (isAdjust ? 'text-teal-700' : 'text-emerald-600') : 'text-slate-300'}`}>
                    {movementType === 'in' ? (isAdjust ? `調整+${m.quantity}` : m.quantity) : 0}
                  </td>
                  <td className={`px-2 py-3 text-right font-bold ${movementType === 'out' ? (isAdjust ? 'text-teal-700' : 'text-rose-600') : 'text-slate-300'}`}>
                    {movementType === 'out' ? (isAdjust ? `調整-${m.quantity}` : m.quantity) : 0}
                  </td>
                  {(() => { const rs = runningStockMap.get(String(m.id)); return <td className={`px-2 py-3 text-right font-bold ${rs != null && rs < 0 ? 'bg-red-50 text-red-600' : 'text-slate-700'}`}>{rs == null ? '－' : rs.toLocaleString()}</td>; })()}
                  <td className="px-2 py-3 text-center">{asset?.usageUnit}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {movementType === 'in' ? `¥${m.actualDeliveryPrice.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{m.expirationDate || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showPrintMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-96 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <Printer size={22} className="text-slate-600" />
              <h2 className="text-lg font-black text-slate-800">印刷メニュー</h2>
            </div>
            <button
              onClick={handlePrintList}
              className="w-full text-left rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 p-4 transition-colors"
            >
              <div className="font-bold text-slate-800">📄 一覧印刷</div>
              <div className="text-sm text-slate-500 mt-1">現在の絞り込み結果（{displayedMovements.length}件）を印刷</div>
            </button>
            <button
              onClick={handlePrintIndividual}
              disabled={!pinnedId}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${pinnedId ? 'border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200' : 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'}`}
            >
              <div className="font-bold text-slate-800">📋 個別印刷</div>
              <div className="text-sm text-slate-500 mt-1">
                {pinnedId
                  ? `「${assets.find(a => a.id === pinnedId)?.name || pinnedId}」の入出庫履歴＋サマリーを印刷`
                  : '資産を絞り込み中のみ使用できます'}
              </div>
            </button>
            <Button variant="secondary" className="w-full mt-1" onClick={() => setShowPrintMenu(false)}>キャンセル</Button>
          </div>
        </div>
      )}

      {selectedMovement && movementEditForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b border-slate-100">
              <div>
                <p className="text-xs font-bold text-slate-400">入出庫データ詳細</p>
                <h3 className="mt-1 text-xl font-bold text-slate-800">{selectedMovement.asset?.name || '-'}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedMovement.asset?.maker || '-'}</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <EditableDetail label="資産コード">
                  <div className="mt-1 flex gap-2 items-center">
                    <input
                      type="text"
                      value={editAssetCodeInput}
                      onChange={(e) => setEditAssetCodeInput(e.target.value)}
                      onBlur={() => { if (editAssetCodeInput && editAssetCodeInput !== movementEditForm.assetId) selectEditAssetByCode(); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          selectEditAssetByCode();
                        }
                      }}
                      placeholder="コード"
                      className={`w-20 p-2 text-center rounded border outline-none focus:ring-2 ${
                        movementEditForm.type === 'in' ? 'bg-emerald-50 focus:ring-emerald-200' : 'bg-rose-50 focus:ring-rose-200'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <AssetSearchInput
                        assets={assets}
                        value={movementEditForm.assetId}
                        onChange={(value) => updateMovementEditForm('assetId', value)}
                        isIn={movementEditForm.type === 'in'}
                        showListSignal={0}
                      />
                    </div>
                  </div>
                </EditableDetail>
              </div>
              <EditableDetail label="入出庫日">
                <input
                  type="date"
                  value={movementEditForm.date}
                  onChange={(event) => updateMovementEditForm('date', event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </EditableDetail>
              <EditableDetail label="区分">
                <select
                  value={movementEditForm.type}
                  onChange={(event) => updateMovementEditForm('type', event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="in">入庫</option>
                  <option value="out">出庫</option>
                </select>
              </EditableDetail>
              <DetailItem label="資産コード" value={movementEditForm.assetId || '-'} mono />
              <DetailItem label="分類" value={assets.find(a => a.id === movementEditForm.assetId)?.category || '-'} />
              <EditableDetail label="数量">
                <input
                  type="number"
                  min="1"
                  value={movementEditForm.quantity}
                  onChange={(event) => updateMovementEditForm('quantity', event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-right text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </EditableDetail>
              <DetailItem label="使用単位" value={selectedMovement.asset?.usageUnit || '-'} />
              <EditableDetail label="実購入単価">
                <input
                  type="number"
                  min="0"
                  value={movementEditForm.type === 'in' ? movementEditForm.actualDeliveryPrice : ''}
                  onChange={(event) => updateMovementEditForm('actualDeliveryPrice', event.target.value)}
                  disabled={movementEditForm.type !== 'in'}
                  placeholder={movementEditForm.type === 'in' ? '' : '-'}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-right text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </EditableDetail>
              <EditableDetail label="使用期限">
                <input
                  type="date"
                  value={movementEditForm.expirationDate}
                  onChange={(event) => updateMovementEditForm('expirationDate', event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </EditableDetail>
              <EditableDetail label="ロット番号">
                <input
                  type="text"
                  value={movementEditForm.lotNumber}
                  onChange={(event) => updateMovementEditForm('lotNumber', event.target.value)}
                  placeholder="ロット番号を入力"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </EditableDetail>
              <EditableDetail label="担当者名">
                <select
                  value={movementEditForm.staffId}
                  onChange={(event) => updateMovementEditForm('staffId', event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">未設定</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </EditableDetail>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4 text-sm">
              <EditableDetail label="摘要">
                <textarea
                  value={movementEditForm.memo}
                  onChange={(event) => updateMovementEditForm('memo', event.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="摘要を入力"
                />
              </EditableDetail>
            </div>

            {movementSaveError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {movementSaveError}
              </div>
            )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/50 rounded-b-lg">
              <Button variant="success" onClick={saveMovementDetail} disabled={isMovementSaving}>
                <Save size={18} /> {isMovementSaving ? '保存中...' : '保存'}
              </Button>
              {(() => {
                const isAdjust = isAdjustmentMovement(selectedMovement?.movement);
                return (
                  <Button
                    variant="danger"
                    onClick={handleDeleteMovement}
                    disabled={isMovementSaving || isAdjust}
                    title={isAdjust ? '棚卸し調整の行は棚卸し画面から削除してください' : '削除'}
                  >
                    <Trash2 size={18} /> 削除
                  </Button>
                );
              })()}
              <Button variant="secondary" onClick={closeMovementDetail} disabled={isMovementSaving}>
                閉じる
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <Button variant="secondary" onClick={() => setView('menu')}><X size={18} /> 閉じる</Button>
      </div>

    </Card>
  );
}
