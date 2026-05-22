import React, { useEffect, useState } from 'react';

import { Button } from './components/ui.jsx';
import { clearStoredSession, getStoredSession, loadInventoryData, signInWithPassword, signOut, storeSession, supabaseRequest } from './lib/supabase.js';
import { getNextParentId, normalizeAsset, normalizeMovement, toNumber } from './utils/inventory.js';
import AssetMasterScreen from './screens/AssetMasterScreen.jsx';
import BackupScreen from './screens/BackupScreen.jsx';
import EntryScreen from './screens/EntryScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import MenuScreen from './screens/MenuScreen.jsx';
import MovementHistoryScreen from './screens/MovementHistoryScreen.jsx';
import StockStatusScreen from './screens/StockStatusScreen.jsx';
import { performBackup, shouldRunAutoBackup } from './lib/backup.js';

export default function App() {
  const [view, setView] = useState('menu');
  const [authSession, setAuthSession] = useState(() => getStoredSession());
  const [assets, setAssets] = useState([]);
  const [movements, setMovements] = useState([]);
  const [staff, setStaff] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(() => Boolean(getStoredSession()));
  const [error, setError] = useState('');

  const refreshData = async () => {
    if (!authSession) return;
    setError('');
    const data = await loadInventoryData(authSession);
    setAssets(data.assets);
    setMovements(data.movements);
    setStaff(data.staff);
    setSuppliers(data.suppliers);
    setCategories(data.categories || []);
  };

  useEffect(() => {
    let isMounted = true;

    if (!authSession) {
      setAssets([]);
      setMovements([]);
      setStaff([]);
      setSuppliers([]);
      setCategories([]);
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setIsLoading(true);
    loadInventoryData(authSession)
      .then((data) => {
        if (!isMounted) return;
        setAssets(data.assets);
        setMovements(data.movements);
        setStaff(data.staff);
        setSuppliers(data.suppliers);
        setCategories(data.categories || []);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authSession]);

  // Auto-backup on startup: only if >=24h since last backup.
  useEffect(() => {
    if (!authSession) return;
    if (shouldRunAutoBackup()) {
      performBackup(authSession, { downloadLocal: false }).catch((err) => {
        console.warn('[auto-backup] failed:', err.message);
      });
    }
  }, [authSession]);

  const handleLogin = async (email, password) => {
    const session = await signInWithPassword(email, password);
    storeSession(session);
    setAuthSession(session);
  };

  const handleLogout = async () => {
    await signOut(authSession).catch(() => {});
    clearStoredSession();
    setAuthSession(null);
    setView('menu');
  };
  
  const addMovement = async (data) => {
    const asset = assets.find((item) => item.id === data.assetId);
    const staffMember = staff.find((member) => member.id === data.staffId);
    const actualDeliveryPrice = Number(data.actualDeliveryPrice ?? asset?.deliveryPrice ?? 0);

    const [created] = await supabaseRequest(
      'invent_stock_movements?select=*',
      {
        method: 'POST',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          child_asset_id: Number(data.assetId),
          movement_date: data.date,
          movement_type: data.type,
          quantity: Number(data.quantity),
          actual_delivery_price: data.type === 'in' ? actualDeliveryPrice : 0,
          expiration_date: data.expirationDate || null,
          lot_number: data.lotNumber || null,
          staff_code: staffMember ? Number(staffMember.id) : null,
          staff_name: staffMember?.name || null,
          memo: data.memo || null,
        }),
      },
      authSession
    );

    const staffMap = new Map(staff.map((member) => [Number(member.id), member]));
    setMovements(prev => [normalizeMovement(created, staffMap), ...prev]);

    if (data.updateMasterDeliveryPrice && asset && actualDeliveryPrice !== asset.deliveryPrice) {
      await updateAsset(asset.id, { delivery_price: actualDeliveryPrice });
    }

    clearEntryState();
    setView('history');
  };

  const performYearEndUpdate = async () => {
    // 年度更新前に自動バックアップ（Supabase Storage + ローカルDL）
    await performBackup(authSession);

    // 各資産の期末在庫を算出
    const inboundByAsset = new Map();
    const outboundByAsset = new Map();
    movements.forEach((m) => {
      const key = String(m.assetId);
      const qty = Number(m.quantity) || 0;
      if (m.type === 'in') {
        inboundByAsset.set(key, (inboundByAsset.get(key) || 0) + qty);
      } else if (m.type === 'out') {
        outboundByAsset.set(key, (outboundByAsset.get(key) || 0) + qty);
      }
    });

    // 各資産の opening_stock を期末在庫で更新
    const updates = assets.map((asset) => {
      const key = String(asset.id);
      const ending = Number(asset.openingStock || 0)
        + (inboundByAsset.get(key) || 0)
        - (outboundByAsset.get(key) || 0);
      return { id: asset.id, newOpeningStock: ending };
    });

    for (const { id, newOpeningStock } of updates) {
      await supabaseRequest(
        `invent_child_assets?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ opening_stock: newOpeningStock }),
        },
        authSession
      );
    }

    // 全 movements を削除
    await supabaseRequest(
      `invent_stock_movements?id=gte.0`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
      authSession
    );

    // フロント側 state を更新
    setAssets((prev) => prev.map((a) => {
      const u = updates.find((x) => String(x.id) === String(a.id));
      return u ? { ...a, openingStock: u.newOpeningStock } : a;
    }));
    setMovements([]);
  };

  const deleteMovement = async (id) => {
    await supabaseRequest(
      `invent_stock_movements?id=eq.${id}`,
      {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal',
        },
      },
      authSession
    );
    setMovements(prev => prev.filter(m => m.id !== id));
  };

  const updateMovement = async (id, data) => {
    const [updated] = await supabaseRequest(
      `invent_stock_movements?id=eq.${id}&select=*`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify(data),
      },
      authSession
    );

    if (!updated) {
      throw new Error('入出庫データを更新できませんでした。データが見つからないか、変更権限がない可能性があります。');
    }

    const staffMap = new Map(staff.map((member) => [Number(member.id), member]));
    const normalized = normalizeMovement(updated, staffMap);
    setMovements(prev => prev.map(m => (
      String(m.id) === String(normalized.id) ? normalized : m
    )));
    return normalized;
  };

  const createCategory = async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('分類名を入力してください。');
    const existing = categories.find(c => c.name === trimmed);
    if (existing) return existing;

    const maxOrder = categories
      .filter(c => c.displayOrder < 9000)
      .reduce((max, c) => Math.max(max, c.displayOrder), 0);
    const nextOrder = maxOrder + 10;

    const [created] = await supabaseRequest(
      'invent_categories?select=*',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name: trimmed, display_order: nextOrder }),
      },
      authSession
    );

    const normalized = { id: created.id, name: created.name, displayOrder: created.display_order };
    setCategories(prev => [...prev, normalized].sort((a, b) => a.displayOrder - b.displayOrder));
    return normalized;
  };

  const createAsset = async (data) => {
    let parent = data.parentId
      ? assets.find(asset => asset.parentId === data.parentId)
      : assets.find(asset =>
          asset.categoryId === data.categoryId &&
          asset.parentGenericName === data.parentGenericName
        );

    if (!parent) {
      const parentRows = await supabaseRequest(
        'invent_parent_assets?select=id&order=id.desc&limit=1',
        {},
        authSession
      );
      const nextParentId = getNextParentId(parentRows.map(row => ({ parentId: row.id })));

      const categoryName = categories.find(c => c.id === data.categoryId)?.name || '';

      const [createdParent] = await supabaseRequest(
        'invent_parent_assets?select=*',
        {
          method: 'POST',
          headers: {
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            id: nextParentId,
            category: categoryName,
            category_id: data.categoryId,
            generic_name: data.parentGenericName || null,
            safety_stock: null,
          }),
        },
        authSession
      );
      parent = {
        parentId: createdParent.id,
        categoryId: createdParent.category_id,
        parentCategory: createdParent.category,
        parentGenericName: createdParent.generic_name,
      };
    }

    const [createdAsset] = await supabaseRequest(
      'invent_child_assets?select=*',
      {
        method: 'POST',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          parent_id: parent.parentId,
          maker: data.maker,
          brand_name: data.name,
          kana_name: null,
          opening_stock: 0,
          delivery_price: data.deliveryPrice,
          purchase_unit: data.purchaseUnit || null,
          pack_size: data.packSize,
          usage_unit: data.usageUnit || null,
          supplier_id: data.supplierId,
          jan_code: data.janCode || null,
          child_memo: data.memo || null,
          is_active: true,
        }),
      },
      authSession
    );

    const parentMap = new Map([
      [parent.parentId, {
        id: parent.parentId,
        category: parent.parentCategory,
        category_id: parent.categoryId,
        generic_name: parent.parentGenericName,
      }],
    ]);
    const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    const categoryMap = new Map(categories.map((cat) => [cat.id, { id: cat.id, name: cat.name, display_order: cat.displayOrder }]));
    const normalized = normalizeAsset(createdAsset, parentMap, supplierMap, categoryMap);
    setAssets(prev => [...prev, normalized].sort((a, b) => Number(a.id) - Number(b.id)));
    return normalized;
  };

  const deleteAsset = async (assetId) => {
    await supabaseRequest(
      `invent_child_assets?id=eq.${assetId}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ is_active: false }),
      },
      authSession
    );
    setAssets(prev => prev.filter(asset => asset.id !== String(assetId)));
  };

  const updateAsset = async (assetId, data) => {
    const [updated] = await supabaseRequest(
      `invent_child_assets?id=eq.${assetId}&select=*`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify(data),
      },
      authSession
    );

    if (!updated) {
      throw new Error('資産を更新できませんでした。データが見つからないか、変更権限がない可能性があります。');
    }

    setAssets(prev => prev.map(asset => {
      if (asset.id !== String(updated.id)) return asset;

      const supplier = suppliers.find(item => Number(item.id) === Number(updated.supplier_id));

      return {
        ...asset,
        maker: updated.maker,
        name: updated.brand_name,
        kanaName: updated.kana_name || '',
        packSize: toNumber(updated.pack_size || 1),
        deliveryPrice: toNumber(updated.delivery_price),
        usageUnitPrice: toNumber(updated.usage_unit_price),
        usageUnit: updated.usage_unit,
        purchaseUnit: updated.purchase_unit || '',
        supplierId: updated.supplier_id ? String(updated.supplier_id) : '',
        supplier: supplier?.name || '',
        janCode: updated.jan_code || '',
        memo: updated.child_memo || '',
      };
    }));
  };

  const updateParentAsset = async (parentId, data) => {
    const [updated] = await supabaseRequest(
      `invent_parent_assets?id=eq.${encodeURIComponent(parentId)}&select=*`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify(data),
      },
      authSession
    );

    if (!updated) {
      throw new Error('大分類を更新できませんでした。データが見つからないか、変更権限がない可能性があります。');
    }

    const cat = categories.find(c => c.id === updated.category_id);
    const categoryName = cat?.name || updated.category || '';

    setAssets(prev => prev.map(asset => (
      asset.parentId === updated.id
        ? {
            ...asset,
            category: categoryName,
            categoryId: updated.category_id,
            categoryOrder: cat?.displayOrder ?? 9999,
            parentCategory: categoryName,
            parentGenericName: updated.generic_name,
          }
        : asset
    )));
  };

  const [entryAssetId, setEntryAssetId] = useState(null);
  const [filterAssetId, setFilterAssetId] = useState('');
  const [savedEntryForm, setSavedEntryForm] = useState(null);

  const navigateToHistory = (assetId) => {
    setFilterAssetId(assetId || '');
    setView('history');
  };

  const navigateToStock = (assetId) => {
    setFilterAssetId(assetId || '');
    setView('stock');
  };

  const navigateToEntry = (type, assetId) => {
    setEntryAssetId(assetId || null);
    setView(type === 'in' ? 'inbound' : 'outbound');
  };

  const clearEntryState = () => {
    setEntryAssetId(null);
    setSavedEntryForm(null);
  };

  const renderView = () => {
    switch (view) {
      case 'menu': return <MenuScreen setView={setView} onLogout={handleLogout} userEmail={authSession?.user?.email} onYearEndUpdate={performYearEndUpdate} />;
      case 'assets': return <AssetMasterScreen assets={assets} suppliers={suppliers} categories={categories} onCreateCategory={createCategory} onCreateAsset={createAsset} onUpdateAsset={updateAsset} onUpdateParentAsset={updateParentAsset} onDeleteAsset={deleteAsset} setView={setView} onNavigateEntry={navigateToEntry} onNavigateHistory={navigateToHistory} onNavigateStock={navigateToStock} />;
      case 'history': return <MovementHistoryScreen movements={movements} setMovements={setMovements} setView={setView} assets={assets} staff={staff} updateMovement={updateMovement} deleteMovement={deleteMovement} pinnedAssetId={filterAssetId} />;
      case 'inbound': return <EntryScreen type="in" onSave={addMovement} onCancel={() => { clearEntryState(); setView('menu'); }} assets={assets} movements={movements} staff={staff} setView={setView} initialAssetId={entryAssetId} savedEntryForm={savedEntryForm} onSaveForm={setSavedEntryForm} />;
      case 'outbound': return <EntryScreen type="out" onSave={addMovement} onCancel={() => { clearEntryState(); setView('menu'); }} assets={assets} movements={movements} staff={staff} setView={setView} initialAssetId={entryAssetId} savedEntryForm={savedEntryForm} onSaveForm={setSavedEntryForm} />;
      case 'stock': return <StockStatusScreen assets={assets} movements={movements} setView={setView} pinnedAssetId={filterAssetId} />;
      case 'backup': return <BackupScreen session={authSession} setView={setView} onRestored={refreshData} />;
      default: return <MenuScreen setView={setView} onLogout={handleLogout} userEmail={authSession?.user?.email} onYearEndUpdate={performYearEndUpdate} />;
    }
  };

  if (!authSession) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {isLoading && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 font-bold text-blue-700">
            Supabaseからデータを読み込んでいます...
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="font-bold">データ接続エラー</div>
            <div className="text-sm">{error}</div>
            <Button variant="secondary" className="mt-3" onClick={refreshData}>再読み込み</Button>
          </div>
        )}
        {renderView()}
      </div>
    </div>
  );
}
