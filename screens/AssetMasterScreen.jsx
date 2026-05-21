import React, { useEffect, useMemo, useState } from 'react';
import { LogIn, LogOut, PlusCircle, Printer, Search, Trash2, X } from 'lucide-react';

import { Button, Card, DetailItem, DetailRow, EditField } from '../components/ui.jsx';
import { toNullableNumber } from '../utils/inventory.js';

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
  parentCategory: asset?.parentCategory || '',
  parentGenericName: asset?.parentGenericName || '',
});

export default function AssetMasterScreen({ assets, suppliers, onCreateAsset, onUpdateAsset, onUpdateParentAsset, onDeleteAsset, setView, onNavigateEntry }) {
  const [filter, setFilter] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(() => createAssetEditForm(null));
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
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
      parentCategory: parent?.category || '',
      parentGenericName: parent?.genericName || '',
    }));
  };

  const updateNewParentField = (key, value) => {
    setEditForm(prev => ({ ...prev, parentId: '', [key]: value }));
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

    if (!editForm.parentCategory.trim() || !editForm.parentGenericName.trim()) {
      setSaveError('分類と大分類名は必須です。');
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
          parentCategory: editForm.parentCategory.trim(),
          parentGenericName: editForm.parentGenericName.trim(),
        });
        setSelectedAssetId(created.id);
        setIsCreating(false);
        setIsEditing(false);
        return;
      }

      await onUpdateParentAsset(selectedAsset.parentId, {
        category: editForm.parentCategory.trim(),
        generic_name: editForm.parentGenericName.trim(),
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
    <Card className="max-h-[90vh] flex flex-col bg-white">
      <div className="mb-5 flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Asset Master</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">資産マスタ</h2>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="success" onClick={startCreate}>
            <PlusCircle size={18} /> 新規登録
          </Button>
          <Button variant="primary"><Printer size={18} /> 一覧印刷</Button>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-2">
            <p className="text-xs font-bold text-slate-400">表示件数</p>
            <p className="text-lg font-black text-slate-800">{filteredAssets.length.toLocaleString()}</p>
          </div>
          <button
            onClick={() => setView('menu')}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="閉じる"
          >
            <X size={22} />
          </button>
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
                      <EditField label="分類" value={editForm.parentCategory} onChange={(value) => updateNewParentField('parentCategory', value)} />
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
                        label="大分類名"
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

                  <div className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-4">
                    <Button variant="success" className="w-full px-3 py-2 text-sm" onClick={() => onNavigateEntry('in', selectedAsset?.id)} disabled={!selectedAsset}>
                      <LogIn size={16} /> 入庫
                    </Button>
                    <Button variant="danger" className="w-full px-3 py-2 text-sm bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" onClick={() => onNavigateEntry('out', selectedAsset?.id)} disabled={!selectedAsset}>
                      <LogOut size={16} /> 出庫
                    </Button>
                    <Button variant="secondary" className="w-full px-3 py-2 text-sm" onClick={deleteSelectedAsset} disabled={!selectedAsset || isSaving}>
                      <Trash2 size={16} /> 削除
                    </Button>
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

    </Card>
  );
}
