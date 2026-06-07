import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Printer, RefreshCcw, Table2, X } from 'lucide-react';

import { Button, Card } from '../components/ui.jsx';
import AssetSearchInput from './AssetSearchInput.jsx';
import { isMovementAfterClose, normalizeMovementType, parseLocalDate } from '../utils/inventory.js';

export default function StockStatusScreen({ assets, movements, setView, pinnedAssetId = '', onNavigateHistory }) {
  const fiscalMonths = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
  const today = new Date();
  const fiscalEndYear = today.getMonth() + 1 >= 7 ? today.getFullYear() + 1 : today.getFullYear();
  const currentFiscalIndex = fiscalMonths.indexOf(today.getMonth() + 1);
  const initialIndex = currentFiscalIndex >= 0 ? currentFiscalIndex : 10;

  const [rangeFrom, setRangeFrom] = useState(initialIndex);
  const [rangeTo, setRangeTo] = useState(initialIndex);
  const [isDragging, setIsDragging] = useState(false);
  const [dragAnchor, setDragAnchor] = useState(null);
  const [stockSearchTerm, setStockSearchTerm] = useState('');
  const [pinnedId, setPinnedId] = useState(pinnedAssetId);
  const [assetResetSignal, setAssetResetSignal] = useState(0);
  const [showMinusOnly, setShowMinusOnly] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);

  // テキスト変更時: 選択を解除してテキスト検索モードへ
  const handleSearchTermChange = (term) => {
    if (pinnedId) setPinnedId('');
    setStockSearchTerm(term);
  };

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleMonthMouseDown = (idx) => {
    setDragAnchor(idx);
    setRangeFrom(idx);
    setRangeTo(idx);
    setIsDragging(true);
  };

  const handleMonthMouseEnter = (idx) => {
    if (!isDragging || dragAnchor === null) return;
    setRangeFrom(Math.min(dragAnchor, idx));
    setRangeTo(Math.max(dragAnchor, idx));
  };

  const fromMonth = fiscalMonths[rangeFrom];
  const toMonth = fiscalMonths[rangeTo];
  const getYearForMonth = (m) => m >= 7 ? fiscalEndYear - 1 : fiscalEndYear;
  const monthStart = new Date(getYearForMonth(fromMonth), fromMonth - 1, 1);
  const nextMonthStart = new Date(getYearForMonth(toMonth), toMonth, 1);

  const startLabel = rangeFrom === 0 ? '期首在庫' : '月初在庫';
  const endLabel = rangeTo === 11 ? '期末在庫' : '月末在庫';

  const stockData = useMemo(() => {
    return assets.map(asset => {
      // 年度クローズ日以前の入出庫は opening_stock に既に反映済みなので除外
      const closedAt = asset.fiscalYearClosedAt || null;
      const assetMovements = movements.filter(m => {
        if (m.assetId !== asset.id) return false;
        return isMovementAfterClose(m.date, closedAt);
      });
      const initialStock = asset.openingStock || 0;
      const beforeMonthTotal = assetMovements.reduce((sum, movement) => {
        const movementDate = parseLocalDate(movement.date);
        if (!movementDate || movementDate >= monthStart) return sum;
        const quantity = movement.quantity || 0;
        return normalizeMovementType(movement.type) === 'in' ? sum + quantity : sum - quantity;
      }, 0);
      const inboundTotal = assetMovements
        .filter(m => {
          const movementDate = parseLocalDate(m.date);
          return movementDate && movementDate >= monthStart && movementDate < nextMonthStart && normalizeMovementType(m.type) === 'in';
        })
        .reduce((sum, m) => sum + m.quantity, 0);
      const outboundTotal = assetMovements
        .filter(m => {
          const movementDate = parseLocalDate(m.date);
          return movementDate && movementDate >= monthStart && movementDate < nextMonthStart && normalizeMovementType(m.type) === 'out';
        })
        .reduce((sum, m) => sum + m.quantity, 0);
      const monthStartStock = initialStock + beforeMonthTotal;
      const currentStock = monthStartStock + inboundTotal - outboundTotal;
      const stockValue = currentStock * asset.usageUnitPrice;

      return { ...asset, prevMonth: monthStartStock, inbound: inboundTotal, outbound: outboundTotal, currentStock, stockValue };
    });
  }, [assets, movements, monthStart.getTime(), nextMonthStart.getTime()]);

  const normalizedStockSearch = stockSearchTerm.trim().toLowerCase();
  const filteredStockData = useMemo(() => {
    if (pinnedId) return stockData.filter(row => row.id === pinnedId);
    if (!normalizedStockSearch) return stockData;
    return stockData.filter(row => [
      row.id,
      row.maker,
      row.name,
      row.kanaName,
      row.category,
      row.parentGenericName,
    ].some(value => String(value || '').toLowerCase().includes(normalizedStockSearch)));
  }, [stockData, normalizedStockSearch, pinnedId]);

  const displayData = showMinusOnly ? filteredStockData.filter(row => row.currentStock < 0) : filteredStockData;
  const totalStockValue = displayData.reduce((sum, row) => sum + row.stockValue, 0);

  const printStyles = `
    @page { size: A4 portrait; margin: 12mm 10mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; font-size: 8pt; color: #111; margin: 0; padding: 0; }
    h1 { font-size: 13pt; font-weight: bold; margin: 0 0 2mm; }
    .subtitle { font-size: 8pt; color: #555; margin-bottom: 4mm; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #fef3c7; font-weight: bold; text-align: left; padding: 2.5mm 2mm; border: 0.3mm solid #d4a017; font-size: 7.5pt; white-space: nowrap; overflow: hidden; }
    td { padding: 2mm; border: 0.3mm solid #e2e8f0; vertical-align: top; word-break: break-all; overflow: hidden; }
    tr:nth-child(even) td { background: #fffbeb; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .in { color: #059669; font-weight: bold; }
    .out { color: #e11d48; font-weight: bold; }
    .neg { color: #dc2626; background: #fff1f2; font-weight: bold; }
    .total { color: #1e40af; font-weight: bold; }
    .summary { margin-top: 5mm; border: 0.4mm solid #fcd34d; border-radius: 2mm; padding: 3mm 5mm; background: #fffbeb; display: flex; justify-content: space-between; align-items: center; }
    .summary-label { font-size: 9pt; color: #92400e; font-weight: bold; }
    .summary-value { font-size: 14pt; font-weight: bold; color: #b45309; }
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
    const headers = ['ID','メーカー','品名',startLabel,'入庫数','出庫数',endLabel,'単位','使用単価','在庫金額'];
    const widths =  ['7%', '12%', '26%', '7%', '7%', '7%', '7%', '5%', '10%', '12%'];
    const ths = headers.map((h, i) => `<th style="width:${widths[i]}" class="${i >= 3 ? 'text-right' : ''}">${h}</th>`).join('');
    const tds = rows.map(row => `<tr>
      <td>${row.id}</td>
      <td>${row.maker || '-'}</td>
      <td>${row.name || '-'}</td>
      <td class="text-right${row.prevMonth < 0 ? ' neg' : ''}">${row.prevMonth.toLocaleString()}</td>
      <td class="text-right in">${row.inbound.toLocaleString()}</td>
      <td class="text-right out">${row.outbound.toLocaleString()}</td>
      <td class="text-right${row.currentStock < 0 ? ' neg' : ' total'}">${row.currentStock.toLocaleString()}</td>
      <td class="text-center">${row.usageUnit || '-'}</td>
      <td class="text-right">¥${(row.usageUnitPrice || 0).toLocaleString()}</td>
      <td class="text-right${row.stockValue < 0 ? ' neg' : ' total'}">¥${row.stockValue.toLocaleString()}</td>
    </tr>`).join('');
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
    const periodLabel = rangeFrom === rangeTo ? `${fromMonth}月度` : `${fromMonth}月〜${toMonth}月`;
    const subtitle = `期間: ${periodLabel}　印刷日: ${today}　件数: ${displayData.length}件`;
    const total = displayData.reduce((s, r) => s + r.stockValue, 0);
    const summaryHTML = `<div class="summary">
      <div class="summary-label">表示件数: ${displayData.length.toLocaleString()} 件</div>
      <div><span class="summary-label">在庫金額合計: </span><span class="summary-value">¥${total.toLocaleString()}</span></div>
    </div>`;
    const html = buildPrintDoc('在庫表', subtitle, buildTableHTML(displayData), summaryHTML);
    openPrintWindow(html);
  };

  const handlePrintMinus = () => {
    setShowPrintMenu(false);
    const minusRows = filteredStockData.filter(r => r.currentStock < 0);
    const today = new Date().toLocaleDateString('ja-JP');
    const periodLabel = rangeFrom === rangeTo ? `${fromMonth}月度` : `${fromMonth}月〜${toMonth}月`;
    const subtitle = `在庫マイナス品目のみ　期間: ${periodLabel}　印刷日: ${today}　件数: ${minusRows.length}件`;
    const total = minusRows.reduce((s, r) => s + r.stockValue, 0);
    const summaryHTML = `<div class="summary" style="border-color:#fca5a5;background:#fef2f2;">
      <div class="summary-label" style="color:#991b1b;">マイナス品目: ${minusRows.length.toLocaleString()} 件</div>
      <div><span class="summary-label" style="color:#991b1b;">マイナス在庫金額合計: </span><span class="summary-value" style="color:#dc2626;">¥${total.toLocaleString()}</span></div>
    </div>`;
    const html = buildPrintDoc('在庫表（在庫マイナス品目）', subtitle, buildTableHTML(minusRows), summaryHTML);
    openPrintWindow(html);
  };

  const minusCount = filteredStockData.filter(r => r.currentStock < 0).length;

  return (
    <Card className="max-h-[90vh] flex flex-col gap-5 relative">
      <button
        onClick={() => setView('menu')}
        className="absolute top-3 right-3 rounded-full p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors z-10"
        title="閉じる"
      >
        <X size={20} />
      </button>
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Inventory Status</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">在庫表</h2>
          <p className="mt-2 text-sm text-slate-500">月度を選択し、品名・メーカー・IDで絞り込めます。</p>
        </div>
        <div className="flex items-center gap-3 mr-10">
          <Button variant="history" onClick={() => setView('history')}><ArrowLeftRight size={18} /> 入出庫データ</Button>
          <Button variant="assets" onClick={() => setView('assets')}><Table2 size={18} /> 資産マスタ</Button>
          <Button variant="primary" onClick={() => setShowPrintMenu(true)}><Printer size={18} /> 印刷</Button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[auto_minmax(260px,420px)_auto_auto] xl:items-end">
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-bold text-slate-500">月度選択</p>
              {rangeFrom !== rangeTo && (
                <p className="text-xs text-blue-600 font-bold">{fromMonth}月〜{toMonth}月</p>
              )}
            </div>
            <div
              className="flex w-max rounded-md border border-slate-200 bg-white p-1 shadow-sm select-none"
              onMouseLeave={() => { if (isDragging) setIsDragging(false); }}
            >
              {fiscalMonths.map((month, idx) => {
                const isFrom = idx === rangeFrom;
                const isTo = idx === rangeTo;
                const inRange = idx > rangeFrom && idx < rangeTo;
                const isSingle = rangeFrom === rangeTo && isFrom;

                let cls = 'h-9 w-8 text-sm transition-colors cursor-pointer ';
                if (isSingle) {
                  cls += 'bg-blue-600 text-white font-bold shadow-sm rounded';
                } else if (isFrom) {
                  cls += 'bg-blue-600 text-white font-bold shadow-sm rounded-l';
                } else if (isTo) {
                  cls += 'bg-blue-600 text-white font-bold shadow-sm rounded-r';
                } else if (inRange) {
                  cls += 'bg-blue-100 text-blue-700 font-medium';
                } else {
                  cls += 'text-slate-600 hover:bg-slate-100 rounded';
                }

                return (
                  <button
                    key={month}
                    className={cls}
                    onMouseDown={() => handleMonthMouseDown(idx)}
                    onMouseEnter={() => handleMonthMouseEnter(idx)}
                  >
                    {month}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-slate-500">資産を選択して絞り込み</p>
              <button
                onClick={() => setShowMinusOnly(v => !v)}
                className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-colors ${showMinusOnly ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-500 border-red-300 hover:bg-red-50'}`}
              >
                在庫マイナス抽出
              </button>
            </div>
            <AssetSearchInput
              assets={assets}
              value={pinnedId}
              onChange={(id) => { setPinnedId(id); setStockSearchTerm(''); }}
              isIn={true}
              showListSignal={0}
              resetSignal={assetResetSignal}
              onSearchTermChange={handleSearchTermChange}
            />
          </div>

          <Button variant="secondary" className="h-[42px]" onClick={() => {
            setRangeFrom(initialIndex);
            setRangeTo(initialIndex);
            setPinnedId('');
            setStockSearchTerm('');
            setShowMinusOnly(false);
            setAssetResetSignal(s => s + 1);
          }}>
            <RefreshCcw size={16} /> リセット
          </Button>

          <div className="grid grid-cols-2 gap-2 xl:w-[260px]">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-bold text-slate-400">表示件数</p>
              <p className="mt-1 text-right text-lg font-bold text-slate-800">{displayData.length.toLocaleString()}</p>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-xs font-bold text-blue-500">在庫金額</p>
              <p className="mt-1 text-right text-lg font-bold text-blue-700">¥{totalStockValue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {pinnedId && (() => {
        const pinnedAsset = assets.find(a => a.id === pinnedId);
        return (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800 w-fit">
            <span>絞り込み中: {pinnedAsset?.name || pinnedId}</span>
            <button onClick={() => setPinnedId('')} className="ml-1 text-amber-500 hover:text-amber-800">×</button>
          </div>
        );
      })()}
            <div className="overflow-auto rounded-lg border border-slate-200 flex-1 text-sm shadow-sm">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 w-20">ID</th>
              <th className="border-b border-slate-200 px-3 py-2 w-36">メーカー</th>
              <th className="border-b border-slate-200 px-3 py-2 min-w-[320px]">品名</th>
              <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-right w-20">{startLabel}</th>
              <th className="border-b border-slate-200 bg-emerald-50/70 px-3 py-2 text-right w-20">入庫数</th>
              <th className="border-b border-slate-200 bg-rose-50/70 px-3 py-2 text-right w-20">出庫数</th>
              <th className="border-b border-slate-200 bg-blue-50/70 px-3 py-2 text-right font-bold w-20">{endLabel}</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center w-20">単位</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right w-28">使用単価</th>
              <th className="border-b border-slate-200 bg-blue-50/70 px-3 py-2 text-right font-bold w-32">在庫金額</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map(row => (
              <tr
                key={row.id}
                className="border-b border-slate-100 transition-colors hover:bg-blue-50/60 cursor-pointer"
                onClick={() => onNavigateHistory?.(row.id)}
                title="入出庫データを表示"
              >
                <td className="px-3 py-2 font-mono text-slate-600">{row.id}</td>
                <td className="px-3 py-2 whitespace-normal break-words">{row.maker || '-'}</td>
                <td className="px-3 py-2 font-bold text-slate-800">{row.name}</td>
                <td className={`px-3 py-2 text-right ${row.prevMonth < 0 ? 'bg-red-50 text-red-600 font-bold' : 'bg-slate-50/60'}`}>{row.prevMonth.toLocaleString()}</td>
                <td className="bg-emerald-50/40 px-3 py-2 text-right text-emerald-700 font-bold">{row.inbound.toLocaleString()}</td>
                <td className="bg-rose-50/40 px-3 py-2 text-right text-rose-700 font-bold">{row.outbound.toLocaleString()}</td>
                <td className={`px-3 py-2 text-right font-bold ${row.currentStock < 0 ? 'bg-red-50 text-red-600' : 'bg-blue-50/40 text-slate-900'}`}>{row.currentStock.toLocaleString()}</td>
                <td className="px-3 py-2 text-center">{row.usageUnit || '-'}</td>
                <td className="px-3 py-2 text-right">¥{row.usageUnitPrice.toLocaleString()}</td>
                <td className={`px-3 py-2 text-right font-bold ${row.stockValue < 0 ? 'bg-red-50 text-red-600' : 'bg-blue-50/50 text-blue-700'}`}>¥{row.stockValue.toLocaleString()}</td>
              </tr>
            ))}
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
              className="w-full text-left rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-200 p-4 transition-colors"
            >
              <div className="font-bold text-slate-800">📄 一覧印刷</div>
              <div className="text-sm text-slate-500 mt-1">現在の絞り込み結果（{displayData.length}件）を印刷</div>
            </button>
            <button
              onClick={handlePrintMinus}
              disabled={minusCount === 0}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${minusCount > 0 ? 'border-slate-200 bg-slate-50 hover:bg-red-50 hover:border-red-200' : 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'}`}
            >
              <div className="font-bold text-slate-800">⚠ 在庫マイナス品目のみ印刷</div>
              <div className="text-sm text-slate-500 mt-1">
                {minusCount > 0
                  ? `現在の絞り込み内のマイナス品目（${minusCount}件）のみを印刷`
                  : '在庫マイナス品目はありません'}
              </div>
            </button>
            <Button variant="secondary" className="w-full mt-1" onClick={() => setShowPrintMenu(false)}>キャンセル</Button>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <Button variant="secondary" onClick={() => setView('menu')}><X size={18} /> 閉じる</Button>
      </div>

    </Card>
  );
}
