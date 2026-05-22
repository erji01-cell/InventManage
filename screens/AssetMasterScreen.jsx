import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, LogIn, LogOut, PlusCircle, Printer, Search, Table2, Trash2, X } from 'lucide-react';

import { Button, Card, DetailItem, DetailRow, EditField } from '../components/ui.jsx';
import { toNullableNumber } from '../utils/inventory.js';

const COLUMN_DEFS = [
  { key: 'id',             label: 'ID',       defaultOn: true  },
  { key: 'parentCategory', label: '分類',      defaultOn: false },
  { key: 'maker',          label: 'メーカー',  defaultOn: true  },
  { key: 'name',           label: '品名',      defaultOn: true  },
  { key: 'kanaName',       label: 'かな名',    defaultOn: false },
  { key: 'packSize',       label: '規格',      defaultOn: true  },
  { key: 'purchaseUnit',   label: '購入単位',  defaultOn: false },
  { key: 'usageUnit',      label: '使用単位',  defaultOn: true  },
  { key: 'deliveryPrice',  label: '購入単価',  defaultOn: true  },
  { key: 'usageUnitPrice', label: '使用単価',  defaultOn: true  },
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
th,td{border:1px solid #bbb;padding:2px 4px;vertical-align:top;word-break:break-all;overflow:hidden}
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
<table><thead><tr>${headerCells}</tr></thead><tbody>${tableRows}</tbody></table>
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
            <p className="text-xs font-bold uppercase tracking-widest text-blue-500">Print Settings</p>
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
                <label className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 border transition-colors ${sortOrder === opt.value ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}>
                  <input type="radio" name="sortOrder" value={opt.value} checked={sortOrder === opt.value} onChange={() => setSortOrder(opt.value)} className="accent-blue-600" />
                  <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                </label>
                {(opt.value === 'category_id' || opt.value === 'category_kana') && sortOrder === opt.value && (
                  <label className="ml-8 flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 border transition-colors border-transparent hover:bg-slate-50">
                    <input type="checkbox" checked={pageBreak} onChange={() => setPageBreak(v => !v)} className="accent-blue-600" />
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
              <label key={col.key} className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 border transition-colors ${enabledCols[col.key] ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}>
                <input type="checkbox" checked={enabledCols[col.key]} onChange={() => toggleCol(col.key)} className="accent-blue-600" />
                <span className="text-sm font-medium text-slate-700">{col.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">※ A4に収まるよう列数を調整してください（目安：7〜8列）</p>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}><X size={16} /> キャンセル</Button>
          <Button variant="assets" onClick={handlePrint}><Printer size={16} /> 印刷プレビュー</Button>
        </div>
      </div>
    </div>
  );
}

const createAssetEditForm = (asset) => ({
  maker: asset?.maker || '',
  name: asset?.name || '',
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

export default function AssetMasterScreen({ assets, suppliers, categories = [], onCreateCategory, onCreateAsset, onUpdateAsset, onUpdateParentAsset, onDeleteAsset, setView, onNavigateEntry, onNavigateHistory, onNavigateStock }) {
  const [filter, setFilter] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(() => createAssetEditForm(null));
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const filteredAssets = assets.filter(a =>
    a.name.includes(filter) ||
    a.maker.includes(filter) ||
    a.parentCategory.includes(filter) ||
    a.supplier.includes(filter) ||
    String(a.id).includes(filter)
  );
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
      setSaveError('メーカー、品名、使用単位は必須です。');
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
      <button
        onClick={() => setView('menu')}
        className="absolute top-3 right-3 rounded-full p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors z-10"
        title="閉じる"
      >
        <X size={20} />
      </button>
      <div className="mb-5 flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Asset Master</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">資産マスタ</h2>
        </div>
        <div className="flex items-center gap-3 mr-8">
          <Button variant="success" onClick={startCreate}>
            <PlusCircle size={18} /> 新規登録
          </Button>
          <Button variant="history" onClick={() => setView('history')}><ArrowLeftRight size={18} /> 入出庫</Button>
          <Button variant="stock" onClick={() => setView('stock')}><Table2 size={18} /> 在庫表</Button>
          <Button variant="assets" onClick={() => setShowPrintDialog(true)}><Printer size={18} /> 印刷</Button>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-2">
            <p className="text-xs font-bold text-slate-400">表示件数</p>
            <p className="text-lg font-black text-slate-800">{filteredAssets.length.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="mb-5 flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={18} />
          <input 
            type="text" 
            placeholder="ID・品名 (ヒンメイ) で検索..."
            className="w-full rounded-md border border-blue-200 bg-blue-50 py-2.5 pl-10 pr-4 text-sm font-medium shadow-inner outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={() => setFilter('')}>リセット</Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-auto rounded-lg border border-slate-200 shadow-sm">
          <table className="w-full text-left border-collapse min-w-[800px] text-sm">
            <thead className="bg-slate-100 sticky top-0">
              <tr>
                <th className="p-3 w-20">ID</th>
                <th className="p-3 w-40">メーカー</th>
                <th className="p-3 w-28">分類</th>
                <th className="p-3 min-w-[420px]">品名</th>
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
                      isSelected ? 'bg-blue-50 shadow-[inset_4px_0_0_#2563eb]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-3 font-mono text-slate-500">{asset.id}</td>
                    <td className="p-3 w-40 max-w-40 whitespace-normal break-words">{asset.maker}</td>
                    <td className="p-3 w-28 max-w-28 whitespace-normal break-words">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{asset.parentCategory}</span>
                    </td>
                    <td className="p-3 min-w-[420px] font-medium text-blue-700 whitespace-normal break-words">{asset.name}</td>
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
                  <Button variant="action" className="px-3 py-1 text-sm" onClick={startEdit}>
                    編集
                  </Button>
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

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-3 text-xs font-bold text-amber-700">大分類</p>
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
                        <button type="button" onClick={() => setShowNewCategory(true)} className="text-xs font-bold text-blue-600 hover:underline">
                          ＋ 新しい分類を追加
                        </button>
                      ) : (
                        <div className="rounded-md border border-blue-200 bg-white p-2 space-y-2">
                          <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="新しい分類名"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
                    <p className="mt-2 text-xs text-amber-700">
                      {isCreating ? '既存ジェネリック名を選ぶと、その親IDに子資産として追加されます。' : '同じ大分類に紐づく他の資産にも反映されます。'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <EditField label="購入単位" value={editForm.purchaseUnit} onChange={(value) => updateEditForm('purchaseUnit', value)} />
                    <EditField label="購入価格" type="number" value={editForm.deliveryPrice} onChange={(value) => updateEditForm('deliveryPrice', value)} align="right" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="入数" type="number" value={editForm.packSize} onChange={(value) => updateEditForm('packSize', value)} align="right" />
                    <EditField label="使用単位" value={editForm.usageUnit} onChange={(value) => updateEditForm('usageUnit', value)} />
                    <DetailItem label="使用単価" value={`¥${(selectedAsset?.usageUnitPrice || 0).toLocaleString()}`} align="right" />
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
                    <DetailItem label="使用単位" value={selectedAsset.usageUnit || '-'} />
                    <DetailItem label="使用単価" value={`¥${selectedAsset.usageUnitPrice.toLocaleString()}`} align="right" />
                  </div>

                  <div className="space-y-2 border-t border-slate-200 pt-4">
                    <DetailRow label="分類" value={selectedAsset.parentCategory || '-'} />
                    <DetailRow label="大分類名" value={selectedAsset.parentGenericName || '-'} />
                    <DetailRow label="摘要" value={selectedAsset.memo || '-'} />
                  </div>

                  <div className="flex flex-col gap-2 border-t border-slate-200 pt-4">
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="success" className="w-full px-3 py-2 text-sm" onClick={() => onNavigateEntry('in', selectedAsset?.id)} disabled={!selectedAsset}>
                        <LogIn size={16} /> 入庫
                      </Button>
                      <Button variant="danger" className="w-full px-3 py-2 text-sm bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" onClick={() => onNavigateEntry('out', selectedAsset?.id)} disabled={!selectedAsset}>
                        <LogOut size={16} /> 出庫
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button className="w-full px-3 py-2 text-sm bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" onClick={() => onNavigateHistory?.(selectedAsset?.id)} disabled={!selectedAsset}>
                        <ArrowLeftRight size={16} /> 入出庫
                      </Button>
                      <Button className="w-full px-3 py-2 text-sm bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200" onClick={() => onNavigateStock?.(selectedAsset?.id)} disabled={!selectedAsset}>
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
