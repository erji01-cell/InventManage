import React, { useEffect, useRef, useState } from 'react';

import { Button, Card, InfoLine } from '../components/ui.jsx';
import AssetSearchInput from './AssetSearchInput.jsx';

export default function EntryScreen({ type, onSave, onCancel, assets, movements = [], staff, setView, initialAssetId = null, savedEntryForm = null, onSaveForm }) {
  const isIn = type === 'in';
  const title = isIn ? '入庫データ入力・修正' : '出庫データ入力・修正';
  const accentColor = isIn ? 'text-emerald-700' : 'text-rose-700';
  const btnVariant = isIn ? 'success' : 'danger';
  // フォーカス時の視認性強化用クラス
  const focusClass = `focus:outline-none focus:ring-4 focus:bg-yellow-50 ${isIn ? 'focus:ring-emerald-300 focus:border-emerald-400' : 'focus:ring-rose-300 focus:border-rose-400'}`;

  const [form, setForm] = useState(() => {
    if (initialAssetId && savedEntryForm) {
      return { ...savedEntryForm, assetId: initialAssetId };
    }
    return {
      staffId: staff[0]?.id || '',
      assetId: initialAssetId || '',
      date: new Date().toISOString().split('T')[0],
      quantity: 0,
      actualDeliveryPrice: 0,
      expirationDate: '',
      lotNumber: '',
      memo: '',
    };
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [assetListSignal, setAssetListSignal] = useState(0);
  const [assetCodeInput, setAssetCodeInput] = useState(initialAssetId || '');
  const staffSelectRef = useRef(null);
  const assetCodeInputRef = useRef(null);
  const assetInputRef = useRef(null);
  const dateInputRef = useRef(null);
  const priceInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  const expirationInputRef = useRef(null);
  const memoInputRef = useRef(null);
  const submitBtnRef = useRef(null);

  // 入出庫画面を開いたとき担当者に自動フォーカス
  useEffect(() => {
    setTimeout(() => staffSelectRef.current?.focus(), 0);
  }, []);

  // form.assetId が外部から変わった場合、コード入力枠にも反映
  useEffect(() => {
    setAssetCodeInput(form.assetId || '');
  }, [form.assetId]);

  const selectAssetByCode = ({ focusDate = false } = {}) => {
    const normalized = String(assetCodeInput).trim();
    if (!normalized) {
      setSaveError('資産コードを入力してください。');
      return;
    }
    const matched = assets.find((a) => String(a.id) === normalized);
    if (!matched) {
      setSaveError(`資産コード ${normalized} は見つかりません。`);
      return;
    }
    setSaveError('');
    setForm((current) => ({ ...current, assetId: matched.id }));
    if (focusDate) {
      setTimeout(() => dateInputRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    if (!form.staffId && staff.length > 0) {
      setForm((current) => ({ ...current, staffId: staff[0].id }));
    }
  }, [form.staffId, staff]);


  const selectedAsset = assets.find(a => a.id === form.assetId);
  // 年度更新でクローズ済みの期間は除外（opening_stock に既に反映済みのため二重計上を防ぐ）
  const closedAt = selectedAsset?.fiscalYearClosedAt || null;
  const isAfterClose = (m) => {
    if (!closedAt) return true;
    if (!m.date) return false;
    return String(m.date).replaceAll('/', '-') > closedAt;
  };
  const selectedAssetMovements = selectedAsset
    ? movements.filter(movement => movement.assetId === selectedAsset.id && isAfterClose(movement))
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
    if (isSaving) return;

    const actualDeliveryPrice = Number(form.actualDeliveryPrice || 0);
    const masterDeliveryPrice = Number(selectedAsset?.deliveryPrice || 0);

    // 必須項目のまとめてチェック
    const missing = [];
    if (!form.assetId) missing.push('資産コード');
    if (!form.date) missing.push(isIn ? '入庫日' : '出庫日');
    if (!form.quantity || Number(form.quantity) <= 0) missing.push(isIn ? '入庫数' : '出庫数');
    if (isIn && (!form.actualDeliveryPrice || actualDeliveryPrice <= 0)) missing.push('実購入価格');
    if (missing.length > 0) {
      setSaveError(`次の項目を入力してください：${missing.join('、')}`);
      return;
    }

    if (actualDeliveryPrice < 0) {
      setSaveError(`${isIn ? '実購入価格' : '評価単価'}は0以上で入力してください。`);
      return;
    }
    if (!isIn && Number(form.quantity) > currentStock) {
      setSaveError(`出庫数が現在庫（${currentStock.toLocaleString()}）を超えています。在庫がマイナスになるため登録できません。`);
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
      // 担当者と入出庫日以外をリセットし、担当者にフォーカスを戻す
      setForm((current) => ({
        ...current,
        assetId: '',
        quantity: 0,
        actualDeliveryPrice: 0,
        expirationDate: '',
        lotNumber: '',
        memo: '',
      }));
      setTimeout(() => staffSelectRef.current?.focus(), 0);
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
            <div className="col-span-2">
              <select
                ref={staffSelectRef}
                className={`w-full p-2 border rounded-md ${focusClass}`}
                value={form.staffId}
                onChange={(e) => setForm({...form, staffId: e.target.value})}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    assetCodeInputRef.current?.focus();
                  }
                }}
              >
                {staff.map(s => <option key={s.id} value={s.id}>{s.id} {s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="font-bold text-slate-700 whitespace-nowrap">資産コード</label>
              <input
                ref={assetCodeInputRef}
                type="text"
                value={assetCodeInput}
                onChange={(e) => setAssetCodeInput(e.target.value)}
                onBlur={() => { if (assetCodeInput && assetCodeInput !== form.assetId) selectAssetByCode(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    selectAssetByCode({ focusDate: true });
                  }
                }}
                placeholder="コード"
                className={`flex-1 min-w-0 p-2 text-center rounded border ${isIn ? 'bg-emerald-50' : 'bg-rose-50'} ${focusClass}`}
              />
            </div>
            <div className="col-span-2 flex gap-2">
              <div className="flex-1 min-w-0">
                <AssetSearchInput
                  assets={assets}
                  value={form.assetId}
                  onChange={(id) => setForm({...form, assetId: id})}
                  isIn={isIn}
                  showListSignal={assetListSignal}
                  inputRef={assetInputRef}
                />
              </div>
              <Button
                variant="action"
                className="whitespace-nowrap"
                onClick={() => { onSaveForm?.(form); setView('assets'); }}
              >
                資産マスタ
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
                ref={dateInputRef}
                type="date"
                className={`flex-1 p-2 border rounded-md ${focusClass}`}
                value={form.date}
                onChange={(e) => setForm({...form, date: e.target.value})}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (isIn) priceInputRef.current?.focus();
                    else quantityInputRef.current?.focus();
                  }
                }}
              />
              <Button onClick={() => {
                const d = form.date ? new Date(form.date) : new Date();
                d.setDate(d.getDate() - 1);
                setForm({...form, date: d.toISOString().split('T')[0]});
              }}>←</Button>
              <Button onClick={() => {
                const d = form.date ? new Date(form.date) : new Date();
                d.setDate(d.getDate() + 1);
                setForm({...form, date: d.toISOString().split('T')[0]});
              }}>→</Button>
              <Button onClick={() => setForm({...form, date: new Date().toISOString().split('T')[0]})}>本日</Button>
            </div>
          </div>

          {isIn && (
            <div className="grid grid-cols-3 items-center gap-4">
              <label className="font-bold text-slate-700">実購入価格</label>
              <div className="col-span-2 flex gap-2 items-center">
                <input
                  ref={priceInputRef}
                  type="number"
                  min="0"
                  className={`flex-1 p-2 border rounded-md bg-emerald-50 text-right ${focusClass}`}
                  value={form.actualDeliveryPrice}
                  onChange={(e) => setForm({...form, actualDeliveryPrice: Number(e.target.value) || 0})}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      quantityInputRef.current?.focus();
                    }
                  }}
                />
                <span className="font-bold text-slate-600">円</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 items-center gap-4">
            <label className="font-bold text-slate-700">{isIn ? '入庫数' : '出庫数'}</label>
            <div className="col-span-2 space-y-1">
              <div className="flex gap-2 items-center">
                <input
                  ref={quantityInputRef}
                  type="number"
                  className={`flex-1 p-2 border rounded-md ${isIn ? 'bg-emerald-50' : 'bg-rose-50'} ${focusClass}`}
                  value={form.quantity}
                  onChange={(e) => setForm({...form, quantity: parseInt(e.target.value) || 0})}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (isIn) expirationInputRef.current?.focus();
                      else memoInputRef.current?.focus();
                    }
                  }}
                />
                <span className="font-bold text-slate-600">{selectedAsset?.usageUnit || '個'}</span>
              </div>
              <p className="text-xs text-rose-500 font-bold">{isIn ? '入庫数' : '出庫数'}は 使用単位 で入力して下さい</p>
              {!isIn && selectedAsset && form.quantity > 0 && (
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold ${(currentStock - form.quantity) < 0 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                  <span>登録後在庫: {(currentStock - form.quantity).toLocaleString()} {selectedAsset.usageUnit}</span>
                  {(currentStock - form.quantity) < 0 && <span>⚠ 在庫がマイナスになります</span>}
                </div>
              )}
            </div>
          </div>

          {isIn && (
            <div className="grid grid-cols-3 items-center gap-4">
              <label className="font-bold text-slate-700">使用期限</label>
              <input
                ref={expirationInputRef}
                type="date"
                className={`col-span-2 p-2 border rounded-md ${focusClass}`}
                value={form.expirationDate}
                onChange={(e) => setForm({...form, expirationDate: e.target.value})}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    memoInputRef.current?.focus();
                  }
                }}
              />
            </div>
          )}

          <div className="grid grid-cols-3 items-start gap-4">
            <label className="font-bold text-slate-700">摘要</label>
            <textarea
              ref={memoInputRef}
              className={`col-span-2 p-2 border rounded-md h-20 ${isIn ? 'bg-emerald-50' : 'bg-rose-50'} ${focusClass}`}
              value={form.memo}
              onChange={(e) => setForm({...form, memo: e.target.value})}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitBtnRef.current?.focus();
                }
              }}
            />
          </div>

          {saveError && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">
              ⚠ {saveError}
            </div>
          )}

          <div className="flex justify-end items-center pt-6 border-t border-slate-100">
            <div className="flex gap-2">
              <Button ref={submitBtnRef} variant={btnVariant} className="px-10" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? '登録中...' : '登録'}
              </Button>
              <Button variant="secondary" onClick={onCancel}>閉じる</Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
