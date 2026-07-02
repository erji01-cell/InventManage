import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from './components/ui.jsx';
import { clearStoredSession, getStoredSession, loadInventoryData, signInWithPassword, signOut, storeSession, supabaseRequest } from './lib/supabase.js';
import { fiscalStartYearOf, getNextParentId, isMovementAfterClose, normalizeAsset, normalizeMovement, toNumber } from './utils/inventory.js';
import AssetMasterScreen from './screens/AssetMasterScreen.jsx';
import BackupScreen from './screens/BackupScreen.jsx';
import EntryScreen from './screens/EntryScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import MenuScreen from './screens/MenuScreen.jsx';
import MovementHistoryScreen from './screens/MovementHistoryScreen.jsx';
import StockStatusScreen from './screens/StockStatusScreen.jsx';
import StocktakingScreen from './screens/StocktakingScreen.jsx';
import { performBackup, shouldRunAutoBackup } from './lib/backup.js';

export default function App() {
  const [view, setView] = useState('menu');
  const [authSession, setAuthSession] = useState(() => getStoredSession());
  const [assets, setAssets] = useState([]);
  const [movements, setMovements] = useState([]);
  const [staff, setStaff] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fiscalSnapshots, setFiscalSnapshots] = useState([]);
  const [isLoading, setIsLoading] = useState(() => Boolean(getStoredSession()));
  const [error, setError] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false); // 棚卸し/年度更新/バックアップの共通解放フラグ

  // 認証切れ（リフレッシュトークン失効）はエラー表示ではなくログイン画面に戻す
  const handleAuthExpired = () => {
    clearStoredSession();
    setAuthSession(null);
    setIsAdminUnlocked(false);
    setView('menu');
  };

  const refreshData = async () => {
    if (!authSession) return;
    setError('');
    try {
      const data = await loadInventoryData(authSession);
      setAssets(data.assets);
      setMovements(data.movements);
      setStaff(data.staff);
      setSuppliers(data.suppliers);
      setCategories(data.categories || []);
      setFiscalSnapshots(data.fiscalSnapshots || []);
    } catch (err) {
      if (err?.code === 'AUTH_EXPIRED') {
        handleAuthExpired();
        return;
      }
      throw err;
    }
  };

  // フォーカス時自動更新のスロットル用（直近のフルロード時刻と実行中フラグ）
  const lastFocusRefreshRef = useRef(Date.now());
  const focusRefreshBusyRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    if (!authSession) {
      setAssets([]);
      setMovements([]);
      setStaff([]);
      setSuppliers([]);
      setCategories([]);
      setFiscalSnapshots([]);
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
        setFiscalSnapshots(data.fiscalSnapshots || []);
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err?.code === 'AUTH_EXPIRED') {
          handleAuthExpired();
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        lastFocusRefreshRef.current = Date.now();
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authSession]);

  // ウィンドウにフォーカスが戻ったらデータを再読み込み（複数PC運用での鮮度対策）。
  // 直近のロードから1分以内なら何もしない。失敗しても画面は変えず次回に任せる。
  useEffect(() => {
    if (!authSession) return;
    const FOCUS_REFRESH_MIN_MS = 60 * 1000;
    const handleFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (focusRefreshBusyRef.current) return;
      if (Date.now() - lastFocusRefreshRef.current < FOCUS_REFRESH_MIN_MS) return;
      lastFocusRefreshRef.current = Date.now();
      focusRefreshBusyRef.current = true;
      refreshData()
        .catch((err) => console.warn('[focus-refresh] 再読み込みに失敗:', err?.message))
        .finally(() => {
          focusRefreshBusyRef.current = false;
        });
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [authSession]);

  // Auto-backup on startup: only if >=24h since last backup.
  useEffect(() => {
    if (!authSession) return;
    let cancelled = false;
    (async () => {
      try {
        const shouldRun = await shouldRunAutoBackup(authSession);
        if (!cancelled && shouldRun) {
          await performBackup(authSession, { downloadLocal: false });
        }
      } catch (err) {
        console.warn('[auto-backup] failed:', err.message);
      }
    })();
    return () => {
      cancelled = true;
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
    setIsAdminUnlocked(false); // ログアウトでロック復活
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
    // 登録後は画面遷移せず、その場に留まる（フォームのリセットはEntryScreen側で実施）
  };

  const fetchLastStocktaking = async () => {
    if (!authSession) return null;
    try {
      const rows = await supabaseRequest(
        'invent_inventory_counts?select=*&status=eq.completed&order=completed_at.desc&limit=1',
        {},
        authSession
      );
      return rows[0] || null;
    } catch {
      return null;
    }
  };

  const performYearEndUpdate = async (endDate) => {
    if (!endDate) {
      throw new Error('期末日を指定してください。');
    }
    // 年度更新前に自動バックアップ（Supabase Storage + ローカルDL）
    await performBackup(authSession);

    // 期末日までの入出庫だけを集計（過去のクローズ日も考慮）
    const assetMapForClose = new Map(assets.map((a) => [a.id, a]));
    const inboundByAsset = new Map();
    const outboundByAsset = new Map();
    movements.forEach((m) => {
      const md = String(m.date || '').replaceAll('/', '-');
      if (!md || md > endDate) return; // 期末日より後はスキップ
      const asset = assetMapForClose.get(m.assetId);
      // 既にクローズされている期間の入出庫は二重カウントしない
      if (asset?.fiscalYearClosedAt && md <= asset.fiscalYearClosedAt) return;
      const key = String(m.assetId);
      const qty = Number(m.quantity) || 0;
      if (m.type === 'in') {
        inboundByAsset.set(key, (inboundByAsset.get(key) || 0) + qty);
      } else if (m.type === 'out') {
        outboundByAsset.set(key, (outboundByAsset.get(key) || 0) + qty);
      }
    });

    // 各資産の opening_stock を「期末日時点の在庫」で更新 + fiscal_year_closed_at をセット
    const updates = assets.map((asset) => {
      const key = String(asset.id);
      const opening = Number(asset.openingStock || 0); // 締める年度の期首在庫
      const ending = opening
        + (inboundByAsset.get(key) || 0)
        - (outboundByAsset.get(key) || 0);
      return { id: asset.id, opening, newOpeningStock: ending };
    });

    const closedFiscalYear = fiscalStartYearOf(endDate);

    // スナップショット保存と期首在庫更新はDB関数 invent_year_end_update が
    // 単一トランザクションで実行する（全成功 or 全失敗。途中で止まる事故を防ぐ）。
    // 事故防止のため、まず dry_run で計算だけ行い、上のクライアント計算と
    // 全件一致することを確認してから本実行する。
    const callYearEndRpc = async (dryRun) => {
      try {
        return await supabaseRequest(
          'rpc/invent_year_end_update',
          {
            method: 'POST',
            body: JSON.stringify({ end_date: endDate, dry_run: dryRun }),
          },
          authSession
        );
      } catch (err) {
        if (/could not find the function|schema cache/i.test(err?.message || '')) {
          throw new Error(
            '年度更新のDB関数が未導入です。outputs/supabase_migration/year_end_update_rpc.sql を' +
            'SupabaseのSQL Editorで実行してから、もう一度年度更新を行ってください（データは変更されていません）。'
          );
        }
        throw err;
      }
    };

    const dryRunResult = await callYearEndRpc(true);
    const rpcRows = new Map((dryRunResult?.rows || []).map((r) => [String(r.id), r]));
    const diffs = [];
    if (rpcRows.size !== updates.length) {
      diffs.push(`対象件数が不一致（アプリ計算 ${updates.length} 件 / DB計算 ${rpcRows.size} 件）`);
    }
    for (const u of updates) {
      const r = rpcRows.get(String(u.id));
      if (!r) {
        diffs.push(`ID ${u.id}: DB計算に存在しません`);
      } else if (Number(r.opening) !== u.opening || Number(r.closing) !== u.newOpeningStock) {
        diffs.push(`ID ${u.id}: アプリ計算 期首${u.opening}→期末${u.newOpeningStock} / DB計算 期首${r.opening}→期末${r.closing}`);
      }
      if (diffs.length >= 6) break;
    }
    if (diffs.length > 0) {
      throw new Error(
        `年度更新を中止しました。アプリ計算とDB計算が一致しません（データは変更されていません）:\n${diffs.slice(0, 5).join('\n')}`
      );
    }

    await callYearEndRpc(false);

    // ⚠ movements は削除しない（過去の履歴を全期間保持）

    // フロント側 state を更新
    setAssets((prev) => prev.map((a) => {
      const u = updates.find((x) => String(x.id) === String(a.id));
      return u ? { ...a, openingStock: u.newOpeningStock, fiscalYearClosedAt: endDate } : a;
    }));

    // スナップショットを再読み込みして state へ反映
    if (closedFiscalYear != null) {
      try {
        const rows = await supabaseRequest(
          'invent_fiscal_snapshots?select=*&order=id.asc',
          {},
          authSession
        );
        setFiscalSnapshots((rows || []).map((s) => ({
          id: s.id,
          assetId: String(s.child_asset_id),
          fiscalYear: Number(s.fiscal_year),
          openingStock: Number(s.opening_stock) || 0,
          closingStock: Number(s.closing_stock) || 0,
          closedAt: s.closed_at || null,
        })));
      } catch {
        /* 取得失敗時は次回ロードで反映 */
      }
    }
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
        fiscalYearClosedAt: updated.fiscal_year_closed_at || null,
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
  const [assetPickerRequest, setAssetPickerRequest] = useState(null);
  const [movementAssetSelection, setMovementAssetSelection] = useState(null);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(null); // 閲覧する会計年度の開始年（例: 2024 = 2024/7〜2025/6）

  const navigateToHistory = (assetId) => {
    setFilterAssetId(assetId || '');
    setView('history');
  };

  const navigateToStock = (assetId) => {
    setFilterAssetId(assetId || '');
    setView('stock');
  };

  const navigateToAssets = (assetId) => {
    setAssetPickerRequest(null);
    setFilterAssetId(assetId || '');
    setView('assets');
  };

  const navigateFromMenu = (nextView) => {
    if (nextView === 'assets') {
      setAssetPickerRequest(null);
      setFilterAssetId('');
    }
    setView(nextView);
  };

  const navigateToAssetPickerFromMovement = (movementId, form, assetId) => {
    setAssetPickerRequest({
      source: 'movementHistory',
      movementId,
      form,
    });
    setFilterAssetId(assetId || form?.assetId || '');
    setView('assets');
  };

  const navigateToAssetPickerFromEntry = (entryType, form, assetId) => {
    setAssetPickerRequest({
      source: 'entry',
      entryType,
      form,
    });
    setSavedEntryForm(form || null);
    setFilterAssetId(assetId || form?.assetId || '');
    setView('assets');
  };

  const pickAssetFromPicker = (assetId) => {
    if (assetPickerRequest?.source === 'movementHistory') {
      setMovementAssetSelection({
        ...assetPickerRequest,
        selectedAssetId: String(assetId),
        requestId: Date.now(),
      });
      setAssetPickerRequest(null);
      setFilterAssetId('');
      setView('history');
      return;
    }

    if (assetPickerRequest?.source === 'entry') {
      const selectedAssetId = String(assetId);
      setSavedEntryForm({
        ...(assetPickerRequest.form || {}),
        assetId: selectedAssetId,
      });
      setEntryAssetId(selectedAssetId);
      setAssetPickerRequest(null);
      setFilterAssetId('');
      setView(assetPickerRequest.entryType === 'out' ? 'outbound' : 'inbound');
    }
  };

  const cancelAssetPicker = () => {
    if (assetPickerRequest?.source === 'movementHistory') {
      setMovementAssetSelection({
        ...assetPickerRequest,
        selectedAssetId: assetPickerRequest.form?.assetId || '',
        requestId: Date.now(),
      });
      setAssetPickerRequest(null);
      setFilterAssetId('');
      setView('history');
      return;
    }

    if (assetPickerRequest?.source === 'entry') {
      setSavedEntryForm(assetPickerRequest.form || null);
      setEntryAssetId(assetPickerRequest.form?.assetId || null);
      setAssetPickerRequest(null);
      setFilterAssetId('');
      setView(assetPickerRequest.entryType === 'out' ? 'outbound' : 'inbound');
      return;
    }

    setAssetPickerRequest(null);
    setFilterAssetId('');
  };

  const navigateToEntry = (type, assetId) => {
    setEntryAssetId(assetId || null);
    setView(type === 'in' ? 'inbound' : 'outbound');
  };

  const clearEntryState = () => {
    setEntryAssetId(null);
    setSavedEntryForm(null);
  };

  const latestFiscalYearClosedAt = assets.reduce((latest, asset) => {
    const closedAt = asset.fiscalYearClosedAt || '';
    return closedAt > latest ? closedAt : latest;
  }, '');

  // 現在（アクティブ）年度の開始年。直近のクローズ日があればその翌期、なければ今日基準。
  const currentFiscalStartYear = useMemo(() => {
    if (latestFiscalYearClosedAt) {
      const [year, month] = String(latestFiscalYearClosedAt).split('-').map(Number);
      return month >= 7 ? year + 1 : year;
    }
    const now = new Date();
    return now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  }, [latestFiscalYearClosedAt]);

  // 現在庫がマイナスの資産を抽出（起動時の警告バナー用）。
  // 現在庫 = opening_stock + 年度クローズ日より後の入庫 − 出庫（在庫表と同じ計算）。
  const negativeStockAssets = useMemo(() => {
    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const inByAsset = new Map();
    const outByAsset = new Map();
    movements.forEach((m) => {
      const asset = assetMap.get(m.assetId);
      if (!asset) return;
      if (!isMovementAfterClose(m.date, asset.fiscalYearClosedAt || null)) return;
      const qty = Number(m.quantity) || 0;
      if (m.type === 'in') inByAsset.set(m.assetId, (inByAsset.get(m.assetId) || 0) + qty);
      else if (m.type === 'out') outByAsset.set(m.assetId, (outByAsset.get(m.assetId) || 0) + qty);
    });
    return assets
      .map((a) => ({
        id: a.id,
        name: a.name,
        usageUnit: a.usageUnit,
        currentStock: Number(a.openingStock || 0) + (inByAsset.get(a.id) || 0) - (outByAsset.get(a.id) || 0),
      }))
      .filter((x) => x.currentStock < 0)
      .sort((a, b) => a.currentStock - b.currentStock); // マイナスが大きい順
  }, [assets, movements]);

  // 入出庫データに存在する会計年度（+現在年度）を昇順で。タブ生成に使用。
  const availableFiscalYears = useMemo(() => {
    const set = new Set();
    movements.forEach((m) => {
      const [y, mo] = String(m.date || '').replaceAll('/', '-').split('-').map(Number);
      if (!y || !mo) return;
      set.add(mo >= 7 ? y : y - 1);
    });
    set.add(currentFiscalStartYear);
    return Array.from(set).sort((a, b) => a - b);
  }, [movements, currentFiscalStartYear]);

  // 既定は現在年度。ユーザーが過去年度を選んだら維持。
  useEffect(() => {
    if (selectedFiscalYear == null && currentFiscalStartYear != null) {
      setSelectedFiscalYear(currentFiscalStartYear);
    }
  }, [currentFiscalStartYear, selectedFiscalYear]);

  // 選択中年度の日付レンジ（入出庫データ・在庫表の絞り込み用）
  const historyFiscalRange = useMemo(() => (
    selectedFiscalYear != null ? {
      startYear: selectedFiscalYear,
      from: `${selectedFiscalYear}-07-01`,
      to: `${selectedFiscalYear + 1}-06-30`,
      isCurrent: selectedFiscalYear === currentFiscalStartYear,
    } : null
  ), [selectedFiscalYear, currentFiscalStartYear]);

  const renderView = () => {
    switch (view) {
      case 'menu': return <MenuScreen setView={navigateFromMenu} onLogout={handleLogout} userEmail={authSession?.user?.email} onYearEndUpdate={performYearEndUpdate} onFetchLastStocktaking={fetchLastStocktaking} isAdminUnlocked={isAdminUnlocked} setIsAdminUnlocked={setIsAdminUnlocked} onNavigateHistory={navigateToHistory} onNavigateStock={navigateToStock} latestFiscalYearClosedAt={latestFiscalYearClosedAt} availableFiscalYears={availableFiscalYears} currentFiscalStartYear={currentFiscalStartYear} selectedFiscalYear={selectedFiscalYear} setSelectedFiscalYear={setSelectedFiscalYear} negativeStockAssets={negativeStockAssets} />;
      case 'assets': return <AssetMasterScreen assets={assets} suppliers={suppliers} categories={categories} onCreateCategory={createCategory} onCreateAsset={createAsset} onUpdateAsset={updateAsset} onUpdateParentAsset={updateParentAsset} onDeleteAsset={deleteAsset} setView={setView} onNavigateEntry={navigateToEntry} onNavigateHistory={navigateToHistory} onNavigateStock={navigateToStock} initialAssetId={filterAssetId} assetPickerMode={Boolean(assetPickerRequest)} assetPickerSource={assetPickerRequest} onPickAsset={pickAssetFromPicker} onCancelPick={cancelAssetPicker} />;
      case 'history': return <MovementHistoryScreen movements={movements} setView={setView} assets={assets} staff={staff} updateMovement={updateMovement} updateAsset={updateAsset} deleteMovement={deleteMovement} pinnedAssetId={filterAssetId} onNavigateAssets={navigateToAssets} onRequestAssetPick={navigateToAssetPickerFromMovement} assetSelectionResult={movementAssetSelection} onAssetSelectionApplied={() => setMovementAssetSelection(null)} fiscalRange={historyFiscalRange} fiscalSnapshots={fiscalSnapshots} />;
      case 'inbound': return <EntryScreen type="in" onSave={addMovement} onCancel={() => { clearEntryState(); setView('menu'); }} assets={assets} movements={movements} staff={staff} setView={setView} initialAssetId={entryAssetId} savedEntryForm={savedEntryForm} onSaveForm={setSavedEntryForm} onRequestAssetPick={navigateToAssetPickerFromEntry} />;
      case 'outbound': return <EntryScreen type="out" onSave={addMovement} onCancel={() => { clearEntryState(); setView('menu'); }} assets={assets} movements={movements} staff={staff} setView={setView} initialAssetId={entryAssetId} savedEntryForm={savedEntryForm} onSaveForm={setSavedEntryForm} onRequestAssetPick={navigateToAssetPickerFromEntry} />;
      case 'stock': return <StockStatusScreen assets={assets} movements={movements} setView={setView} pinnedAssetId={filterAssetId} onNavigateHistory={navigateToHistory} onNavigateAssets={navigateToAssets} fiscalRange={historyFiscalRange} fiscalSnapshots={fiscalSnapshots} />;
      case 'backup': return <BackupScreen session={authSession} setView={setView} onRestored={refreshData} />;
      case 'stocktaking': return <StocktakingScreen session={authSession} setView={setView} assets={assets} movements={movements} staff={staff} onCompleted={refreshData} />;
      default: return <MenuScreen setView={navigateFromMenu} onLogout={handleLogout} userEmail={authSession?.user?.email} onYearEndUpdate={performYearEndUpdate} onFetchLastStocktaking={fetchLastStocktaking} isAdminUnlocked={isAdminUnlocked} setIsAdminUnlocked={setIsAdminUnlocked} onNavigateHistory={navigateToHistory} onNavigateStock={navigateToStock} latestFiscalYearClosedAt={latestFiscalYearClosedAt} availableFiscalYears={availableFiscalYears} currentFiscalStartYear={currentFiscalStartYear} selectedFiscalYear={selectedFiscalYear} setSelectedFiscalYear={setSelectedFiscalYear} negativeStockAssets={negativeStockAssets} />;
    }
  };

  if (!authSession) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {isLoading && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-lg font-bold text-blue-700">データベース読み込み中...</p>
            </div>
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
