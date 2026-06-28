import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, LogIn, LogOut, PlusCircle, Printer, Search, Table2, Trash2, X } from 'lucide-react';

import { Button, Card, DetailItem, DetailRow, EditField } from '../components/ui.jsx';
import { toNullableNumber } from '../utils/inventory.js';
import { kanaSearchKey, romajiCanonical, isRomajiQuery } from '../utils/romaji.js';

const COLUMN_DEFS = [
  { key: 'id',             label: 'ID',       defaultOn: true  },
  { key: 'parentCategory', label: '分類',      defaultOn: false },
  { key: 'maker',          label: 'メーカー',  defaultOn: true  },
  { key: 'name',           label: '品名',      defaultOn: true  },
  { key: 'kanaName',       label: 'かな名',    defaultOn: false },
  { key: 'packSize',       label: '規格',      defaultOn: true  },
  { key: 'purchaseUnit',   label: '購入単位',  defaultOn: false },
  { key: 'usageUnit',      label: '受払単位',  defaultOn: true  },
  { key: 'deliveryPrice',  label: '購入単価',  defaultOn: true  },
  { key: 'usageUnitPrice', label: '受払単価',  defaultOn: true  },
  { key: 'supplier',       label: '発注先',    defaultOn: true  },
  { key: 'janCode',        label: 'JANコード', defaultOn: false },
  { key: 'memo',           label: 'メモ',      defaultOn: false },
];

const SORT_OPTIONS = [
  { value: 'id',           label: 'ID順' },
  { value: 'category_id',  label: '分類ごと → ID順' },
  { value: 'category_kana',label: '分類ごと → アイウエオ順' },
  { value: 'maker',        label: 'メーカー順' },
  { value: 'kana',         label: '品名アイウエオ順' },
];

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase()
    .replace(/[\s\u002d\u2010-\u2015\u2212\u30fc\u30fb\uff65/\\.,\uff0c\uff0e\u3001\u3002()\[\]\uff08\uff09\u300c\u300d\u300e\u300f\u3010\u3011]/g, '');
}

function assetMatchesSearch(asset, query, romajiSearch) {
  const fields = [
    asset.id,
    asset.name,
    asset.kanaName,
    asset.maker,
    asset.category,
    asset.parentCategory,
    asset.parentGenericName,
    asset.supplier,
    asset.janCode,
    asset.memo,
  ];
  if (fields.some((field) => normalizeSearchText(field).includes(query))) return true;
  if (!romajiSearch) return false;
  return kanaSearchKey(asset.kanaName || '').includes(romajiSearch)
    || kanaSearchKey(asset.parentGenericName || '').includes(romajiSearch);
}

function PrintDialog({ assets, onClose }) {
  const [sortOrder, setSortOrder] = useState('id');
  const [enabledCols, setEnabledCols] = useState(() =>
    Object.fromEntries(COLUMN_DEFS.map(col => [col.key, col.defaultOn]))
  );
  const [pageBreak, setPageBreak] = useState(false);
  const isGrouped = sortOrder === 'category_id' || sortOrder === 'category_kana';

  const toggleCol = (key) => setEnabledCols(prev => ({ ...prev, [key]: !prev[key] }));

  const getSortedAssets = () => {
    const arr = [...assets];
    switch (sortOrder) {
      case 'id':           return arr.sort((a, b) => Number(a.id) - Number(b.id));
      case 'category_id': {
        return arr.sort((a, b) => {
          const c = (a.categoryOrder ?? 9999) - (b.categoryOrder ?? 9999);
          return c !== 0 ? c : Number(a.id) - Number(b.id);
        });
      }
      case 'category_kana': {
        return arr.sort((a, b) => {
          const c = (a.categoryOrder ?? 9999) - (b.categoryOrder ?? 9999);
          return c !== 0 ? c : (a.kanaName || a.name).localeCompare(b.kanaName || b.name, 'ja');
        });
      }
      case 'maker': return arr.sort((a, b) => (a.maker || '').localeCompare(b.maker || '', 'ja'));
      case 'kana':  return arr.sort((a, b) => (a.kanaName || a.name).localeCompare(b.kanaName || b.name, 'ja'));
      default:      return arr;
    }
  };

  const getCellValue = (asset, key) => {
    switch (key) {
      case 'deliveryPrice':  return `¥${(asset.deliveryPrice || 0).toLocaleString()}`;
      case 'usageUnitPrice': return `¥${(asset.usageUnitPrice || 0).toLocaleString()}`;
      default: return asset[key] != null && asset[key] !== '' ? String(asset[key]) : '-';
    }
  };

  const handlePrint = () => {
    const sortedAssets = getSortedAssets();
    const selectedCols = COLUMN_DEFS.filter(col => enabledCols[col.key]);
    const sortLabel = SORT_OPTIONS.find(o => o.value === sortOrder)?.label || '';
    const rightAlignKeys = new Set(['id', 'packSize', 'deliveryPrice', 'usageUnitPrice']);

    let tableRows = '';
    let currentCategory = null;
    const grouped = isGrouped;
    // 改ページ用: カテゴリ境界を先読みするためインデックスでループ
    for (let i = 0; i < sortedAssets.length; i++) {
      const asset = sortedAssets[i];
      if (grouped && asset.parentCategory !== currentCategory) {
        currentCategory = asset.parentCategory;
        tableRows += `<tr class="grp"><td colspan="${selectedCols.length}">${currentCategory}</td></tr>`;
      }
      const isLastInGroup = grouped && pageBreak && (i === sortedAssets.length - 1 || sortedAssets[i + 1].parentCategory !== asset.parentCategory);
      const cells = selectedCols.map(col =>
        `<td class="${rightAlignKeys.has(col.key) ? 'r' : ''}">${getCellValue(asset, col.key)}</td>`
      ).join('');
      tableRows += `<tr${isLastInGroup ? ' class="pb"' : ''}>${cells}</tr>`;
    }

    const headerCells = selectedCols.map(col => `<th>${col.label}</th>`).join('');
    // ID・購入単位・受払単位は幅1.5cm固定、それ以外は残り幅を自動配分
    const fixedWidthKeys = new Set(['id', 'purchaseUnit', 'usageUnit']);
    const colGroup = `<colgroup>${selectedCols.map(col =>
      fixedWidthKeys.has(col.key) ? '<col style="width:1.5cm">' : '<col>'
    ).join('')}</colgroup>`;
    const dateStr = new Date().toLocaleDateString('ja-JP');

    const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>資産マスタ一覧</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'MS Gothic','Hiragino Kaku Gothic Pro',sans-serif;font-size:9pt;color:#000}
@page{size:A4;margin:10mm}
h1{font-size:12pt;font-weight:bold;margin-bottom:3mm}
.meta{font-size:8pt;color:#555;margin-bottom:4mm}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #bbb;padding:5px 4px;line-height:1.5;vertical-align:top;word-break:break-all;overflow:hidden}
th{background:#e8e8e8;font-weight:bold;text-align:center;white-space:nowrap}
td.r{text-align:right}
tr.grp td{background:#d4e8ff;font-weight:bold;font-size:9pt;padding:3px 6px;border-top:2px solid #5588bb}
tr:nth-child(even):not(.grp){background:#f7f7f7}
tr.pb{page-break-after:always}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>
<h1>資産マスタ一覧</h1>
<div class="meta">並び順: ${sortLabel}　／　印刷日: ${dateStr}　／　件数: ${sortedAssets.length}件</div>
<table>${colGroup}<thead><tr>${headerCells}</tr></thead><tbody>${tableRows}</tbody></table>
</body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[500px] rounded-xl bg-white shadow-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-purple-500">Print Settings</p>
            <h3 className="text-xl font-black text-slate-900">一覧印刷の設定</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div>
          <p className="mb-2 text-sm font-bold text-slate-600">並び順</p>
          <div className="space-y-1">
            {SORT_OPTIONS.map(opt => (
              <div key={opt.value}>
                <label className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 border transition-colors ${sortOrder === opt.value ? 'border-purple-300 bg-purple-50' : 'border-transparent hover:bg-slate-50'}`}>
                  <input type="radio" name="sortOrder" value={opt.value} checked={sortOrder === opt.value} onChange={() => setSortOrder(opt.value)} className="accent-purple-600" />
                  <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                </label>
                {(opt.value === 'category_id' || opt.value === 'category_kana') && sortOrder === opt.value && (
                  <label className="ml-8 flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 border transition-colors border-transparent hover:bg-slate-50">
                    <input type="checkbox" checked={pageBreak} onChange={() => setPageBreak(v => !v)} className="accent-purple-600" />
                    <span className="text-sm text-slate-600">分類ごとに改ページ</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-bold text-slate-600">印刷する列</p>
          <div className="grid grid-cols-3 gap-1">
            {COLUMN_DEFS.map(col => (
              <label key={col.key} className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 border transition-colors ${enabledCols[col.key] ? 'border-purple-300 bg-purple-50' : 'border-transparent hover:bg-slate-50'}`}>
                <input type="checkbox" checked={enabledCols[col.key]} onChange={() => toggleCol(col.key)} className="accent-purple-600" />
                <span className="text-sm font-medium text-slate-700">{col.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">※ A4に収まるよう列数を調整してください（目安：7〜8列）</p>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}><X size={16} /> キャンセル</Button>
          <Button variant="print" onClick={handlePrint}><Printer size={16} /> 印刷プレビュー</Button>
        </div>
      </div>
    </div>
  );
}

const createAssetEditForm = (asset) => ({
  maker: asset?.maker || '',
  name: asset?.name || '',
  kanaName: asset?.kanaName || '',
  deliveryPrice: asset?.deliveryPrice ?? 0,
  purchaseUnit: asset?.purchaseUnit || '',
  packSize: asset?.packSize || 1,
  usageUnit: asset?.usageUnit || '',
  supplierId: asset?.supplierId || '',
  janCode: asset?.janCode || '',
  memo: asset?.memo || '',
  parentId: asset?.parentId || '',
  categoryId: asset?.categoryId || '',
  parentGenericName: asset?.parentGenericName || '',
});

export default function AssetMasterScreen({ assets, suppliers, categories = [], onCreateCategory, onCreateAsset, onUpdateAsset, onUpdateParentAsset, onDeleteAsset, setView, onNavigateEntry, onNavigateHistory, onNavigateStock, initialAssetId = '', assetPickerMode = false, assetPickerSource = null, onPickAsset, onCancelPick }) {
  const [filter, setFilter] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState(initialAssetId);
  const [pinnedAssetId, setPinnedAssetId] = useState(assetPickerMode ? '' : initialAssetId); // 特定資産へ遷移時、一覧をその1件だけに絞る
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(() => createAssetEditForm(null));
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const assetPickerSourceLabel = assetPickerSource?.source === 'movementHistory'
    ? '入出庫詳細から選択中'
    : assetPickerSource?.source === 'entry' && assetPickerSource?.entryType === 'out'
      ? '出庫入力から選択中'
      : assetPickerSource?.source === 'entry'
        ? '入庫入力から選択中'
        : '';
  const filteredAssets = (() => {
    // 特定資産へ遷移してきた場合は、その1件だけを一覧に表示
    if (pinnedAssetId) {
      const pinned = assets.find(a => String(a.id) === String(pinnedAssetId));
      return pinned ? [pinned] : [];
    }
    const q = normalizeSearchText(filter);
    if (!q) return assets;
    // ローマ字入力ならかな名・大分類名のローマ字化と照合（IME不要で検索可能に）
    const romajiSearch = isRomajiQuery(filter) ? romajiCanonical(filter.toLowerCase()) : '';
    return assets.filter(a => assetMatchesSearch(a, q, romajiSearch));
  })();
  const parentOptions = useMemo(() => {
    const parents = new Map();
    assets.forEach(asset => {
      if (!asset.parentId || parents.has(asset.parentId)) return;
      parents.set(asset.parentId, {
        id: asset.parentId,
        category: asset.parentCategory || '',
        categoryId: asset.categoryId || '',
        genericName: asset.parentGenericName || '',
      });
    });
    return Array.from(parents.values()).sort((a, b) =>
      `${a.genericName}${a.category}`.localeCompare(`${b.genericName}${b.category}`, 'ja')
    );
  }, [assets]);
  const selectedAsset =
    filteredAssets.find(asset => asset.id === selectedAssetId) ||
    filteredAssets[0] ||
    null;

  useEffect(() => {
    if (isCreating) return;
    setIsEditing(false);
    setSaveError('');
    setEditForm(createAssetEditForm(selectedAsset));
  }, [selectedAsset?.id, isCreating]);

  useEffect(() => {
    setSelectedAssetId(initialAssetId);
    setPinnedAssetId(assetPickerMode ? '' : initialAssetId);
  }, [initialAssetId, assetPickerMode]);

  const updateEditForm = (key, value) => {
    setEditForm(prev => ({ ...prev, [key]: value }));
  };

  const updateParentSelection = (parentId) => {
    const parent = parentOptions.find(option => option.id === parentId);
    setEditForm(prev => ({
      ...prev,
      parentId,
      categoryId: parent?.categoryId || prev.categoryId,
      parentGenericName: parent?.genericName || '',
    }));
  };

  const updateNewParentField = (key, value) => {
    setEditForm(prev => ({ ...prev, parentId: '', [key]: value }));
  };

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !onCreateCategory) return;
    setIsCreatingCategory(true);
    try {
      const created = await onCreateCategory(name);
      setEditForm(prev => ({ ...prev, parentId: '', categoryId: created.id }));
      setNewCategoryName('');
      setShowNewCategory(false);
    } catch (err) {
      setSaveError(err.message || '分類を追加できませんでした。');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const startEdit = () => {
    setIsCreating(false);
    setEditForm(createAssetEditForm(selectedAsset));
    setSaveError('');
    setIsEditing(true);
  };

  const startCreate = () => {
    setSelectedAssetId('');
    setIsCreating(true);
    setIsEditing(true);
    setSaveError('');
    setEditForm(createAssetEditForm(null));
  };

  const cancelEdit = () => {
    setEditForm(createAssetEditForm(selectedAsset));
    setSaveError('');
    setIsCreating(false);
    setIsEditing(false);
  };

  const saveEdit = async () => {
    if (!isCreating && !selectedAsset) return;

    const deliveryPrice = toNullableNumber(editForm.deliveryPrice);
    const packSize = toNullableNumber(editForm.packSize);
    const supplierId = toNullableNumber(editForm.supplierId);

    if (!editForm.maker.trim() || !editForm.name.trim() || !editForm.usageUnit.trim()) {
      setSaveError('メーカー、品名、受払単位は必須です。');
      return;
    }

    if (!editForm.categoryId) {
      setSaveError('分類は必須です。');
      return;
    }

    if (deliveryPrice === null || deliveryPrice < 0) {
      setSaveError('購入価格は0以上の数字で入力してください。');
      return;
    }

    if (packSize === null || packSize < 1) {
      setSaveError('入数は1以上の数字で入力してください。');
      return;
    }

    setIsSaving(true);
    setSaveError('');

    try {
      if (isCreating) {
        const created = await onCreateAsset({
          maker: editForm.maker.trim(),
          name: editForm.name.trim(),
          deliveryPrice,
          purchaseUnit: editForm.purchaseUnit.trim(),
          packSize: Math.trunc(packSize),
          usageUnit: editForm.usageUnit.trim(),
          supplierId,
          janCode: editForm.janCode.trim(),
          memo: editForm.memo.trim(),
          parentId: editForm.parentId,
          categoryId: Number(editForm.categoryId),
          parentGenericName: editForm.parentGenericName.trim(),
        });
        setSelectedAssetId(created.id);
        setIsCreating(false);
        setIsEditing(false);
        return;
      }

      const categoryName = categories.find(c => c.id === Number(editForm.categoryId))?.name || '';
      await onUpdateParentAsset(selectedAsset.parentId, {
        category: categoryName,
        category_id: Number(editForm.categoryId),
        generic_name: editForm.parentGenericName.trim() || null,
      });

      await onUpdateAsset(selectedAsset.id, {
        maker: editForm.maker.trim(),
        brand_name: editForm.name.trim(),
        kana_name: editForm.kanaName?.trim() || null,
        delivery_price: deliveryPrice,
        purchase_unit: editForm.purchaseUnit.trim() || null,
        pack_size: Math.trunc(packSize),
        usage_unit: editForm.usageUnit.trim() || null,
        supplier_id: supplierId,
        jan_code: editForm.janCode.trim() || null,
        child_memo: editForm.memo.trim() || null,
      });
      setIsEditing(false);
    } catch (err) {
      setSaveError(err.message || '資産を保存できませんでした。');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSelectedAsset = async () => {
    if (!selectedAsset || isSaving) return;
    const confirmed = window.confirm(`${selectedAsset.name} を削除しますか？`);
    if (!confirmed) return;

    setIsSaving(true);
    setSaveError('');

    try {
      await onDeleteAsset(selectedAsset.id);
      setSelectedAssetId('');
      setIsCreating(false);
      setIsEditing(false);
    } catch (err) {
      setSaveError(err.message || '資産を削除できませんでした。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    {showPrintDialog && (
      <PrintDialog assets={assets} onClose={() => setShowPrintDialog(false)} />
    )}
    <Card className="max-h-[90vh] flex flex-col bg-white relative">
      <div className="absolute left-5 right-5 top-0 h-1 rounded-b-full bg-purple-500 opacity-80" />
      <button
        onClick={() => assetPickerMode ? onCancelPick?.() : setView('menu')}
        className="absolute top-3 right-3 rounded-full p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors z-10"
        title="閉じる"
      >
        <X size={20} />
      </button>
      <div className="mb-5 flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-500">Asset Master</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">資産マスタ</h2>
        </div>
        <div className="flex items-center gap-3 mr-8">
          {assetPickerMode ? (
            <>
              {assetPickerSourceLabel && (
                <div className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-bold text-purple-700">
                  {assetPickerSourceLabel}
                </div>
              )}
              <Button variant="assets" onClick={() => selectedAsset && onPickAsset?.(selectedAsset.id)} disabled={!selectedAsset || isCreating}>
                <CheckCircle2 size={18} /> この資産を選択
              </Button>
              <Button variant="secondary" onClick={() => onCancelPick?.()}>
                <X size={18} /> 戻る
              </Button>
            </>
          ) : (
            <>
              <Button variant="assets" onClick={startCreate}>
                <PlusCircle size={18} /> 新規登録
              </Button>
              <Button variant="history" onClick={() => onNavigateHistory?.()}><ArrowLeftRight size={18} /> 入出庫</Button>
              <Button variant="stock" onClick={() => onNavigateStock?.()}><Table2 size={18} /> 在庫表</Button>
              <Button variant="print" onClick={() => setShowPrintDialog(true)}><Printer size={18} /> 印刷</Button>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-2">
                <p className="text-xs font-bold text-slate-400">表示件数</p>
                <p className="text-lg font-black text-slate-800">{filteredAssets.length.toLocaleString()}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm">
        {pinnedAssetId && (() => {
          const pinned = assets.find(a => String(a.id) === String(pinnedAssetId));
          if (!pinned) return null;
          return (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-bold text-purple-700">
              <span className="whitespace-nowrap">絞り込み中: {pinned.name || pinnedAssetId}</span>
              <button onClick={() => setPinnedAssetId('')} className="ml-1 text-purple-400 hover:text-purple-700" title="全件表示に戻す">×</button>
            </div>
          );
        })()}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" size={18} />
          <input
            type="text"
            placeholder="ID・品名・メーカー・分類で検索..."
            className="w-full rounded-md border border-purple-200 bg-purple-50 py-2.5 pl-10 pr-4 text-sm font-medium shadow-inner outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPinnedAssetId(''); }}
          />
        </div>
        <Button variant="secondary" onClick={() => { setFilter(''); setPinnedAssetId(''); }}>リセット</Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="overflow-auto rounded-lg border border-slate-200 shadow-sm">
          <table className="w-full text-left border-collapse table-fixed text-sm">
            <thead className="bg-slate-100 sticky top-0">
              <tr>
                <th className="p-3 w-16">ID</th>
                <th className="p-3 w-32">メーカー</th>
                <th className="p-3 w-24">分類</th>
                <th className="p-3">品名</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map(asset => {
                const isSelected = selectedAsset?.id === asset.id;
                return (
                  <tr
                    key={asset.id}
                    onClick={() => {
                      setIsCreating(false);
                      setSelectedAssetId(asset.id);
                    }}
                    className={`cursor-pointer border-b border-slate-100 transition-colors ${
                      isSelected ? 'bg-purple-50 shadow-[inset_4px_0_0_#9333ea]' : 'hover:bg-purple-50/60'
                    }`}
                  >
                    <td className="p-3 font-mono text-slate-500 break-words">{asset.id}</td>
                    <td className="p-3 whitespace-normal break-words">{asset.maker}</td>
                    <td className="p-3 whitespace-normal break-words">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{asset.parentCategory}</span>
                    </td>
                    <td className="p-3 font-medium text-blue-700 whitespace-normal break-words">{asset.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          {selectedAsset || isCreating ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Detail</p>
                  <p className="mt-1 text-base font-black text-slate-800">詳細情報</p>
                </div>
                {!isEditing ? (
                  <div className="flex gap-2">
                    <Button variant="success" className="px-3 py-1 text-sm" onClick={() => onNavigateEntry('in', selectedAsset?.id)} disabled={!selectedAsset}>
                      <LogIn size={16} /> 入庫
                    </Button>
                    <Button variant="danger" className="px-3 py-1 text-sm bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" onClick={() => onNavigateEntry('out', selectedAsset?.id)} disabled={!selectedAsset}>
                      <LogOut size={16} /> 出庫
                    </Button>
                    <Button variant="action" className="px-3 py-1 text-sm" onClick={startEdit}>
                      編集
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="secondary" className="px-3 py-1 text-sm" onClick={cancelEdit} disabled={isSaving}>
                      取消
                    </Button>
                    <Button variant="success" className="px-3 py-1 text-sm" onClick={saveEdit} disabled={isSaving}>
                      {isSaving ? '保存中' : '保存'}
                    </Button>
                  </div>
                )}
              </div>

              {selectedAsset && !isEditing && (
                <div className="rounded-lg bg-slate-100 px-4 py-3">
                  <p className="text-base font-black text-slate-800 leading-snug">{selectedAsset.name || '-'}</p>
                  <p className="mt-0.5 text-xs text-slate-500 font-medium">{selectedAsset.kanaName || ''}</p>
                </div>
              )}

              {saveError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                  {saveError}
                </div>
              )}

              {isEditing ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailItem label="ID" value={isCreating ? '新規' : selectedAsset.id || '-'} mono />
                    <EditField
                      label="取引先"
                      type="select"
                      value={editForm.supplierId}
                      onChange={(value) => updateEditForm('supplierId', value)}
                      options={[
                        { value: '', label: '未設定' },
                        ...suppliers.map(supplier => ({
                          value: String(supplier.id),
                          label: supplier.name,
                        })),
                      ]}
                    />
                  </div>

                  <EditField label="メーカー" value={editForm.maker} onChange={(value) => updateEditForm('maker', value)} />
                  <EditField label="品名" value={editForm.name} onChange={(value) => updateEditForm('name', value)} />
                  <EditField label="読み仮名" value={editForm.kanaName} onChange={(value) => updateEditForm('kanaName', value)} />

                  <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                    <p className="mb-3 text-xs font-bold text-purple-700">大分類</p>
                    <div className="space-y-3">
                      <EditField
                        label="分類"
                        type="select"
                        value={String(editForm.categoryId || '')}
                        onChange={(value) => updateNewParentField('categoryId', value ? Number(value) : '')}
                        options={[
                          { value: '', label: '選択してください' },
                          ...categories.map(cat => ({ value: String(cat.id), label: cat.name })),
                        ]}
                      />
                      {!showNewCategory ? (
                        <button type="button" onClick={() => setShowNewCategory(true)} className="text-xs font-bold text-purple-600 hover:underline">
                          ＋ 新しい分類を追加
                        </button>
                      ) : (
                        <div className="rounded-md border border-purple-200 bg-white p-2 space-y-2">
                          <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="新しい分類名"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                          />
                          <div className="flex gap-2">
                            <Button variant="success" className="px-3 py-1 text-xs" onClick={handleAddCategory} disabled={isCreatingCategory || !newCategoryName.trim()}>
                              {isCreatingCategory ? '追加中...' : '追加'}
                            </Button>
                            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }} disabled={isCreatingCategory}>
                              取消
                            </Button>
                          </div>
                        </div>
                      )}
                      {isCreating && (
                        <EditField
                          label="既存ジェネリック名"
                          type="select"
                          value={editForm.parentId}
                          onChange={updateParentSelection}
                          options={[
                            { value: '', label: '新しいジェネリック名で登録' },
                            ...parentOptions.map(parent => ({
                              value: parent.id,
                              label: `${parent.genericName || parent.id} / ${parent.category || '-'}`,
                            })),
                          ]}
                        />
                      )}
                      <EditField
                        label="大分類名（任意）"
                        value={editForm.parentGenericName}
                        onChange={(value) => updateNewParentField('parentGenericName', value)}
                        disabled={isCreating && Boolean(editForm.parentId)}
                      />
                    </div>
                    <p className="mt-2 text-xs text-purple-700">
                      {isCreating ? '既存ジェネリック名を選ぶと、その親IDに子資産として追加されます。' : '同じ大分類に紐づく他の資産にも反映されます。'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <EditField label="購入単位" value={editForm.purchaseUnit} onChange={(value) => updateEditForm('purchaseUnit', value)} />
                    <EditField label="購入価格" type="number" value={editForm.deliveryPrice} onChange={(value) => updateEditForm('deliveryPrice', value)} align="right" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="入数" type="number" value={editForm.packSize} onChange={(value) => updateEditForm('packSize', value)} align="right" />
                    <EditField label="受払単位" value={editForm.usageUnit} onChange={(value) => updateEditForm('usageUnit', value)} />
                    <DetailItem label="受払単価" value={`¥${(selectedAsset?.usageUnitPrice || 0).toLocaleString()}`} align="right" />
                  </div>

                  <EditField label="摘要" value={editForm.memo} onChange={(value) => updateEditForm('memo', value)} multiline />
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailItem label="ID" value={selectedAsset.id || '-'} mono />
                    <DetailItem label="取引先" value={selectedAsset.supplier || '-'} />
                    <DetailItem label="購入単位" value={selectedAsset.purchaseUnit || '-'} />
                    <DetailItem label="購入価格" value={`¥${selectedAsset.deliveryPrice.toLocaleString()}`} align="right" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <DetailItem label="入数" value={selectedAsset.packSize || '-'} align="right" />
                    <DetailItem label="受払単位" value={selectedAsset.usageUnit || '-'} />
                    <DetailItem label="受払単価" value={`¥${selectedAsset.usageUnitPrice.toLocaleString()}`} align="right" />
                  </div>

                  <div className="space-y-2 border-t border-slate-200 pt-4">
                    <DetailRow label="分類" value={selectedAsset.parentCategory || '-'} />
                    <DetailRow label="大分類名" value={selectedAsset.parentGenericName || '-'} />
                    <DetailRow label="摘要" value={selectedAsset.memo || '-'} />
                  </div>

                  <div className="flex flex-col gap-2 border-t border-slate-200 pt-4">
                    <div className="grid grid-cols-3 gap-2">
                      <Button variant="history" className="w-full px-3 py-2 text-sm" onClick={() => onNavigateHistory?.(selectedAsset?.id)} disabled={!selectedAsset}>
                        <ArrowLeftRight size={16} /> 入出庫
                      </Button>
                      <Button variant="stock" className="w-full px-3 py-2 text-sm" onClick={() => onNavigateStock?.(selectedAsset?.id)} disabled={!selectedAsset}>
                        <Table2 size={16} /> 在庫表
                      </Button>
                      <Button variant="secondary" className="w-full px-3 py-2 text-sm" onClick={deleteSelectedAsset} disabled={!selectedAsset || isSaving}>
                        <Trash2 size={16} /> 削除
                      </Button>
                    </div>
                  </div>

                </>
              )}

            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">
              表示する資産がありません
            </div>
          )}
        </aside>
      </div>

      <div className="flex justify-end mt-6">
        <Button variant="secondary" onClick={() => setView('menu')}><X size={18} /> 閉じる</Button>
      </div>

    </Card>
    </>
  );
}
