import React, { useEffect, useRef, useState } from 'react';

import { Button, Card, InfoLine } from '../components/ui.jsx';
import AssetSearchInput from './AssetSearchInput.jsx';

export default function EntryScreen({ type, onSave, onCancel, assets, movements = [], staff }) {
  const isIn = type === 'in';
  const title = isIn ? '入庫データ入力・修正' : '出庫データ入力・修正';
  const accentColor = isIn ? 'text-emerald-700' : 'text-rose-700';
  const btnVariant = isIn ? 'success' : 'danger';

  const [form, setForm] = useState({
    staffId: '',
    assetId: '',
    date: new Date().toISOString().split('T')[0],
    quantity: 0,
    actualDeliveryPrice: 0,
    expirationDate: '',
    lotNumber: '',
    memo: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [assetListSignal, setAssetListSignal] = useState(0);
  const [staffCodeInput, setStaffCodeInput] = useState('');
  const assetInputRef = useRef(null);

  useEffect(() => {
    setStaffCodeInput(form.staffId || '');
  }, [form.staffId]);

  const selectStaffByCode = ({ focusAsset = false } = {}) => {
    const normalizedCode = staffCodeInput.trim();
    if (!normalizedCode) {
      setForm((current) => ({ ...current, staffId: '' }));
      return;
    }
    const selectedStaff = staff.find((member) => String(member.id) === normalizedCode);
    if (!selectedStaff) {
      setSaveError(`担当者番号 ${normalizedCode} は見つかりません。`);
      return;
    }
    setSaveError('');
    setForm((current) => ({ ...current, staffId: String(selectedStaff.id) }));
    if (focusAsset) {
      window.setTimeout(() => assetInputRef.current?.focus(), 0);
    }
  };


  const selectedAsset = assets.find(a => a.id === form.assetId);
  const selectedAssetMovements = selectedAsset
    ? movements.filter(movement => movement.assetId === selectedAsset.id)
    : [];
  const inboundTotal = selectedAssetMovements
    .filter(movement => movement.type === 'in')
    .reduce((sum, movement) => sum + movement.quantity, 0);
  const outboundTotal = selectedAssetMovements
    .filter(movement => movement.type === 'out')
    .reduce((sum, movement) => sum + movement.quantity, 0);
  const currentStock = selectedAsset
    ? selectedAsset.openingStock + inboundTotal - outboundTotal
    : 0;

  useEffect(() => {
    if (!selectedAsset) return;
    setForm((current) => ({
      ...current,
      actualDeliveryPrice: selectedAsset.deliveryPrice || 0,
    }));
  }, [selectedAsset?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.assetId || form.quantity <= 0 || isSaving) return;
    const actualDeliveryPrice = Number(form.actualDeliveryPrice || 0);
    const masterDeliveryPrice = Number(selectedAsset?.deliveryPrice || 0);
    if (actualDeliveryPrice < 0) {
      setSaveError(`${isIn ? '実購入価格' : '評価単価'}は0以上で入力してください。`);
      return;
    }
    if (!isIn && Number(form.quantity) > currentStock) {
      setSaveError('出庫数が現在庫を超えています。');
      return;
    }
    const updateMasterDeliveryPrice = isIn && actualDeliveryPrice !== masterDeliveryPrice
      ? window.confirm(
          `実購入価格がマスタ購入価格と異なります。\n\n` +
          `マスタ購入価格: ¥${masterDeliveryPrice.toLocaleString()}\n` +
          `実購入価格: ¥${actualDeliveryPrice.toLocaleString()}\n\n` +
          `マスタ購入価格を更新しますか？\n\n` +
          `OK: 更新する / キャンセル: 今回だけ保存`
        )
      : false;

    setIsSaving(true);
    setSaveError('');

    try {
      await onSave({
        ...form,
        actualDeliveryPrice,
        updateMasterDeliveryPrice,
        type,
        staffName: staff.find(s => s.id === form.staffId)?.name || '不明'
      });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <Card className={`max-w-2xl w-full border-t-8 ${isIn ? 'border-t-emerald-500' : 'border-t-rose-500'}`}>
        <div className="text-center mb-8">
          <h2 className={`text-3xl font-black ${accentColor}`}>{title}</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-3 items-center gap-4">
            <label className="font-bold text-slate-700">担当者</label>
            <div className="col-span-2 flex gap-2">
              <input
                value={staffCodeInput}
                onChange={(e) => setStaffCodeInput(e.target.value)}
                onBlur={() => selectStaffByCode()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    selectStaffByCode({ focusAsset: true });
                  }
                }}
                placeholder="コード"
                className={`w-16 p-2 text-center rounded border outline-none focus:ring-2 ${
                  isIn ? 'bg-emerald-50 focus:ring-emerald-200' : 'bg-rose-50 focus:ring-rose-200'
                }`}
              />
              <select
                className={`flex-1 p-2 border rounded-md outline-none focus:ring-2 ${isIn ? 'focus:ring-emerald-500' : 'focus:ring-rose-500'}`}
                value={form.staffId}
                onChange={(e) => setForm({...form, staffId: e.target.value})}
              >
                <option value="">-- 担当者を選択 --</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.id} {s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            <label className="font-bold text-slate-700">資産コード</label>
            <div className="col-span-2 flex gap-2">
              <AssetSearchInput 
                assets={assets} 
                value={form.assetId} 
                onChange={(id) => setForm({...form, assetId: id})}
                isIn={isIn}
                showListSignal={assetListSignal}
                inputRef={assetInputRef}
              />
              <Button
                variant="action"
                className="whitespace-nowrap"
                onClick={() => setAssetListSignal((value) => value + 1)}
              >
                資産一覧/選択
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="grid grid-cols-2 gap-x-5 gap-y-2">
              <InfoLine label="メーカー" value={selectedAsset?.maker || '-'} />
              <InfoLine label="分類" value={selectedAsset?.parentCategory || '-'} />
              <InfoLine label="品名" value={selectedAsset?.name || '-'} className="col-span-2" strong />
              <InfoLine label="取引先" value={selectedAsset?.supplier || '-'} />
              <InfoLine label="現在庫" value={`${selectedAsset ? currentStock.toLocaleString() : '-'} ${selectedAsset?.usageUnit || ''}`} valueClassName={`font-bold ${currentStock <= 0 ? 'text-rose-600' : 'text-slate-700'}`} />
              <InfoLine label="購入" value={`¥${(selectedAsset?.deliveryPrice || 0).toLocaleString()} / ${selectedAsset?.purchaseUnit || '-'}`} />
              <InfoLine label="使用" value={`¥${(selectedAsset?.usageUnitPrice || 0).toLocaleString()} / ${selectedAsset?.usageUnit || '-'}`} />
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            <label className="font-bold text-slate-700">{isIn ? '入庫日' : '出庫日'}</label>
            <div className="col-span-2 flex gap-2 items-center">
              <input 
                type="date" 
                className="flex-1 p-2 border rounded-md"
                value={form.date}
                onChange={(e) => setForm({...form, date: e.target.value})}
              />
              <Button onClick={() => setForm({...form, date: new Date().toISOString().split('T')[0]})}>本日</Button>
            </div>
          </div>

          {isIn && (
            <>
              <div className="grid grid-cols-3 items-center gap-4">
                <label className="font-bold text-slate-700">実購入価格</label>
                <div className="col-span-2 flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    className="flex-1 p-2 border rounded-md bg-emerald-50 text-right"
                    value={form.actualDeliveryPrice}
                    onChange={(e) => setForm({...form, actualDeliveryPrice: Number(e.target.value) || 0})}
                  />
                  <span className="font-bold text-slate-600">円</span>
                </div>
              </div>

              <div className="grid grid-cols-3 items-center gap-4">
                <label className="font-bold text-slate-700">使用期限</label>
                <input
                  type="date"
                  className="col-span-2 p-2 border rounded-md"
                  value={form.expirationDate}
                  onChange={(e) => setForm({...form, expirationDate: e.target.value})}
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-3 items-center gap-4">
            <label className="font-bold text-slate-700">{isIn ? '入庫数' : '出庫数'}</label>
            <div className="col-span-2 space-y-1">
              <div className="flex gap-2 items-center">
                <input 
                  type="number" 
                  className={`flex-1 p-2 border rounded-md ${isIn ? 'bg-emerald-50' : 'bg-rose-50'}`}
                  value={form.quantity}
                  onChange={(e) => setForm({...form, quantity: parseInt(e.target.value) || 0})}
                />
                <span className="font-bold text-slate-600">{selectedAsset?.usageUnit || '個'}</span>
              </div>
              <p className="text-xs text-rose-500 font-bold">{isIn ? '入庫数' : '出庫数'}は 使用単位 で入力して下さい</p>
            </div>
          </div>

          <div className="grid grid-cols-3 items-start gap-4">
            <label className="font-bold text-slate-700">摘要</label>
            <textarea 
              className={`col-span-2 p-2 border rounded-md h-20 ${isIn ? 'bg-emerald-50' : 'bg-rose-50'}`}
              value={form.memo}
              onChange={(e) => setForm({...form, memo: e.target.value})}
            />
          </div>

          <div className="flex justify-end items-center pt-6 border-t border-slate-100">
            <div className="flex gap-2">
              <Button variant={btnVariant} className="px-10" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? '登録中...' : '登録'}
              </Button>
              <Button variant="secondary" onClick={onCancel}>閉じる</Button>
            </div>
          </div>
          {saveError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
