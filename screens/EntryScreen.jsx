import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';

import { Button, Card, InfoLine } from '../components/ui.jsx';
import AssetSearchInput from './AssetSearchInput.jsx';
import { isMovementAfterClose } from '../utils/inventory.js';

const QUICK_COUNT = 8;

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
  const [priceConfirm, setPriceConfirm] = useState(null); // {masterPrice, actualPrice, payload}
  const [assetListSignal, setAssetListSignal] = useState(0);
  const [assetResetSignal, setAssetResetSignal] = useState(0);
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

  const handleAssetReset = () => {
    setForm((current) => ({ ...current, assetId: '' }));
    setAssetCodeInput('');
    setAssetResetSignal((s) => s + 1);
    setSaveError('');
    setTimeout(() => assetCodeInputRef.current?.focus(), 0);
  };

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
  const selectedAssetMovements = selectedAsset
    ? movements.filter(movement => movement.assetId === selectedAsset.id && isMovementAfterClose(movement.date, closedAt))
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

  // 過去の実購入価格の「変化」を直近3回分まで取得（同じ価格が続いた分はスキップ）
  const priceHistory = (() => {
    if (!selectedAsset) return [];
    const inbounds = selectedAssetMovements
      .filter((m) => m.type === 'in' && Number(m.actualDeliveryPrice) > 0)
      .slice() // movements は date desc で渡されるが念のためコピー
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const history = [];
    let lastPrice = null;
    for (const m of inbounds) {
      const p = Number(m.actualDeliveryPrice);
      if (p !== lastPrice) {
        history.push({ price: p, date: m.date });
        lastPrice = p;
        if (history.length >= 3) break;
      }
    }
    return history;
  })();

  // クイック選択: よく使う（過去3ヶ月）。入庫画面は入庫履歴、出庫画面は出庫履歴ベース。
  const quickType = isIn ? 'in' : 'out';

  const frequentAssets = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    const threeMonthsAgo = d.toISOString().slice(0, 10);
    const counts = new Map();
    for (const m of movements) {
      if (m.type !== quickType) continue;
      if ((m.date || '').slice(0, 10) < threeMonthsAgo) continue;
      counts.set(m.assetId, (counts.get(m.assetId) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, QUICK_COUNT)
      .map(([id, count]) => ({ asset: assets.find((a) => a.id === id), count }))
      .filter((x) => x.asset);
  }, [movements, assets, quickType]);

  const pickQuickAsset = (asset) => {
    setForm((current) => ({ ...current, assetId: asset.id }));
    setSaveError('');
  };

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
    const payload = {
      ...form,
      actualDeliveryPrice,
      type,
      staffName: staff.find(s => s.id === form.staffId)?.name || '不明'
    };

    // 入庫かつマスタ価格と実購入価格が異なる場合、確認モーダルを表示
    if (isIn && actualDeliveryPrice !== masterDeliveryPrice) {
      setPriceConfirm({
        masterPrice: masterDeliveryPrice,
        actualPrice: actualDeliveryPrice,
        payload,
      });
      return; // モーダルの選択結果で proceedSave が呼ばれる
    }

    await proceedSave({ ...payload, updateMasterDeliveryPrice: false });
  };

  const proceedSave = async (payload) => {
    setIsSaving(true);
    setSaveError('');
    try {
      await onSave(payload);
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
      <Card className={`max-w-[calc(64rem_+_1cm)] w-full border-t-8 ${isIn ? 'border-t-emerald-500' : 'border-t-rose-500'}`}>
        <div className="mb-5">
          <h2 className={`text-2xl font-black ${accentColor}`}>{title}</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
          {/* 左カラム: 資産の特定 */}
          <div className="space-y-4">
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
                inputMode="numeric"
                value={assetCodeInput}
                onChange={(e) => {
                  // 全角数字→半角に変換し、数字以外は除去
                  const digitsOnly = e.target.value
                    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
                    .replace(/[^0-9]/g, '');
                  setAssetCodeInput(digitsOnly);
                }}
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
            <div className="col-span-2 min-w-0">
              <AssetSearchInput
                assets={assets}
                value={form.assetId}
                onChange={(id) => setForm({...form, assetId: id})}
                isIn={isIn}
                showListSignal={assetListSignal}
                resetSignal={assetResetSignal}
                inputRef={assetInputRef}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            <div></div>
            <div className="col-span-2 flex justify-end gap-2">
              <Button
                variant="action"
                className="whitespace-nowrap"
                onClick={() => { onSaveForm?.(form); setView('assets'); }}
              >
                資産マスタ
              </Button>
              <Button
                variant="secondary"
                className="whitespace-nowrap"
                onClick={handleAssetReset}
              >
                リセット
              </Button>
            </div>
          </div>

          {frequentAssets.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                <Star size={13} /> よく使う（過去3ヶ月）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {frequentAssets.map(({ asset, count }) => (
                  <QuickChip key={`f-${asset.id}`} asset={asset} isIn={isIn} selected={asset.id === form.assetId} badge={count} onClick={() => pickQuickAsset(asset)} />
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="grid grid-cols-2 gap-x-5 gap-y-2">
              <InfoLine label="メーカー" value={selectedAsset?.maker || '-'} />
              <InfoLine label="分類" value={selectedAsset?.parentCategory || '-'} />
              <InfoLine label="品名" value={selectedAsset?.name || '-'} className="col-span-2" strong />
              <InfoLine label="取引先" value={selectedAsset?.supplier || '-'} />
              <InfoLine label="現在庫" value={`${selectedAsset ? currentStock.toLocaleString() : '-'} ${selectedAsset?.usageUnit || ''}`} valueClassName={`font-bold ${currentStock <= 0 ? 'text-rose-600' : 'text-slate-700'}`} />
              <InfoLine label="購入" value={`¥${(selectedAsset?.deliveryPrice || 0).toLocaleString()} / ${selectedAsset?.purchaseUnit || '-'}`} />
              <InfoLine label="入数" value={`${(selectedAsset?.packSize || 0).toLocaleString()} ${selectedAsset?.usageUnit || ''}`} />
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-300 px-2 py-1">
                <span className="text-xs font-bold text-blue-700 whitespace-nowrap">受払単位</span>
                <span className="text-base font-black text-blue-800 whitespace-nowrap">{selectedAsset?.usageUnit || '-'}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-300 px-2 py-1">
                <span className="text-xs font-bold text-blue-700 whitespace-nowrap">受払単価</span>
                <span className="text-base font-black text-blue-800 whitespace-nowrap">
                  ¥{(selectedAsset?.usageUnitPrice || 0).toLocaleString()} <span className="text-sm font-bold">/ {selectedAsset?.usageUnit || '-'}</span>
                </span>
              </div>
            </div>
            {isIn && priceHistory.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <div className="text-xs font-bold text-slate-500 mb-1">過去の実購入価格（直近3回分の変化）</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {priceHistory.map((h, i) => (
                    <span key={i} className="inline-flex items-baseline gap-1">
                      <span className={`font-bold ${i === 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                        ¥{h.price.toLocaleString()}
                      </span>
                      <span className="text-slate-400">（{h.date}）</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
          {/* 右カラム: 入力内容 */}
          <div className="flex flex-col space-y-4">
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
              <Button className="px-2 py-1 text-sm whitespace-nowrap" onClick={() => setForm({...form, date: new Date().toISOString().split('T')[0]})}>本日</Button>
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
              <div className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <input
                    ref={quantityInputRef}
                    type="number"
                    className={`w-full p-2 border rounded-md ${isIn ? 'bg-emerald-50' : 'bg-rose-50'} ${focusClass}`}
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
                  <p className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-300 rounded px-2 py-1">{isIn ? '入庫数' : '出庫数'}は <span className="underline">受払単位</span> で入力して下さい</p>
                </div>
                <span className="font-bold text-slate-600 mt-2">{selectedAsset?.usageUnit || '個'}</span>
              </div>
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

          <div className="mt-auto flex justify-end items-center pt-6 border-t border-slate-100">
            <div className="flex gap-2">
              <Button ref={submitBtnRef} variant={btnVariant} className="px-10" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? '登録中...' : '登録'}
              </Button>
              <Button variant="secondary" onClick={onCancel}>閉じる</Button>
            </div>
          </div>
          </div>
          </div>
        </form>
      </Card>

      {priceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-[28rem] flex flex-col gap-5">
            <h2 className="text-lg font-black text-slate-800">マスタ購入価格の更新確認</h2>
            <div className="text-sm text-slate-700 leading-relaxed">
              実購入価格がマスタ購入価格と異なります。
              <div className="mt-3 grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-500">マスタ購入価格</div>
                <div className="text-right font-bold">¥{priceConfirm.masterPrice.toLocaleString()}</div>
                <div className="text-slate-500">実購入価格</div>
                <div className="text-right font-bold text-emerald-700">¥{priceConfirm.actualPrice.toLocaleString()}</div>
              </div>
              <p className="mt-3 font-bold">マスタ購入価格を更新しますか？</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="success" className="w-full" onClick={() => {
                const p = priceConfirm.payload;
                setPriceConfirm(null);
                proceedSave({ ...p, updateMasterDeliveryPrice: true });
              }}>
                更新する
              </Button>
              <Button variant="primary" className="w-full" onClick={() => {
                const p = priceConfirm.payload;
                setPriceConfirm(null);
                proceedSave({ ...p, updateMasterDeliveryPrice: false });
              }}>
                今回だけ保存（マスタ価格を更新しない）
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => setPriceConfirm(null)}>
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickChip({ asset, isIn, selected, badge, onClick }) {
  const selectedClass = isIn
    ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
    : 'bg-rose-100 border-rose-400 text-rose-800';
  const baseClass = 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100';
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${asset.id} ${asset.name}${asset.maker ? ' / ' + asset.maker : ''}`}
      className={`max-w-[180px] truncate rounded border px-2 py-1 text-xs font-medium transition-colors ${selected ? selectedClass : baseClass}`}
    >
      {asset.name}
      {badge ? <span className="ml-1 text-[10px] text-slate-400">×{badge}</span> : null}
    </button>
  );
}
