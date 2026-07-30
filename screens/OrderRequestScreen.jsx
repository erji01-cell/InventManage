import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MailWarning, Plus, Printer, RotateCcw, Send, ShoppingCart, Trash2, X } from 'lucide-react';

import { Button, Card } from '../components/ui.jsx';
import StaffSelect from '../components/StaffSelect.jsx';
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

export default function OrderRequestScreen({
  assets,
  staff = [],
  orders,
  setView,
  onCreate,
  onUpdateStatus,
  onDelete,
  onRetryEmail,
}) {
  const [assetId, setAssetId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [memo, setMemo] = useState('');
  const [draftItems, setDraftItems] = useState([]);
  const [filter, setFilter] = useState('requested');
  const [printDate, setPrintDate] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printError, setPrintError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const printContentRef = useRef(null);

  const selectedAsset = assets.find((asset) => asset.id === assetId);
  const selectedStaff = staff.find((member) => String(member.id) === String(staffId));
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

  const printRows = useMemo(() => filteredOrders
    .filter((order) => toLocalDateKey(order.requestedAt) === printDate)
    .sort((a, b) => {
      const supplierCompare = (a.supplierName || '発注先未設定').localeCompare(b.supplierName || '発注先未設定', 'ja');
      return supplierCompare || a.assetName.localeCompare(b.assetName, 'ja');
    }), [filteredOrders, printDate]);

  const printStatusLabel = filter === 'requested' ? '未完了' : '完了・取消';

  const addDraftItem = () => {
    setError('');
    setMessage('');
    if (!selectedStaff) {
      setError('担当者を選択してください。');
      return;
    }
    if (!selectedAsset) {
      setError('発注する資産を選択してください。');
      return;
    }
    const orderQuantity = Number(quantity);
    if (!Number.isInteger(orderQuantity) || orderQuantity <= 0) {
      setError('発注個数は1以上の整数で入力してください。');
      return;
    }

    const draftKey = `${selectedAsset.id}:${selectedStaff.id}`;
    setDraftItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.key === draftKey);
      if (existingIndex < 0) {
        return [...prev, {
          key: draftKey,
          asset: selectedAsset,
          quantity: orderQuantity,
          memo: memo.trim(),
          requestedBy: selectedStaff.name,
        }];
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

  const removeDraftItem = (draftKey) => {
    setDraftItems((prev) => prev.filter((item) => item.key !== draftKey));
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

  const deleteOrder = async (order) => {
    const confirmed = window.confirm(
      `「${order.assetName}」の発注を本当に削除しますか？\n削除したデータは元に戻せません。`
    );
    if (!confirmed) return;

    setBusyOrderId(order.id);
    setError('');
    setMessage('');
    try {
      await onDelete(order.id);
      setMessage('発注データを削除しました。');
    } catch (err) {
      setError(err?.message || '発注データを削除できませんでした。');
    } finally {
      setBusyOrderId('');
    }
  };

  const openPrintModal = () => {
    setError('');
    setMessage('');
    setPrintError('');
    if (printDateOptions.length === 0) {
      setError('印刷できる発注データがありません。');
      return;
    }
    setShowPrintModal(true);
  };

  const printOrdersByDate = () => {
    if (!printDate || printRows.length === 0) {
      setPrintError('印刷する登録日の発注データがありません。');
      return;
    }
    const content = printContentRef.current;
    if (!content) {
      setPrintError('印刷内容を作成できませんでした。');
      return;
    }

    setPrintError('');
    const printFrame = document.createElement('iframe');
    printFrame.title = '発注一覧印刷';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '1px';
    printFrame.style.height = '1px';
    printFrame.style.border = '0';
    printFrame.style.opacity = '0';
    document.body.appendChild(printFrame);

    const frameWindow = printFrame.contentWindow;
    const frameDocument = printFrame.contentDocument;
    if (!frameWindow || !frameDocument) {
      printFrame.remove();
      setPrintError('印刷画面を準備できませんでした。');
      return;
    }

    const styleMarkup = [...document.querySelectorAll('link[rel="stylesheet"], style')]
      .map((node) => (node.tagName === 'LINK'
        ? `<link rel="stylesheet" href="${node.href}">`
        : node.outerHTML))
      .join('');
    frameDocument.open();
    frameDocument.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>発注一覧</title>${styleMarkup}
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { margin: 0; color: #1e293b; font-family: "Yu Gothic", "Meiryo", sans-serif; }
        table { min-width: 0 !important; width: 100% !important; font-size: 9pt !important; }
        th, td { padding: 6px 7px !important; }
      </style></head><body>${content.innerHTML}</body></html>`);
    frameDocument.close();

    let printStarted = false;
    const cleanup = () => {
      window.setTimeout(() => printFrame.remove(), 500);
    };
    frameWindow.addEventListener('beforeprint', () => { printStarted = true; }, { once: true });
    frameWindow.addEventListener('afterprint', cleanup, { once: true });

    window.setTimeout(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        cleanup();
        setPrintError('このブラウザでは印刷機能を開始できませんでした。ChromeまたはEdgeで開いて印刷してください。');
        return;
      }
      window.setTimeout(() => {
        if (!printStarted) {
          cleanup();
          setPrintError('このブラウザでは印刷ダイアログを表示できません。ChromeまたはEdgeでこのシステムを開いて印刷してください。');
        }
      }, 800);
    }, 150);
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
          <div className="grid gap-4 lg:grid-cols-[190px_minmax(240px,1fr)_120px_minmax(180px,0.65fr)_auto] lg:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">担当者</span>
              <StaffSelect
                staff={staff}
                value={staffId}
                onChange={setStaffId}
                className="h-[42px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                placeholder="担当者を選択"
              />
            </label>
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
              <table className="w-full min-w-[800px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">発注先</th>
                    <th className="px-4 py-2 text-left">資産</th>
                    <th className="px-4 py-2 text-right">発注個数</th>
                    <th className="px-4 py-2 text-left">摘要</th>
                    <th className="px-4 py-2 text-left">担当者</th>
                    <th className="w-14 px-3 py-2"><span className="sr-only">削除</span></th>
                  </tr>
                </thead>
                <tbody>
                  {draftItems.map((item) => (
                    <tr key={item.key} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-bold text-slate-700">{item.asset.supplier || '発注先未設定'}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{item.asset.name}</div>
                        <div className="text-xs text-slate-400">ID: {item.asset.id}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-base font-black text-amber-700">
                        {item.quantity.toLocaleString()} {item.asset.purchaseUnit}
                      </td>
                      <td className="max-w-64 px-4 py-3 text-slate-600">{item.memo || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{item.requestedBy}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeDraftItem(item.key)}
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
            <div className="flex items-center justify-end gap-3">
              <span className="text-xs font-bold text-slate-400">取引先ごとに表示</span>
              <Button variant="print" className="h-10 whitespace-nowrap px-4" onClick={openPrintModal} disabled={printDateOptions.length === 0}>
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
                            <div className="font-bold text-blue-700">{formatDate(order.requestedAt)}</div>
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
                                  <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => deleteOrder(order)} disabled={busyOrderId === order.id}>
                                    <Trash2 size={14} /> 削除
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

      {showPrintModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4">
          <div className="order-print-area flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl">
            <div className="order-print-controls flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-[10px] font-black tracking-[0.18em] text-amber-600">PRINT ORDERS</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">登録日別印刷</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                title="閉じる"
                aria-label="印刷画面を閉じる"
              >
                <X size={20} />
              </button>
            </div>

            <div className="order-print-controls border-b border-slate-200 bg-slate-50 px-6 py-4">
              <label className="block max-w-sm">
                <span className="mb-2 block text-xs font-bold text-slate-500">印刷する登録日</span>
                <select
                  value={printDate}
                  onChange={(event) => setPrintDate(event.target.value)}
                  className="h-11 w-full rounded-md border border-amber-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                >
                  {printDateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value.replaceAll('-', '/')}（{option.count}件）
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div ref={printContentRef} className="order-print-scroll overflow-auto p-6">
              <div className="mb-4">
                <h1 className="text-2xl font-black text-slate-900">発注一覧</h1>
                <p className="mt-1 text-sm text-slate-500">
                  登録日: <span className="font-bold text-blue-700">{printDate ? printDate.replaceAll('-', '/') : '-'}</span>　状態: {printStatusLabel}　件数: {printRows.length}件
                </p>
              </div>
              <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-amber-100 text-amber-900">
                    <th className="w-[15%] border border-slate-300 px-3 py-2 text-left">発注先</th>
                    <th className="w-[27%] border border-slate-300 px-3 py-2 text-left">資産</th>
                    <th className="w-[11%] border border-slate-300 px-3 py-2 text-right">発注個数</th>
                    <th className="w-[23%] border border-slate-300 px-3 py-2 text-left">摘要</th>
                    <th className="w-[17%] border border-slate-300 px-3 py-2 text-left">登録者</th>
                    <th className="w-[7%] border border-slate-300 px-3 py-2 text-left">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {printRows.map((order) => (
                    <tr key={order.id}>
                      <td className="border border-slate-300 px-3 py-2 align-top">{order.supplierName || '発注先未設定'}</td>
                      <td className="border border-slate-300 px-3 py-2 align-top">
                        <div className="font-bold">{order.assetName}</div>
                        <div className="mt-0.5 text-xs text-slate-500">ID: {order.assetId}</div>
                      </td>
                      <td className="whitespace-nowrap border border-slate-300 px-3 py-2 text-right align-top font-bold">
                        {Number(order.quantity).toLocaleString('ja-JP')} {order.purchaseUnit || ''}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 align-top">{order.memo || '-'}</td>
                      <td className="border border-slate-300 px-3 py-2 align-top text-xs">{order.requestedBy || '-'}</td>
                      <td className="border border-slate-300 px-3 py-2 align-top">
                        {order.status === 'completed' ? '完了' : order.status === 'cancelled' ? '取消' : '未完了'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="order-print-controls flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
              {printError && <p className="mr-auto max-w-2xl text-sm font-bold text-red-600">{printError}</p>}
              <Button variant="secondary" onClick={() => setShowPrintModal(false)}><X size={17} /> 閉じる</Button>
              <Button variant="print" onClick={printOrdersByDate} disabled={printRows.length === 0}><Printer size={17} /> 印刷する</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
