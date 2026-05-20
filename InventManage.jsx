import React, { useEffect, useState } from 'react';

import { Button } from './components/ui.jsx';
import { clearStoredSession, getStoredSession, loadInventoryData, signInWithPassword, signOut, storeSession, supabaseRequest } from './lib/supabase.js';
import { getNextParentId, normalizeAsset, normalizeMovement, toNumber } from './utils/inventory.js';
import AssetMasterScreen from './screens/AssetMasterScreen.jsx';
import EntryScreen from './screens/EntryScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import MenuScreen from './screens/MenuScreen.jsx';
import MovementHistoryScreen from './screens/MovementHistoryScreen.jsx';
import StockStatusScreen from './screens/StockStatusScreen.jsx';

export default function App() {
  const [view, setView] = useState('menu');
  const [authSession, setAuthSession] = useState(() => getStoredSession());
  const [assets, setAssets] = useState([]);
  const [movements, setMovements] = useState([]);
  const [staff, setStaff] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
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
  };

  useEffect(() => {
    let isMounted = true;

    if (!authSession) {
      setAssets([]);
      setMovements([]);
      setStaff([]);
      setSuppliers([]);
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
          actual_delivery_price: data.type === 'in' ? actualDeliveryPrice : null,
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

    setView('history');
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

    const staffMap = new Map(staff.map((member) => [Number(member.id), member]));
    const normalized = normalizeMovement(updated, staffMap);
    setMovements(prev => prev.map(m => (
      String(m.id) === String(normalized.id) ? normalized : m
    )));
    return normalized;
  };

  const createAsset = async (data) => {
    let parent = data.parentId
      ? assets.find(asset => asset.parentId === data.parentId)
      : assets.find(asset =>
          asset.parentCategory === data.parentCategory &&
          asset.parentGenericName === data.parentGenericName
        );

    if (!parent) {
      const parentRows = await supabaseRequest(
        'invent_parent_assets?select=id&order=id.desc&limit=1',
        {},
        authSession
      );
      const nextParentId = getNextParentId(parentRows.map(row => ({ parentId: row.id })));

      const [createdParent] = await supabaseRequest(
        'invent_parent_assets?select=*',
        {
          method: 'POST',
          headers: {
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            id: nextParentId,
            category: data.parentCategory,
            generic_name: data.parentGenericName,
            safety_stock: null,
          }),
        },
        authSession
      );
      parent = {
        parentId: createdParent.id,
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
        generic_name: parent.parentGenericName,
      }],
    ]);
    const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    const normalized = normalizeAsset(createdAsset, parentMap, supplierMap);
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

    setAssets(prev => prev.map(asset => (
      asset.parentId === updated.id
        ? {
            ...asset,
            category: updated.category,
            parentCategory: updated.category,
            parentGenericName: updated.generic_name,
          }
        : asset
    )));
  };

  const renderView = () => {
    switch (view) {
      case 'menu': return <MenuScreen setView={setView} onLogout={handleLogout} userEmail={authSession?.user?.email} />;
      case 'assets': return <AssetMasterScreen assets={assets} suppliers={suppliers} onCreateAsset={createAsset} onUpdateAsset={updateAsset} onUpdateParentAsset={updateParentAsset} onDeleteAsset={deleteAsset} setView={setView} />;
      case 'history': return <MovementHistoryScreen movements={movements} setMovements={setMovements} setView={setView} assets={assets} staff={staff} updateMovement={updateMovement} deleteMovement={deleteMovement} />;
      case 'inbound': return <EntryScreen type="in" onSave={addMovement} onCancel={() => setView('menu')} assets={assets} movements={movements} staff={staff} setView={setView} />;
      case 'outbound': return <EntryScreen type="out" onSave={addMovement} onCancel={() => setView('menu')} assets={assets} movements={movements} staff={staff} setView={setView} />;
      case 'stock': return <StockStatusScreen assets={assets} movements={movements} setView={setView} />;
      default: return <MenuScreen setView={setView} onLogout={handleLogout} userEmail={authSession?.user?.email} />;
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
