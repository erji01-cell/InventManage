import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Printer, RefreshCcw, Table2, X } from 'lucide-react';

import { Button, Card } from '../components/ui.jsx';
import AssetSearchInput from './AssetSearchInput.jsx';
import { normalizeMovementType, parseLocalDate } from '../utils/inventory.js';

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
  const [showMinusOnly, setShowMinusOnly] = useState(false);

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
      const assetMovements = movements.filter(m => m.assetId === asset.id);
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
          <Button variant="primary"><Printer size={18} /> 印刷</Button>
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
                在庫マイナス
              </button>
            </div>
            <AssetSearchInput
              assets={assets}
              value={pinnedId}
              onChange={(id) => { setPinnedId(id); setStockSearchTerm(''); }}
              isIn={true}
              showListSignal={0}
              onSearchTermChange={handleSearchTermChange}
            />
          </div>

          <Button variant="secondary" className="h-[42px]" onClick={() => {
            setRangeFrom(initialIndex);
            setRangeTo(initialIndex);
            setPinnedId('');
            setStockSearchTerm('');
            setShowMinusOnly(false);
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

      <div className="flex justify-end mt-6">
        <Button variant="secondary" onClick={() => setView('menu')}><X size={18} /> 閉じる</Button>
      </div>

    </Card>
  );
}
