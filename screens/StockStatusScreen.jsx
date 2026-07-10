import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Printer, RefreshCcw, Table2, X } from 'lucide-react';

import { Button, Card } from '../components/ui.jsx';
import AssetSearchInput from './AssetSearchInput.jsx';
import { isMovementAfterClose, normalizeMovementType, parseLocalDate } from '../utils/inventory.js';

export default function StockStatusScreen({ assets, movements, setView, pinnedAssetId = '', onNavigateHistory, onNavigateAssets, fiscalRange = null, fiscalSnapshots = [] }) {
  const fiscalMonths = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
  const today = new Date();
  const isPastYear = !!(fiscalRange && !fiscalRange.isCurrent);
  const currentEndYear = today.getMonth() + 1 >= 7 ? today.getFullYear() + 1 : today.getFullYear();
  // 過去年度を閲覧中は、その年度の終了年（開始年+1）を基準にする
  const fiscalEndYear = isPastYear ? fiscalRange.startYear + 1 : currentEndYear;
  const currentFiscalIndex = fiscalMonths.indexOf(today.getMonth() + 1);
  // 過去年度は年度全体（7月〜6月）を初期表示、現在年度は当月を初期表示
  const initialFrom = isPastYear ? 0 : (currentFiscalIndex >= 0 ? currentFiscalIndex : 10);
  const initialTo = isPastYear ? 11 : initialFrom;

  const [rangeFrom, setRangeFrom] = useState(initialFrom);
  const [rangeTo, setRangeTo] = useState(initialTo);
  const [isDragging, setIsDragging] = useState(false);
  const [dragAnchor, setDragAnchor] = useState(null);
  const [stockSearchTerm, setStockSearchTerm] = useState('');
  const [pinnedId, setPinnedId] = useState(pinnedAssetId);
  const [assetResetSignal, setAssetResetSignal] = useState(0);
  const [showMinusOnly, setShowMinusOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(''); // '' = 全分類
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [categoryPickTarget, setCategoryPickTarget] = useState(null); // 'detail' | 'summary'
  const [checkedCategories, setCheckedCategories] = useState(() => new Set());

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

  // 印刷用の期間表示（西暦年を含む）
  const buildPeriodLabel = () => {
    const fromYear = getYearForMonth(fromMonth);
    const toYear = getYearForMonth(toMonth);
    return rangeFrom === rangeTo
      ? `西暦${fromYear}年${fromMonth}月度`
      : `西暦${fromYear}年${fromMonth}月から西暦${toYear}年${toMonth}月まで`;
  };

  const startLabel = rangeFrom === 0 ? '期首在庫' : '月初在庫';
  const endLabel = rangeTo === 11 ? '期末在庫' : '月末在庫';

  // 過去年度閲覧用: その年度のスナップショット（期首在庫）を資産IDで引けるように
  const snapByAsset = useMemo(() => {
    const m = new Map();
    if (isPastYear) {
      (fiscalSnapshots || []).forEach(s => {
        if (s.fiscalYear === fiscalRange.startYear) m.set(String(s.assetId), s);
      });
    }
    return m;
  }, [isPastYear, fiscalSnapshots, fiscalRange]);

  const pastYearHasAnySnapshot = isPastYear && snapByAsset.size > 0;
  const yearFrom = isPastYear ? `${fiscalRange.startYear}-07-01` : '';
  const yearTo = isPastYear ? `${fiscalRange.startYear + 1}-06-30` : '';

  // 資産IDごとに入出庫を先にグループ化（資産×全入出庫の総当たりを避ける）
  const movementsByAsset = useMemo(() => {
    const map = new Map();
    movements.forEach((m) => {
      const list = map.get(m.assetId);
      if (list) list.push(m);
      else map.set(m.assetId, [m]);
    });
    return map;
  }, [movements]);

  const stockData = useMemo(() => {
    return assets.map(asset => {
      const ownMovements = movementsByAsset.get(asset.id) || [];
      let initialStock;
      let assetMovements;
      if (isPastYear) {
        // 過去年度: スナップショットの期首在庫を起点に、その年度内の入出庫のみで計算
        const snap = snapByAsset.get(asset.id);
        initialStock = snap ? snap.openingStock : 0;
        assetMovements = ownMovements.filter(m => {
          const md = String(m.date || '').replaceAll('/', '-');
          return md >= yearFrom && md <= yearTo;
        });
      } else {
        // 現在年度: 年度クローズ日以前の入出庫は opening_stock に反映済みなので除外
        const closedAt = asset.fiscalYearClosedAt || null;
        assetMovements = ownMovements.filter(m => isMovementAfterClose(m.date, closedAt));
        initialStock = asset.openingStock || 0;
      }
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
  }, [assets, movementsByAsset, monthStart.getTime(), nextMonthStart.getTime(), isPastYear, snapByAsset, yearFrom, yearTo]);

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

  // 分類フィルタのドロップダウン用: 全データに含まれる分類の一覧（マスタ表示順）
  const allCategories = useMemo(() => {
    const m = new Map();
    stockData.forEach(r => {
      const key = r.category || '未分類';
      const g = m.get(key);
      if (g) g.count += 1;
      else m.set(key, { count: 1, order: r.categoryOrder ?? 9999 });
    });
    return [...m.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'ja'));
  }, [stockData]);

  const minusFilteredData = showMinusOnly ? filteredStockData.filter(row => row.currentStock < 0) : filteredStockData;
  const displayData = categoryFilter
    ? minusFilteredData.filter(row => (row.category || '未分類') === categoryFilter)
    : minusFilteredData;
  const totalStockValue = displayData.reduce((sum, row) => sum + row.stockValue, 0);

  // 表示中データに含まれる分類の一覧（マスタ表示順）。分類選択チェックボックスに使用
  const displayCategories = useMemo(() => {
    const m = new Map();
    displayData.forEach(r => {
      const key = r.category || '未分類';
      const g = m.get(key);
      if (g) g.count += 1;
      else m.set(key, { count: 1, order: r.categoryOrder ?? 9999 });
    });
    return [...m.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'ja'));
  }, [displayData]);

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
    .cat-header td { background: #fde68a !important; font-weight: bold; font-size: 8.5pt; color: #78350f; border: 0.3mm solid #d4a017; }
    .subtotal td { background: #fef9c3 !important; font-weight: bold; border-top: 0.4mm solid #d4a017; }
    .subtotal-incl td { background: #fef9c3 !important; font-weight: bold; color: #92400e; }
  `;

  const TAX_RATE = 0.1; // 消費税率10%（税込小計は円未満切り捨て）

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

  const tableHeaderHTML = () => {
    const headers = ['ID','メーカー','品名',startLabel,'入庫数','出庫数',endLabel,'単位','受払単価','在庫金額'];
    const widths =  ['7%', '12%', '26%', '7%', '7%', '7%', '7%', '5%', '10%', '12%'];
    return headers.map((h, i) => `<th style="width:${widths[i]}" class="${i >= 3 ? 'text-right' : ''}">${h}</th>`).join('');
  };

  const buildRowHTML = (row) => `<tr>
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
    </tr>`;

  const buildTableHTML = (rows) => {
    const tds = rows.map(buildRowHTML).join('');
    return `<table><thead><tr>${tableHeaderHTML()}</tr></thead><tbody>${tds}</tbody></table>`;
  };

  // 分類マスタの表示順（display_order）で並べる。未分類・順序未設定は末尾へ
  const sortCategoryKeys = (groups, getOrder) =>
    [...groups.keys()].sort((a, b) => {
      const diff = getOrder(a) - getOrder(b);
      return diff !== 0 ? diff : a.localeCompare(b, 'ja');
    });

  // 分類ごとにグループ化し、各分類の末尾に税抜・税込の小計行を挿入したテーブルを生成
  const buildCategoryTableHTML = (rows) => {
    const groups = new Map();
    rows.forEach(row => {
      const key = row.category || '未分類';
      const list = groups.get(key);
      if (list) list.push(row);
      else groups.set(key, [row]);
    });
    const sortedKeys = sortCategoryKeys(groups, (key) => groups.get(key)[0].categoryOrder ?? 9999);

    const bodyHTML = sortedKeys.map(key => {
      const groupRows = groups.get(key);
      const subtotalEx = groupRows.reduce((s, r) => s + r.stockValue, 0);
      const subtotalIn = Math.floor(subtotalEx * (1 + TAX_RATE));
      const negCls = (v) => v < 0 ? ' neg' : '';
      return `<tr class="cat-header"><td colspan="10">■ ${key}（${groupRows.length}件）</td></tr>`
        + groupRows.map(buildRowHTML).join('')
        + `<tr class="subtotal"><td colspan="9" class="text-right">${key} 小計（税抜）</td><td class="text-right${negCls(subtotalEx)}">¥${subtotalEx.toLocaleString()}</td></tr>`
        + `<tr class="subtotal subtotal-incl"><td colspan="9" class="text-right">${key} 小計（税込）</td><td class="text-right${negCls(subtotalIn)}">¥${subtotalIn.toLocaleString()}</td></tr>`;
    }).join('');

    return `<table><thead><tr>${tableHeaderHTML()}</tr></thead><tbody>${bodyHTML}</tbody></table>`;
  };

  // 分類ごとの小計のみの一覧テーブル（明細行なし）を生成
  const buildCategorySummaryTableHTML = (rows) => {
    const groups = new Map();
    rows.forEach(row => {
      const key = row.category || '未分類';
      const g = groups.get(key);
      if (g) { g.count += 1; g.subtotalEx += row.stockValue; }
      else groups.set(key, { count: 1, subtotalEx: row.stockValue, order: row.categoryOrder ?? 9999 });
    });
    const sortedKeys = sortCategoryKeys(groups, (key) => groups.get(key).order);

    const headers = ['分類', '件数', '在庫金額（税抜）', '在庫金額（税込）'];
    const widths = ['46%', '14%', '20%', '20%'];
    const ths = headers.map((h, i) => `<th style="width:${widths[i]}" class="${i >= 1 ? 'text-right' : ''}">${h}</th>`).join('');

    let totalCount = 0, totalEx = 0, totalIn = 0;
    const negCls = (v) => v < 0 ? ' neg' : '';
    const tds = sortedKeys.map(key => {
      const { count, subtotalEx } = groups.get(key);
      const subtotalIn = Math.floor(subtotalEx * (1 + TAX_RATE));
      totalCount += count;
      totalEx += subtotalEx;
      totalIn += subtotalIn;
      return `<tr>
        <td>${key}</td>
        <td class="text-right">${count.toLocaleString()}</td>
        <td class="text-right${negCls(subtotalEx)}">¥${subtotalEx.toLocaleString()}</td>
        <td class="text-right${negCls(subtotalIn)}">¥${subtotalIn.toLocaleString()}</td>
      </tr>`;
    }).join('');
    const totalRow = `<tr class="subtotal">
      <td>合計（${sortedKeys.length}分類）</td>
      <td class="text-right">${totalCount.toLocaleString()}</td>
      <td class="text-right${negCls(totalEx)}">¥${totalEx.toLocaleString()}</td>
      <td class="text-right${negCls(totalIn)}">¥${totalIn.toLocaleString()}</td>
    </tr>`;

    return `<table><thead><tr>${ths}</tr></thead><tbody>${tds}${totalRow}</tbody></table>`;
  };

  const openPrintWindow = (html) => {
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
  };

  const handlePrintList = () => {
    setShowPrintMenu(false);
    const today = new Date().toLocaleDateString('ja-JP');
    const periodLabel = buildPeriodLabel();
    const subtitle = `期間: ${periodLabel}　印刷日: ${today}　件数: ${displayData.length}件`;
    const total = displayData.reduce((s, r) => s + r.stockValue, 0);
    const summaryHTML = `<div class="summary">
      <div class="summary-label">表示件数: ${displayData.length.toLocaleString()} 件</div>
      <div><span class="summary-label">在庫金額合計: </span><span class="summary-value">¥${total.toLocaleString()}</span></div>
    </div>`;
    const html = buildPrintDoc('在庫表', subtitle, buildTableHTML(displayData), summaryHTML);
    openPrintWindow(html);
  };

  // 分類別印刷の共通処理: rows は印刷対象（分類選択で絞り込み済み）の行
  const printCategoryRows = (rows, target) => {
    const today = new Date().toLocaleDateString('ja-JP');
    const periodLabel = buildPeriodLabel();
    const categoryCount = new Set(rows.map(r => r.category || '未分類')).size;
    const isDetail = target === 'detail';
    const docTitle = isDetail ? '在庫表（分類別）' : '在庫表（分類別小計一覧）';
    const docLabel = isDetail ? '分類別（小計付き）' : '分類別小計一覧';
    const subtitle = `${docLabel}　期間: ${periodLabel}　印刷日: ${today}　対象: ${rows.length}件（${categoryCount}分類）`;
    const totalEx = rows.reduce((s, r) => s + r.stockValue, 0);
    // 総合計（税込）は分類ごとの税込小計（円未満切り捨て）の合算とし、印字値と一致させる
    const groups = new Map();
    rows.forEach(r => {
      const key = r.category || '未分類';
      groups.set(key, (groups.get(key) || 0) + r.stockValue);
    });
    const totalIn = [...groups.values()].reduce((s, v) => s + Math.floor(v * (1 + TAX_RATE)), 0);
    const summaryHTML = `<div class="summary">
      <div class="summary-label">対象: ${rows.length.toLocaleString()} 件（${categoryCount}分類）</div>
      <div style="text-align:right;">
        <div><span class="summary-label">在庫金額合計（税抜）: </span><span class="summary-value">¥${totalEx.toLocaleString()}</span></div>
        <div><span class="summary-label">在庫金額合計（税込）: </span><span class="summary-value">¥${totalIn.toLocaleString()}</span></div>
      </div>
    </div>`;
    const tableHTML = isDetail ? buildCategoryTableHTML(rows) : buildCategorySummaryTableHTML(rows);
    openPrintWindow(buildPrintDoc(docTitle, subtitle, tableHTML, summaryHTML));
  };

  // 分類選択モーダルを開く（全分類チェック済みで開始）
  const openCategoryPicker = (target) => {
    setShowPrintMenu(false);
    setCheckedCategories(new Set(displayCategories.map(c => c.name)));
    setCategoryPickTarget(target);
  };

  const toggleCategory = (name) => {
    setCheckedCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const executeCategoryPrint = () => {
    const rows = displayData.filter(r => checkedCategories.has(r.category || '未分類'));
    const target = categoryPickTarget;
    setCategoryPickTarget(null);
    if (rows.length > 0) printCategoryRows(rows, target);
  };

  const handlePrintMinus = () => {
    setShowPrintMenu(false);
    const minusRows = filteredStockData.filter(r => r.currentStock < 0);
    const today = new Date().toLocaleDateString('ja-JP');
    const periodLabel = buildPeriodLabel();
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
      <div className="absolute left-5 right-5 top-0 h-1 rounded-b-full bg-amber-500 opacity-80" />
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
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-black tracking-tight text-slate-900">在庫表</h2>
            {fiscalRange && (
              <span
                className={`rounded-full px-3 py-1 text-sm font-black ${
                  fiscalRange.isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {fiscalRange.startYear}年度{fiscalRange.isCurrent ? '（現在）' : '（過去）'}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-500">月度を選択し、品名・メーカー・IDで絞り込めます。</p>
          {isPastYear && !pastYearHasAnySnapshot && (
            <p className="mt-1 text-xs font-bold text-amber-600">
              ※ この年度のスナップショットがないため、期首在庫0として概算表示しています。
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 mr-10">
          <Button variant="history" onClick={() => setView('history')}><ArrowLeftRight size={18} /> 入出庫データ</Button>
          <Button variant="assets" onClick={() => { if (onNavigateAssets) { onNavigateAssets(pinnedId); } else { setView('assets'); } }}><Table2 size={18} /> 資産マスタ</Button>
          <Button variant="print" onClick={() => setShowPrintMenu(true)}><Printer size={18} /> 印刷</Button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[auto_minmax(260px,420px)_auto_auto] xl:items-end">
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-bold text-slate-500">月度選択</p>
              {rangeFrom === rangeTo ? (
                <p className="text-xs text-blue-600 font-bold">{getYearForMonth(fromMonth)}年 {fromMonth}月</p>
              ) : (
                <p className="text-xs text-blue-600 font-bold">{getYearForMonth(fromMonth)}年{fromMonth}月〜{getYearForMonth(toMonth)}年{toMonth}月</p>
              )}
            </div>
            <div className="flex flex-col w-max">
            <div className="flex px-1 mb-0.5">
              <div className="w-48 text-left text-[11px] font-bold text-slate-400">{fiscalEndYear - 1}年</div>
              <div className="w-48 text-left text-[11px] font-bold text-slate-400">{fiscalEndYear}年</div>
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
              <div className="relative">
                <button
                  onClick={() => setShowCategoryDropdown(v => !v)}
                  className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-colors ${categoryFilter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'}`}
                >
                  {categoryFilter ? `分類: ${categoryFilter}` : '分類で絞り込み'} ▾
                </button>
                {showCategoryDropdown && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowCategoryDropdown(false)} />
                    <div className="absolute left-0 top-full z-30 mt-1 w-60 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                      <button
                        onClick={() => { setCategoryFilter(''); setShowCategoryDropdown(false); }}
                        className={`w-full text-left px-4 py-2 text-sm font-bold transition-colors hover:bg-blue-50 ${!categoryFilter ? 'text-blue-600 bg-blue-50/60' : 'text-slate-700'}`}
                      >
                        すべての分類
                      </button>
                      {allCategories.map(cat => (
                        <button
                          key={cat.name}
                          onClick={() => { setCategoryFilter(cat.name); setShowCategoryDropdown(false); }}
                          className={`w-full flex items-center text-left px-4 py-2 text-sm font-bold border-t border-slate-100 transition-colors hover:bg-blue-50 ${categoryFilter === cat.name ? 'text-blue-600 bg-blue-50/60' : 'text-slate-700'}`}
                        >
                          <span>{cat.name}</span>
                          <span className="ml-auto text-xs font-normal text-slate-400">{cat.count.toLocaleString()}件</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
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
            setRangeFrom(initialFrom);
            setRangeTo(initialTo);
            setPinnedId('');
            setStockSearchTerm('');
            setShowMinusOnly(false);
            setCategoryFilter('');
            setShowCategoryDropdown(false);
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
              <th className="border-b border-slate-200 px-3 py-2 text-right w-28">受払単価</th>
              <th className="border-b border-slate-200 bg-blue-50/70 px-3 py-2 text-right font-bold w-32">在庫金額</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map(row => (
              <tr
                key={row.id}
                className="border-b border-slate-100 transition-colors hover:bg-amber-50/70 cursor-pointer"
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
              onClick={() => openCategoryPicker('detail')}
              className="w-full text-left rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 p-4 transition-colors"
            >
              <div className="font-bold text-slate-800">📊 分類別印刷（小計付き）</div>
              <div className="text-sm text-slate-500 mt-1">分類を選択し、税抜・税込の小計を表示して印刷</div>
            </button>
            <button
              onClick={() => openCategoryPicker('summary')}
              className="w-full text-left rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 p-4 transition-colors"
            >
              <div className="font-bold text-slate-800">🧾 分類別小計一覧の印刷</div>
              <div className="text-sm text-slate-500 mt-1">明細なしで、選択した分類の小計（税抜・税込）だけを一覧で印刷</div>
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

      {categoryPickTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-[28rem] flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Printer size={22} className="text-slate-600" />
              <h2 className="text-lg font-black text-slate-800">印刷する分類を選択</h2>
            </div>
            <p className="text-sm text-slate-500 -mt-2">
              {categoryPickTarget === 'detail' ? '分類別印刷（小計付き）' : '分類別小計一覧の印刷'}の対象分類を選んでください。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCheckedCategories(new Set(displayCategories.map(c => c.name)))}
                className="text-xs font-bold px-3 py-1 rounded-full border border-blue-300 text-blue-600 bg-white hover:bg-blue-50 transition-colors"
              >
                全選択
              </button>
              <button
                onClick={() => setCheckedCategories(new Set())}
                className="text-xs font-bold px-3 py-1 rounded-full border border-slate-300 text-slate-600 bg-white hover:bg-slate-100 transition-colors"
              >
                全解除
              </button>
              <span className="ml-auto text-sm font-bold text-slate-500 self-center">
                {checkedCategories.size} / {displayCategories.length} 分類
              </span>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {displayCategories.map(cat => (
                <label
                  key={cat.name}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checkedCategories.has(cat.name)}
                    onChange={() => toggleCategory(cat.name)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="font-bold text-slate-800">{cat.name}</span>
                  <span className="ml-auto text-sm text-slate-400">{cat.count.toLocaleString()}件</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 mt-1">
              <Button variant="secondary" className="flex-1" onClick={() => setCategoryPickTarget(null)}>キャンセル</Button>
              <Button
                variant="print"
                className={`flex-1 ${checkedCategories.size === 0 ? 'opacity-40 pointer-events-none' : ''}`}
                onClick={executeCategoryPrint}
              >
                <Printer size={16} /> 印刷する
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
