import React, { useMemo, useState } from 'react';
import { Printer, Save, Search, X } from 'lucide-react';

import { Button, Card, DetailItem, EditableDetail } from '../components/ui.jsx';
import AssetSearchInput from './AssetSearchInput.jsx';
import { normalizeMovementType, parseLocalDate } from '../utils/inventory.js';

export default function MovementHistoryScreen({ movements, setView, assets, staff = [], updateMovement, deleteMovement, initialAssetId = '' }) {
  const [filterType, setFilterType] = useState('all');
  const [movementSearchTerm, setMovementSearchTerm] = useState(initialAssetId);
  const [movementDateFrom, setMovementDateFrom] = useState('');
  const [movementDateTo, setMovementDateTo] = useState('');
  const [appliedDateFrom, setAppliedDateFrom] = useState('');
  const [appliedDateTo, setAppliedDateTo] = useState('');
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [movementEditForm, setMovementEditForm] = useState(null);
  const [movementSaveError, setMovementSaveError] = useState('');
  const [isMovementSaving, setIsMovementSaving] = useState(false);

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
      const sorted = [...assetMovements].sort((a, b) => {
        const dateA = Date.parse(String(a.date || '').replaceAll('/', '-')) || 0;
        const dateB = Date.parse(String(b.date || '').replaceAll('/', '-')) || 0;
        if (dateA !== dateB) return dateA - dateB;
        return Number(a.id || 0) - Number(b.id || 0);
      });
      let stock = openingStock;
      sorted.forEach(m => {
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
      if (!appliedFromDate && !appliedToDate) return true;
      const movementDate = parseLocalDate(m.date);
      if (!movementDate) return false;
      if (appliedFromDate && movementDate < appliedFromDate) return false;
      if (appliedToDate && movementDate > appliedToDate) return false;
      return true;
    })
    .filter(m => {
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
      staffId: movement.staffId || '',
      staffName: movement.staffName || '',
      memo: movement.memo || '',
    });
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
        staff_code: staffMember ? Number(staffMember.id) : null,
        staff_name: staffMember?.name || movementEditForm.staffName || null,
        memo: movementEditForm.memo || null,
      });
      const updatedAsset = assets.find((asset) => asset.id === updated.assetId) || selectedMovement.asset;
      setSelectedMovement({ movement: updated, asset: updatedAsset });
      setMovementEditForm({
        date: updated.date || '',
        type: updated.type || 'in',
        quantity: updated.quantity || 0,
        actualDeliveryPrice: updated.actualDeliveryPrice ?? 0,
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
        </div>
        <Button variant="primary" className="mr-8"><Printer size={18} /> 一覧印刷</Button>
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

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={movementSearchTerm}
              onChange={(event) => setMovementSearchTerm(event.target.value)}
              placeholder="ID・品名・メーカーで抽出"
              className="w-64 rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          </div>
        </div>
      </div>

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
              <th className="px-2 py-2 border-b border-slate-200 text-center w-14">単位</th>
              <th className="px-3 py-2 border-b border-slate-200 text-right w-28">実購入価格</th>
              <th className="px-3 py-2 border-b border-slate-200 w-24">使用期限</th>
            </tr>
          </thead>
          <tbody>
            {displayedMovements.map((m, index) => {
              const asset = assets.find(a => a.id === m.assetId);
              const movementType = m.normalizedType;
              if (filterType !== 'all' && movementType !== filterType) return null;
              return (
                <tr key={`${filterType}-${m.id || 'movement'}-${movementType}-${m.assetId}-${m.date}-${index}`} className="cursor-pointer hover:bg-blue-50 transition-colors border-b border-slate-100 group align-top" onClick={() => openMovementDetail(m, asset)}>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{m.date}</td>
                  <td className="px-3 py-3 w-20 max-w-20 whitespace-normal break-words">{asset?.category || '-'}</td>
                  <td className="px-3 py-3 font-mono">{m.assetId}</td>
                  <td className="px-3 py-3 w-28 max-w-28 whitespace-normal break-words">{asset?.maker}</td>
                  <td className="px-3 py-3 min-w-[300px] font-medium whitespace-normal break-words text-blue-700">
                    {asset?.name || '-'}
                  </td>
                  <td className={`px-2 py-3 text-right font-bold ${movementType === 'in' ? 'text-emerald-600' : 'text-slate-300'}`}>
                    {movementType === 'in' ? m.quantity : 0}
                  </td>
                  <td className={`px-2 py-3 text-right font-bold ${movementType === 'out' ? 'text-rose-600' : 'text-slate-300'}`}>
                    {movementType === 'out' ? m.quantity : 0}
                  </td>
                  {(() => { const rs = runningStockMap.get(String(m.id)); return <td className={`px-2 py-3 text-right font-bold ${rs !== undefined && rs < 0 ? 'bg-red-50 text-red-600' : 'text-slate-700'}`}>{rs !== undefined ? rs.toLocaleString() : '-'}</td>; })()}
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

      {selectedMovement && movementEditForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400">入出庫データ詳細</p>
                <h3 className="mt-1 text-xl font-bold text-slate-800">{selectedMovement.asset?.name || '-'}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedMovement.asset?.maker || '-'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <EditableDetail label="品名">
                  <AssetSearchInput
                    assets={assets}
                    value={movementEditForm.assetId}
                    onChange={(value) => updateMovementEditForm('assetId', value)}
                    isIn={movementEditForm.type === 'in'}
                    showListSignal={0}
                  />
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
              <DetailItem label="単位" value={selectedMovement.asset?.usageUnit || '-'} />
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
              <DetailItem label="使用期限" value={selectedMovement.movement.expirationDate || '-'} />
              <DetailItem label="ロット番号" value={selectedMovement.movement.lotNumber || '-'} />
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

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={closeMovementDetail} disabled={isMovementSaving}>
                閉じる
              </Button>
              <Button variant="success" onClick={saveMovementDetail} disabled={isMovementSaving}>
                <Save size={18} /> {isMovementSaving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </Card>
  );
}
