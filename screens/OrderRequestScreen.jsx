import React, { useEffect, useMemo, useState } from 'react';
import { Check, MailWarning, Plus, Printer, RotateCcw, Send, ShoppingCart, Trash2, X } from 'lucide-react';

import { Button, Card } from '../components/ui.jsx';
import AssetSearchInput from './AssetSearchInput.jsx';

function toLocalDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  const key = toLocalDateKey(value);
  return key ? key.replaceAll('-', '/') : '-';
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default function OrderRequestScreen({
  assets,
  orders,
  setView,
  onCreate,
  onUpdateStatus,
  onRetryEmail,
}) {
  const [assetId, setAssetId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [memo, setMemo] = useState('');
  const [draftItems, setDraftItems] = useState([]);
  const [filter, setFilter] = useState('requested');
  const [printDate, setPrintDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedAsset = assets.find((asset) => asset.id === assetId);
  const filteredOrders = useMemo(() => {
    const rows = filter === 'requested'
      ? orders.filter((order) => order.status === 'requested')
      : orders.filter((order) => order.status !== 'requested');
    return [...rows].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [filter, orders]);

  const groups = useMemo(() => {
    const map = new Map();
    filteredOrders.forEach((order) => {
      const supplier = order.supplierName || '発注先未設定';
      if (!map.has(supplier)) map.set(supplier, []);
      map.get(supplier).push(order);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'ja'));
  }, [filteredOrders]);

  const printDateOptions = useMemo(() => {
    const counts = new Map();
    filteredOrders.forEach((order) => {
      const dateKey = toLocalDateKey(order.requestedAt);
      if (dateKey) counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
    });
    return [...counts.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([value, count]) => ({ value, count }));
  }, [filteredOrders]);

  useEffect(() => {
    if (!printDateOptions.some((option) => option.value === printDate)) {
      setPrintDate(printDateOptions[0]?.value || '');
    }
  }, [printDate, printDateOptions]);

  const addDraftItem = () => {
    setError('');
    setMessage('');
    if (!selectedAsset) {
      setError('発注する資産を選択してください。');
      return;
    }
    const orderQuantity = Number(quantity);
    if (!Number.isInteger(orderQuantity) || orderQuantity <= 0) {
      setError('発注個数は1以上の整数で入力してください。');
      return;
    }

    setDraftItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.asset.id === selectedAsset.id);
      if (existingIndex < 0) {
        return [...prev, { asset: selectedAsset, quantity: orderQuantity, memo: memo.trim() }];
      }
      return prev.map((item, index) => index === existingIndex
        ? {
          ...item,
          quantity: item.quantity + orderQuantity,
          memo: memo.trim() || item.memo,
        }
        : item);
    });
    setAssetId('');
    setQuantity('1');
    setMemo('');
    setMessage(`${selectedAsset.name}を発注リストに追加しました。`);
  };

  const removeDraftItem = (assetIdToRemove) => {
    setDraftItems((prev) => prev.filter((item) => item.asset.id !== assetIdToRemove));
    setMessage('');
    setError('');
  };

  const handleCreate = async () => {
    setError('');
    setMessage('');
    if (draftItems.length === 0) {
      setError('発注リストに商品を追加してください。');
      return;
    }

    setIsSaving(true);
    try {
      const itemCount = draftItems.length;
      const result = await onCreate(draftItems);
      setDraftItems([]);
      setMessage(result?.emailWarning
        ? `${itemCount}商品を登録しました。${result.emailWarning}`
        : `${itemCount}商品を登録し、メール通知を1通送信しました。`);
      setFilter('requested');
    } catch (err) {
      setError(err?.message || '発注をまとめて登録できませんでした。');
    } finally {
      setIsSaving(false);
    }
  };

  const changeStatus = async (order, status) => {
    setBusyOrderId(order.id);
    setError('');
    setMessage('');
    try {
      await onUpdateStatus(order.id, status);
      setMessage(status === 'completed' ? '発注を完了にしました。' : status === 'cancelled' ? '発注を取り消しました。' : '未完了に戻しました。');
    } catch (err) {
      setError(err?.message || '発注状態を更新できませんでした。');
    } finally {
      setBusyOrderId('');
    }
  };

  const retryEmail = async (order) => {
    setBusyOrderId(order.id);
    setError('');
    setMessage('');
    try {
      await onRetryEmail(order);
      setMessage('メール通知を再送しました。');
    } catch (err) {
      setError(err?.message || 'メール通知を再送できませんでした。');
    } finally {
      setBusyOrderId('');
    }
  };

  const printOrdersByDate = () => {
    setError('');
    setMessage('');
    const rows = filteredOrders
      .filter((order) => toLocalDateKey(order.requestedAt) === printDate)
      .sort((a, b) => {
        const supplierCompare = (a.supplierName || '発注先未設定').localeCompare(b.supplierName || '発注先未設定', 'ja');
        return supplierCompare || a.assetName.localeCompare(b.assetName, 'ja');
      });
    if (!printDate || rows.length === 0) {
      setError('印刷する登録日の発注データがありません。');
      return;
    }

    const statusLabel = filter === 'requested' ? '未完了' : '完了・取消';
    const printedAt = new Date().toLocaleString('ja-JP');
    const tableRows = rows.map((order) => {
      const orderStatus = order.status === 'completed' ? '完了' : order.status === 'cancelled' ? '取消' : '未完了';
      return `<tr>
        <td>${escapeHtml(order.supplierName || '発注先未設定')}</td>
        <td>${escapeHtml(order.assetName)}<div class="sub">ID: ${escapeHtml(order.assetId)}</div></td>
        <td class="number">${Number(order.quantity).toLocaleString('ja-JP')} ${escapeHtml(order.purchaseUnit || '')}</td>
        <td>${escapeHtml(order.memo || '-')}</td>
        <td>${escapeHtml(order.requestedBy || '-')}</td>
        <td>${orderStatus}</td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>発注一覧 ${escapeHtml(printDate)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: "Yu Gothic", "Meiryo", sans-serif; color: #1e293b; margin: 0; }
  h1 { margin: 0 0 6px; font-size: 20pt; }
  .meta { margin-bottom: 16px; color: #64748b; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9pt; }
  th { background: #fef3c7; color: #78350f; text-align: left; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 8px; vertical-align: top; overflow-wrap: anywhere; }
  th:nth-child(1) { width: 15%; } th:nth-child(2) { width: 27%; } th:nth-child(3) { width: 11%; }
  th:nth-child(4) { width: 23%; } th:nth-child(5) { width: 17%; } th:nth-child(6) { width: 7%; }
  .number { text-align: right; font-weight: bold; white-space: nowrap; }
  .sub { margin-top: 2px; color: #64748b; font-size: 8pt; }
</style></head><body>
  <h1>発注一覧</h1>
  <div class="meta">登録日: ${escapeHtml(printDate.replaceAll('-', '/'))}　状態: ${statusLabel}　件数: ${rows.length}件　印刷日時: ${escapeHtml(printedAt)}</div>
  <table><thead><tr><th>発注先</th><th>資産</th><th>発注個数</th><th>摘要</th><th>登録者</th><th>状態</th></tr></thead>
  <tbody>${tableRows}</tbody></table>
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`;
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      setError('印刷画面を開けませんでした。ブラウザのポップアップを許可してください。');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <Card className="mx-auto w-full max-w-6xl border-slate-200 p-0 shadow-xl">
      <header className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black tracking-[0.18em] text-amber-600">ORDER REQUEST</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900">
            <ShoppingCart size={24} className="text-amber-600" />
            発注一覧
          </h1>
        </div>
      </header>

      <div className="space-y-6 p-6">
        <section className="rounded-md border border-amber-200 bg-amber-50/50 p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_130px_minmax(220px,0.7fr)_auto] lg:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">発注する資産</span>
              <AssetSearchInput assets={assets} value={assetId} onChange={setAssetId} isIn showListSignal={0} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">発注個数</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-right font-bold outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
                <span className="min-w-8 text-sm font-bold text-slate-600">{selectedAsset?.purchaseUnit || '個'}</span>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">摘要</span>
              <input
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="必要に応じて入力"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </label>
            <Button variant="stock" className="h-[42px] whitespace-nowrap px-5" onClick={addDraftItem} disabled={isSaving}>
              <Plus size={18} />
              リストに追加
            </Button>
          </div>
          {selectedAsset && (
            <p className="mt-3 text-xs font-bold text-slate-500">
              発注先: <span className="text-slate-800">{selectedAsset.supplier || '未設定'}</span>
              <span className="mx-2 text-slate-300">|</span>
              ID: {selectedAsset.id} / {selectedAsset.maker}
            </p>
          )}
        </section>

        {draftItems.length > 0 && (
          <section className="overflow-hidden rounded-md border border-amber-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-black text-slate-800">今回の発注リスト</h2>
                <p className="mt-0.5 text-xs font-bold text-slate-500">{draftItems.length}商品を1通のメールにまとめます</p>
              </div>
              <Button variant="stock" className="whitespace-nowrap px-5" onClick={handleCreate} disabled={isSaving}>
                <Send size={18} />
                {isSaving ? '登録・送信中...' : 'まとめて登録・メール送信'}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">発注先</th>
                    <th className="px-4 py-2 text-left">資産</th>
                    <th className="px-4 py-2 text-right">発注個数</th>
                    <th className="px-4 py-2 text-left">摘要</th>
                    <th className="w-14 px-3 py-2"><span className="sr-only">削除</span></th>
                  </tr>
                </thead>
                <tbody>
                  {draftItems.map((item) => (
                    <tr key={item.asset.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-bold text-slate-700">{item.asset.supplier || '発注先未設定'}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{item.asset.name}</div>
                        <div className="text-xs text-slate-400">ID: {item.asset.id}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-base font-black text-amber-700">
                        {item.quantity.toLocaleString()} {item.asset.purchaseUnit}
                      </td>
                      <td className="max-w-64 px-4 py-3 text-slate-600">{item.memo || '-'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeDraftItem(item.asset.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="発注リストから削除"
                          aria-label={`${item.asset.name}を発注リストから削除`}
                          disabled={isSaving}
                        >
                          <Trash2 size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(message || error) && (
          <div className={`rounded-md border px-4 py-3 text-sm font-bold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {error || message}
          </div>
        )}

        <section>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setFilter('requested')}
                className={`rounded px-4 py-2 text-sm font-bold ${filter === 'requested' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}
              >
                未完了 {orders.filter((order) => order.status === 'requested').length}
              </button>
              <button
                onClick={() => setFilter('closed')}
                className={`rounded px-4 py-2 text-sm font-bold ${filter === 'closed' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}
              >
                完了・取消
              </button>
            </div>
            <div className="flex flex-wrap items-end justify-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">印刷する登録日</span>
                <select
                  value={printDate}
                  onChange={(event) => setPrintDate(event.target.value)}
                  className="h-10 min-w-48 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  disabled={printDateOptions.length === 0}
                >
                  {printDateOptions.length === 0 && <option value="">登録データなし</option>}
                  {printDateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value.replaceAll('-', '/')}（{option.count}件）
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="print" className="h-10 whitespace-nowrap px-4" onClick={printOrdersByDate} disabled={!printDate}>
                <Printer size={17} /> 登録日別印刷
              </Button>
            </div>
          </div>

          {groups.length === 0 && (
            <div className="py-16 text-center text-sm font-bold text-slate-400">
              {filter === 'requested' ? '未完了の発注はありません。' : '完了・取消の発注はありません。'}
            </div>
          )}

          <div className="space-y-5">
            {groups.map(([supplierName, supplierOrders]) => (
              <div key={supplierName} className="overflow-hidden rounded-md border border-slate-200">
                <div className="flex items-center justify-between bg-slate-100 px-4 py-2.5">
                  <h2 className="font-black text-slate-800">{supplierName}</h2>
                  <span className="text-xs font-bold text-slate-500">{supplierOrders.length}件</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="border-b border-slate-200 bg-white text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left">資産</th>
                        <th className="px-4 py-2 text-right">発注個数</th>
                        <th className="px-4 py-2 text-left">摘要</th>
                        <th className="px-4 py-2 text-left">登録日</th>
                        <th className="px-4 py-2 text-left">登録者</th>
                        <th className="px-4 py-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierOrders.map((order) => (
                        <tr key={order.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800">{order.assetName}</div>
                            <div className="text-xs text-slate-400">ID: {order.assetId}</div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-base font-black text-amber-700">
                            {order.quantity.toLocaleString()} {order.purchaseUnit}
                          </td>
                          <td className="max-w-64 px-4 py-3 text-slate-600">{order.memo || '-'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            <div className="font-bold">{formatDate(order.requestedAt)}</div>
                            <div className="text-xs text-slate-400">{formatTime(order.requestedAt)}</div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                            <div>{order.requestedBy || '-'}</div>
                            {!order.emailSentAt && (
                              <span className="mt-1 inline-flex items-center gap-1 font-bold text-red-600"><MailWarning size={13} />メール未送信</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {!order.emailSentAt && (
                                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => retryEmail(order)} disabled={busyOrderId === order.id}>
                                  <Send size={14} /> 再送
                                </Button>
                              )}
                              {order.status === 'requested' ? (
                                <>
                                  <Button variant="success" className="px-3 py-1.5 text-xs" onClick={() => changeStatus(order, 'completed')} disabled={busyOrderId === order.id}>
                                    <Check size={14} /> 完了
                                  </Button>
                                  <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => changeStatus(order, 'cancelled')} disabled={busyOrderId === order.id}>
                                    <X size={14} /> 取消
                                  </Button>
                                </>
                              ) : (
                                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => changeStatus(order, 'requested')} disabled={busyOrderId === order.id}>
                                  <RotateCcw size={14} /> 未完了に戻す
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={() => setView('menu')}>
            <X size={18} /> 閉じる
          </Button>
        </div>
      </div>
    </Card>
  );
}
