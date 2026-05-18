import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Home, 
  Package, 
  PlusCircle, 
  MinusCircle, 
  ClipboardList, 
  Table, 
  RefreshCcw, 
  LogOut, 
  Search, 
  ArrowLeft, 
  ArrowRight,
  Printer,
  X,
  User,
  Calendar,
  Save,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Check
} from 'lucide-react';

// --- Mock Data ---
const INITIAL_ASSETS = [
  { id: '541', maker: 'テルモ', name: 'アセリオ静注液1000mgバッグ 20袋', categoryId: '1', category: '注射液', deliveryPrice: 6076, usageUnitPrice: 304, usageUnit: '袋', supplierId: '1', supplier: 'アトル', memo: '' },
  { id: '398', maker: '田辺三菱', name: 'アドナ注25mg 5ml 10A', categoryId: '1', category: '注射液', deliveryPrice: 535, usageUnitPrice: 54, usageUnit: 'A', supplierId: '2', supplier: '翔薬', memo: '' },
  { id: '32', maker: 'テルモ', name: 'アドレナリン注0.1% 10本', categoryId: '1', category: '注射液', deliveryPrice: 3219, usageUnitPrice: 322, usageUnit: '本', supplierId: '2', supplier: '翔薬', memo: '1診に1本常備' },
  { id: '27', maker: 'ニプロ', name: 'アトロピン0.5mg 1ml 10A', categoryId: '1', category: '注射液', deliveryPrice: 844, usageUnitPrice: 84, usageUnit: 'A', supplierId: '1', supplier: 'アトル', memo: '' },
  { id: '1', maker: 'アステラス製薬', name: 'アネキセート注射液0.5mg 5A', categoryId: '1', category: '注射液', deliveryPrice: 9095, usageUnitPrice: 1819, usageUnit: 'A', supplierId: '1', supplier: 'アトル', memo: '返品不可' },
  { id: '34', maker: 'ファイザー', name: 'エピペン 0.3 大人用', categoryId: '1', category: '注射液', deliveryPrice: 8561, usageUnitPrice: 8561, usageUnit: '本', supplierId: '2', supplier: '翔薬', expiry: '2025-07-31', memo: '2本常備' },
];

const STAFF = [
  { id: '2', name: '杉原ひとみ' },
  { id: '10', name: '木﨑瞳' }
];

const CATEGORIES = [
  { id: '1', name: '注射液' },
  { id: '2', name: '輸液' },
  { id: '5', name: 'ワクチン' },
  { id: '6', name: '事務用品' },
  { id: '7', name: '内視鏡' }
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const PAGE_SIZE = 1000;
const SESSION_STORAGE_KEY = 'invent_manage_supabase_session';
const SAVED_EMAIL_STORAGE_KEY = 'invent_manage_saved_email';

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function storeSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function getSavedEmail() {
  return localStorage.getItem(SAVED_EMAIL_STORAGE_KEY) || '';
}

function storeSavedEmail(email) {
  localStorage.setItem(SAVED_EMAIL_STORAGE_KEY, email);
}

function clearSavedEmail() {
  localStorage.removeItem(SAVED_EMAIL_STORAGE_KEY);
}

async function signInWithPassword(email, password) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SupabaseのURLまたは公開キーが設定されていません。.envを確認してください。');
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.msg || payload?.message || 'ログインできませんでした。');
  }

  return {
    ...payload,
    expires_at: Math.floor(Date.now() / 1000) + payload.expires_in,
  };
}

async function signOut(session) {
  if (!session?.access_token) return;

  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

async function supabaseRequest(path, options = {}, session = null) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SupabaseのURLまたは公開キーが設定されていません。.envを確認してください。');
  }

  const accessToken = session?.access_token || SUPABASE_KEY;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message || 'Supabaseへの接続でエラーが発生しました。');
  }

  return payload;
}

async function fetchTable(tableName, orderBy = 'id.asc', session = null) {
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await supabaseRequest(
      `${tableName}?select=*&order=${orderBy}&limit=${PAGE_SIZE}&offset=${offset}`,
      {},
      session
    );
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

const toNumber = (value) => Number(value ?? 0) || 0;
const toNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function normalizeAsset(row, parentMap, supplierMap) {
  const parent = parentMap.get(row.parent_id);
  const supplier = supplierMap.get(row.supplier_id);

  return {
    id: String(row.id),
    parentId: row.parent_id,
    maker: row.maker,
    name: row.brand_name,
    kanaName: row.kana_name || '',
    category: parent?.category || '',
    parentGenericName: parent?.generic_name || '',
    parentCategory: parent?.category || '',
    parentSafetyStock: parent?.safety_stock ?? '',
    parentCreatedAt: parent?.created_at || '',
    packSize: toNumber(row.pack_size || 1),
    deliveryPrice: toNumber(row.delivery_price),
    usageUnitPrice: toNumber(row.usage_unit_price),
    usageUnit: row.usage_unit,
    purchaseUnit: row.purchase_unit || '',
    supplierId: row.supplier_id ? String(row.supplier_id) : '',
    supplier: supplier?.name || '',
    janCode: row.jan_code || '',
    isActive: row.is_active !== false,
    childCreatedAt: row.created_at || '',
    openingStock: toNumber(row.opening_stock),
    memo: row.child_memo || '',
  };
}

function normalizeMovement(row, staffMap) {
  const staffId = row.staff_code ? String(row.staff_code) : '';
  const staff = staffMap.get(row.staff_code);

  return {
    id: row.id,
    assetId: String(row.child_asset_id),
    date: row.movement_date,
    type: row.movement_type,
    quantity: toNumber(row.quantity),
    actualDeliveryPrice: toNumber(row.actual_delivery_price),
    expirationDate: row.expiration_date || '',
    staffId,
    staffName: row.staff_name || staff?.name || '',
    memo: row.memo || '',
  };
}

async function loadInventoryData(session) {
  const [suppliers, staff, parents, childAssets, movements] = await Promise.all([
    fetchTable('invent_suppliers', 'id.asc', session),
    fetchTable('invent_staff', 'id.asc', session),
    fetchTable('invent_parent_assets', 'id.asc', session),
    fetchTable('invent_child_assets', 'id.asc', session),
    fetchTable('invent_stock_movements', 'movement_date.desc', session),
  ]);

  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const staffMap = new Map(staff.map((member) => [member.id, member]));
  const parentMap = new Map(parents.map((parent) => [parent.id, parent]));

  return {
    suppliers,
    staff: staff.map((member) => ({
      id: String(member.id),
      name: member.name,
      isActive: member.is_active !== false,
    })),
    assets: childAssets
      .filter((asset) => asset.is_active !== false)
      .map((asset) => normalizeAsset(asset, parentMap, supplierMap)),
    movements: movements.map((movement) => normalizeMovement(movement, staffMap)),
  };
}

// --- Utility Components ---
const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = "button" }) => {
  const baseStyle = "px-4 py-2 rounded-md font-medium transition-all flex items-center justify-center gap-2 shadow-sm border";
  const variants = {
    primary: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 active:bg-blue-200",
    success: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
    danger: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
    secondary: "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100",
    ghost: "bg-transparent text-gray-500 border-transparent hover:bg-gray-100 shadow-none",
    action: "bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
  };

  return (
    <button 
      type={type}
      onClick={onClick} 
      className={`${baseStyle} ${variants[variant]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-lg shadow-lg border border-gray-100 p-6 ${className}`}>
    {children}
  </div>
);

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState(() => getSavedEmail());
  const [password, setPassword] = useState('');
  const [shouldRememberEmail, setShouldRememberEmail] = useState(() => Boolean(getSavedEmail()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email || !password || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      await onLogin(email, password);
      if (shouldRememberEmail) {
        storeSavedEmail(email);
      } else {
        clearSavedEmail();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-slate-800">在庫管理システム</h1>
          <p className="mt-2 text-sm text-slate-500">Supabaseアカウントでログインしてください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">メールアドレス</label>
            <input
              type="email"
              className="w-full rounded-md border border-slate-200 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">パスワード</label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-200 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
              checked={shouldRememberEmail}
              onChange={(event) => setShouldRememberEmail(event.target.checked)}
            />
            IDを保存する
          </label>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full py-3" disabled={isSubmitting}>
            {isSubmitting ? 'ログイン中...' : 'ログイン'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// --- Application Components ---

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
          actual_delivery_price: asset?.deliveryPrice || 0,
          expiration_date: null,
          lot_number: null,
          staff_code: staffMember ? Number(staffMember.id) : null,
          staff_name: staffMember?.name || null,
          memo: data.memo || null,
        }),
      },
      authSession
    );

    const staffMap = new Map(staff.map((member) => [Number(member.id), member]));
    setMovements(prev => [normalizeMovement(created, staffMap), ...prev]);
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
      case 'assets': return <AssetMasterScreen assets={assets} suppliers={suppliers} onUpdateAsset={updateAsset} onUpdateParentAsset={updateParentAsset} setView={setView} />;
      case 'history': return <MovementHistoryScreen movements={movements} setMovements={setMovements} setView={setView} assets={assets} deleteMovement={deleteMovement} />;
      case 'inbound': return <EntryScreen type="in" onSave={addMovement} onCancel={() => setView('menu')} assets={assets} staff={staff} />;
      case 'outbound': return <EntryScreen type="out" onSave={addMovement} onCancel={() => setView('menu')} assets={assets} staff={staff} />;
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

// --- Screens ---

function MenuScreen({ setView, onLogout, userEmail }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-12">
      <div className="text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-800 mb-2">
          在庫管理システム <span className="text-orange-500 font-normal">2025年度版</span>
        </h1>
        <p className="text-xl text-slate-500">2025.07.01 更新</p>
        {userEmail && <p className="mt-2 text-sm text-slate-400">{userEmail}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        <MenuButton icon={<PlusCircle size={24} />} title="入庫画面" color="bg-emerald-50 text-emerald-700" onClick={() => setView('inbound')} />
        <MenuButton icon={<ClipboardList size={24} />} title="入出庫データ" color="bg-blue-50 text-blue-700" onClick={() => setView('history')} />
        <MenuButton icon={<Table size={24} />} title="在庫表" color="bg-amber-50 text-amber-700" onClick={() => setView('stock')} />
        <MenuButton icon={<MinusCircle size={24} />} title="出庫画面" color="bg-rose-50 text-rose-700" onClick={() => setView('outbound')} />
        <MenuButton icon={<Package size={24} />} title="資産マスタ" color="bg-indigo-50 text-indigo-700" onClick={() => setView('assets')} />
        <MenuButton icon={<RefreshCcw size={24} />} title="年度更新" color="bg-slate-50 text-slate-700" />
      </div>

      <Button variant="danger" className="mt-8 px-12 py-3 text-lg" onClick={onLogout}>
        <LogOut size={20} />
        ログアウト
      </Button>
    </div>
  );
}

function MenuButton({ icon, title, color, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`${color} p-8 rounded-xl shadow-sm border border-current border-opacity-10 hover:shadow-md transition-all flex flex-col items-center justify-center gap-4 group active:scale-95`}
    >
      <div className="p-3 bg-white bg-opacity-50 rounded-full group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <span className="text-lg font-bold">{title}</span>
    </button>
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
  parentCategory: asset?.parentCategory || '',
  parentGenericName: asset?.parentGenericName || '',
});

function AssetMasterScreen({ assets, suppliers, onUpdateAsset, onUpdateParentAsset, setView }) {
  const [filter, setFilter] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(() => createAssetEditForm(null));
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const filteredAssets = assets.filter(a =>
    a.name.includes(filter) ||
    a.maker.includes(filter) ||
    a.parentCategory.includes(filter) ||
    a.supplier.includes(filter)
  );
  const selectedAsset =
    filteredAssets.find(asset => asset.id === selectedAssetId) ||
    filteredAssets[0] ||
    null;

  useEffect(() => {
    setIsEditing(false);
    setSaveError('');
    setEditForm(createAssetEditForm(selectedAsset));
  }, [selectedAsset?.id]);

  const updateEditForm = (key, value) => {
    setEditForm(prev => ({ ...prev, [key]: value }));
  };

  const startEdit = () => {
    setEditForm(createAssetEditForm(selectedAsset));
    setSaveError('');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setEditForm(createAssetEditForm(selectedAsset));
    setSaveError('');
    setIsEditing(false);
  };

  const saveEdit = async () => {
    if (!selectedAsset) return;

    const deliveryPrice = toNullableNumber(editForm.deliveryPrice);
    const packSize = toNullableNumber(editForm.packSize);
    const supplierId = toNullableNumber(editForm.supplierId);

    if (!editForm.maker.trim() || !editForm.name.trim() || !editForm.usageUnit.trim()) {
      setSaveError('メーカー、品名、使用単位は必須です。');
      return;
    }

    if (!editForm.parentCategory.trim() || !editForm.parentGenericName.trim()) {
      setSaveError('分類と親資産名は必須です。');
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

  return (
    <Card className="max-h-[90vh] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-slate-800">資産マスタ</h2>
        <Button variant="secondary" onClick={() => setView('menu')}><X size={18} /> 閉じる</Button>
      </div>

      <div className="flex gap-4 mb-6 bg-slate-50 p-4 rounded-lg">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="品名 (ヒンメイ) で検索..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Button onClick={() => setFilter('')}>最初から検索</Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse min-w-[800px] text-sm">
            <thead className="bg-slate-100 sticky top-0">
              <tr>
                <th className="p-3 border-b border-slate-200 w-20">ID</th>
                <th className="p-3 border-b border-slate-200 w-40">メーカー</th>
                <th className="p-3 border-b border-slate-200 w-28">分類</th>
                <th className="p-3 border-b border-slate-200 min-w-[420px]">品名</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map(asset => {
                const isSelected = selectedAsset?.id === asset.id;
                return (
                  <tr
                    key={asset.id}
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={`cursor-pointer border-b border-slate-100 transition-colors ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-3 font-mono text-slate-500">{asset.id}</td>
                    <td className="p-3 w-40 max-w-40 whitespace-normal break-words">{asset.maker}</td>
                    <td className="p-3 w-28 max-w-28 whitespace-normal break-words">{asset.parentCategory}</td>
                    <td className="p-3 min-w-[420px] font-medium text-blue-700 whitespace-normal break-words">{asset.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
          {selectedAsset ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-slate-400">詳細情報</p>
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
                    <DetailItem label="ID" value={selectedAsset.id || '-'} mono />
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
                    <p className="mb-3 text-xs font-bold text-amber-700">親資産</p>
                    <div className="grid grid-cols-2 gap-3">
                      <EditField label="分類" value={editForm.parentCategory} onChange={(value) => updateEditForm('parentCategory', value)} />
                      <EditField label="親資産名" value={editForm.parentGenericName} onChange={(value) => updateEditForm('parentGenericName', value)} />
                    </div>
                    <p className="mt-2 text-xs text-amber-700">
                      同じ親資産に紐づく他の資産にも反映されます。
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <EditField label="購入単位" value={editForm.purchaseUnit} onChange={(value) => updateEditForm('purchaseUnit', value)} />
                    <EditField label="購入価格" type="number" value={editForm.deliveryPrice} onChange={(value) => updateEditForm('deliveryPrice', value)} align="right" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="入数" type="number" value={editForm.packSize} onChange={(value) => updateEditForm('packSize', value)} align="right" />
                    <EditField label="使用単位" value={editForm.usageUnit} onChange={(value) => updateEditForm('usageUnit', value)} />
                    <DetailItem label="使用単価" value={`¥${selectedAsset.usageUnitPrice.toLocaleString()}`} align="right" />
                  </div>

                  <EditField label="jan_code" value={editForm.janCode} onChange={(value) => updateEditForm('janCode', value)} mono />
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
                    <DetailRow label="jan_code" value={selectedAsset.janCode || '-'} mono />
                    <DetailRow label="分類" value={selectedAsset.parentCategory || '-'} />
                    <DetailRow label="parent.generic_name" value={selectedAsset.parentGenericName || '-'} />
                    <DetailRow label="摘要" value={selectedAsset.memo || '-'} />
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

      <div className="flex gap-4 mt-6">
        <Button variant="action"><PlusCircle size={18} /> 新規入力</Button>
        <Button variant="action" className="text-red-600 border-red-100"><Trash2 size={18} /> 削除</Button>
        <Button variant="action" className="text-green-600 border-green-100"><Save size={18} /> 登録</Button>
        <div className="flex-1" />
        <Button variant="secondary"><Printer size={18} /> 一覧印刷</Button>
      </div>
    </Card>
  );
}

function DetailItem({ label, value, align = 'left', mono = false }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={`mt-1 font-bold text-slate-700 ${align === 'right' ? 'text-right' : ''} ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text', options = null, align = 'left', mono = false, multiline = false }) {
  const inputClass = `mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${
    align === 'right' ? 'text-right' : ''
  } ${mono ? 'font-mono' : ''}`;

  return (
    <label className="block rounded-md border border-slate-200 bg-white p-3">
      <span className="text-xs font-bold text-slate-400">{label}</span>
      {options ? (
        <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          className={`${inputClass} min-h-24 resize-y font-normal`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          type={type}
          value={value}
          min={type === 'number' ? 0 : undefined}
          step={type === 'number' ? 'any' : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={`mt-1 break-words text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function MovementHistoryScreen({ movements, setView, assets, deleteMovement }) {
  const [filterType, setFilterType] = useState('all');

  const filtered = movements.filter(m => {
    if (filterType === 'in') return m.type === 'in';
    if (filterType === 'out') return m.type === 'out';
    return true;
  });

  return (
    <Card className="max-h-[90vh] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-slate-800">入出庫データ一覧/修正</h2>
        <Button variant="secondary" onClick={() => setView('menu')}><X size={18} /> 閉じる</Button>
      </div>

      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="font-bold text-slate-600 w-20">入出庫</span>
            <div className="flex bg-white border border-slate-200 rounded-lg p-1">
              <button 
                onClick={() => setFilterType('all')}
                className={`px-4 py-1 rounded-md text-sm ${filterType === 'all' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600'}`}
              >入出庫</button>
              <button 
                onClick={() => setFilterType('in')}
                className={`px-4 py-1 rounded-md text-sm ${filterType === 'in' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600'}`}
              >入庫</button>
              <button 
                onClick={() => setFilterType('out')}
                className={`px-4 py-1 rounded-md text-sm ${filterType === 'out' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-600'}`}
              >出庫</button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-bold text-slate-600 w-20">入出庫日</span>
            <input type="date" className="border border-slate-200 rounded p-1" />
            <span>〜</span>
            <input type="date" className="border border-slate-200 rounded p-1" />
          </div>
        </div>

        <div className="flex flex-col justify-end items-end gap-2">
          <div className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full font-bold">
            品名をダブルクリックで修正画面表示
          </div>
          <Button variant="primary" className="w-32">抽出</Button>
        </div>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-lg flex-1">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-slate-100 sticky top-0">
            <tr>
              <th className="p-3 border-b border-slate-200">入出庫日</th>
              <th className="p-3 border-b border-slate-200">分類</th>
              <th className="p-3 border-b border-slate-200">資産コード</th>
              <th className="p-3 border-b border-slate-200">メーカー</th>
              <th className="p-3 border-b border-slate-200">品 名</th>
              <th className="p-3 border-b border-slate-200 text-right">入庫数</th>
              <th className="p-3 border-b border-slate-200 text-right">出庫数</th>
              <th className="p-3 border-b border-slate-200">単位</th>
              <th className="p-3 border-b border-slate-200">担当者名</th>
              <th className="p-3 border-b border-slate-200">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const asset = assets.find(a => a.id === m.assetId);
              return (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 group">
                  <td className="p-3 text-slate-500">{m.date}</td>
                  <td className="p-3">{asset?.category || '-'}</td>
                  <td className="p-3 font-mono">{m.assetId}</td>
                  <td className="p-3">{asset?.maker}</td>
                  <td className="p-3 font-medium text-blue-700">{asset?.name}</td>
                  <td className={`p-3 text-right font-bold ${m.type === 'in' ? 'text-emerald-600' : 'text-slate-300'}`}>
                    {m.type === 'in' ? m.quantity : 0}
                  </td>
                  <td className={`p-3 text-right font-bold ${m.type === 'out' ? 'text-rose-600' : 'text-slate-300'}`}>
                    {m.type === 'out' ? m.quantity : 0}
                  </td>
                  <td className="p-3">{asset?.usageUnit}</td>
                  <td className="p-3 text-slate-600">{m.staffName}</td>
                  <td className="p-3">
                    <button 
                      onClick={() => deleteMovement(m.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 mt-6">
        <Button variant="secondary"><Printer size={18} /> 一覧印刷</Button>
      </div>
    </Card>
  );
}

// --- Searchable Asset Input ---
function AssetSearchInput({ assets, value, onChange, isIn, showListSignal }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedAsset = assets.find(a => a.id === value);
  
  useEffect(() => {
    if (selectedAsset) {
      setSearchTerm(`${selectedAsset.id} - ${selectedAsset.name}`);
    } else {
      setSearchTerm('');
    }
  }, [selectedAsset]);

  const candidates = useMemo(() => {
    if (!isOpen || searchTerm === (selectedAsset ? `${selectedAsset.id} - ${selectedAsset.name}` : '')) {
      return [];
    }
    const lowerSearch = searchTerm.toLowerCase();
    return assets.filter(a => 
      a.id.toLowerCase().includes(lowerSearch) || 
      a.name.toLowerCase().includes(lowerSearch) ||
      a.kanaName.toLowerCase().includes(lowerSearch)
    ).slice(0, 10);
  }, [searchTerm, assets, isOpen, selectedAsset]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showListSignal > 0) {
      setSearchTerm('');
      setIsOpen(true);
    }
  }, [showListSignal]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <input 
          type="text"
          placeholder="資産コードまたは品名で検索..."
          className={`w-full p-2 pr-10 border rounded-md outline-none focus:ring-2 transition-all ${
            isIn ? 'focus:ring-emerald-500' : 'focus:ring-rose-500'
          }`}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <Search className="absolute right-3 text-slate-400" size={16} />
      </div>

      {isOpen && candidates.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-60 overflow-y-auto">
          {candidates.map(asset => (
            <button
              key={asset.id}
              type="button"
              className="w-full text-left p-3 hover:bg-slate-50 flex flex-col border-b border-slate-100 last:border-none"
              onClick={() => {
                onChange(asset.id);
                setSearchTerm(`${asset.id} - ${asset.name}`);
                setIsOpen(false);
              }}
            >
              <span className="text-xs font-mono text-blue-600 font-bold">{asset.id}</span>
              <span className="text-sm font-medium">{asset.name}</span>
              <span className="text-[10px] text-slate-400">{asset.maker}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryScreen({ type, onSave, onCancel, assets, staff }) {
  const isIn = type === 'in';
  const title = isIn ? '入庫データ入力・修正' : '出庫データ入力・修正';
  const accentColor = isIn ? 'text-emerald-700' : 'text-rose-700';
  const btnVariant = isIn ? 'success' : 'danger';

  const [form, setForm] = useState({
    staffId: staff[0]?.id || '',
    assetId: '',
    date: new Date().toISOString().split('T')[0],
    quantity: 0,
    memo: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [assetListSignal, setAssetListSignal] = useState(0);

  useEffect(() => {
    if (!form.staffId && staff.length > 0) {
      setForm((current) => ({ ...current, staffId: staff[0].id }));
    }
  }, [form.staffId, staff]);

  const selectedAsset = assets.find(a => a.id === form.assetId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.assetId || form.quantity <= 0 || isSaving) return;

    setIsSaving(true);
    setSaveError('');

    try {
      await onSave({
        ...form,
        type,
        staffName: staff.find(s => s.id === form.staffId)?.name || '不明'
      });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <Card className={`max-w-2xl w-full border-t-8 ${isIn ? 'border-t-emerald-500' : 'border-t-rose-500'}`}>
        <div className="text-center mb-8">
          <h2 className={`text-3xl font-black ${accentColor}`}>{title}</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-3 items-center gap-4">
            <label className="font-bold text-slate-700">担当者</label>
            <div className="col-span-2 flex gap-2">
              <select 
                className={`flex-1 p-2 border rounded-md outline-none focus:ring-2 ${isIn ? 'focus:ring-emerald-500' : 'focus:ring-rose-500'}`}
                value={form.staffId}
                onChange={(e) => setForm({...form, staffId: e.target.value})}
              >
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input readOnly value={form.staffId} className="w-16 p-2 bg-slate-100 text-center rounded border" />
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            <label className="font-bold text-slate-700">資産コード</label>
            <div className="col-span-2 flex gap-2">
              <AssetSearchInput 
                assets={assets} 
                value={form.assetId} 
                onChange={(id) => setForm({...form, assetId: id})}
                isIn={isIn}
                showListSignal={assetListSignal}
              />
              <Button
                variant="action"
                className="whitespace-nowrap"
                onClick={() => setAssetListSignal((value) => value + 1)}
              >
                資産一覧/選択
              </Button>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm border border-slate-200">
            <div className="grid grid-cols-3">
              <span className="text-slate-500 font-bold">メーカー:</span>
              <span className="col-span-2 font-medium">{selectedAsset?.maker || '-'}</span>
            </div>
            <div className="grid grid-cols-3">
              <span className="text-slate-500 font-bold">品名:</span>
              <span className="col-span-2 font-medium">{selectedAsset?.name || '-'}</span>
            </div>
            <div className="grid grid-cols-3">
              <span className="text-slate-500 font-bold">購入価格:</span>
              <span className="col-span-2">¥{(selectedAsset?.deliveryPrice || 0).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-3">
              <span className="text-slate-500 font-bold">使用単価:</span>
              <span className="col-span-2">¥{(selectedAsset?.usageUnitPrice || 0).toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            <label className="font-bold text-slate-700">{isIn ? '入庫日' : '出庫日'}</label>
            <div className="col-span-2 flex gap-2 items-center">
              <input 
                type="date" 
                className="flex-1 p-2 border rounded-md"
                value={form.date}
                onChange={(e) => setForm({...form, date: e.target.value})}
              />
              <Button onClick={() => setForm({...form, date: new Date().toISOString().split('T')[0]})}>本日</Button>
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            <label className="font-bold text-slate-700">{isIn ? '入庫数' : '出庫数'}</label>
            <div className="col-span-2 space-y-1">
              <div className="flex gap-2 items-center">
                <input 
                  type="number" 
                  className={`flex-1 p-2 border rounded-md ${isIn ? 'bg-emerald-50' : 'bg-rose-50'}`}
                  value={form.quantity}
                  onChange={(e) => setForm({...form, quantity: parseInt(e.target.value) || 0})}
                />
                <span className="font-bold text-slate-600">{selectedAsset?.usageUnit || '個'}</span>
              </div>
              <p className="text-xs text-rose-500 font-bold">{isIn ? '入庫数' : '出庫数'}は 使用単位 で入力して下さい</p>
            </div>
          </div>

          <div className="grid grid-cols-3 items-start gap-4">
            <label className="font-bold text-slate-700">摘要</label>
            <textarea 
              className={`col-span-2 p-2 border rounded-md h-20 ${isIn ? 'bg-emerald-50' : 'bg-rose-50'}`}
              value={form.memo}
              onChange={(e) => setForm({...form, memo: e.target.value})}
            />
          </div>

          <div className="flex justify-between items-center pt-6 border-t border-slate-100">
            <div className="flex gap-2">
              <Button variant="action" onClick={() => setForm({...form, assetId: '', quantity: 0, memo: ''})}>新規入力</Button>
              <Button variant="danger" ghost><Trash2 size={18} /> 削除</Button>
            </div>
            <div className="flex gap-2">
              <Button variant={btnVariant} className="px-10" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? '登録中...' : '登録'}
              </Button>
              <Button variant="secondary" onClick={onCancel}>閉じる</Button>
            </div>
          </div>
          {saveError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}

function StockStatusScreen({ assets, movements, setView }) {
  const [selectedMonth, setSelectedMonth] = useState(5);

  const stockData = useMemo(() => {
    return assets.map(asset => {
      const assetMovements = movements.filter(m => m.assetId === asset.id);
      const inboundTotal = assetMovements.filter(m => m.type === 'in').reduce((sum, m) => sum + m.quantity, 0);
      const outboundTotal = assetMovements.filter(m => m.type === 'out').reduce((sum, m) => sum + m.quantity, 0);
      const initialStock = asset.openingStock || 0; 
      const currentStock = initialStock + inboundTotal - outboundTotal;
      const stockValue = currentStock * asset.usageUnitPrice;

      return { ...asset, prevMonth: initialStock, inbound: inboundTotal, outbound: outboundTotal, currentStock, stockValue };
    });
  }, [assets, movements]);

  return (
    <Card className="max-h-[90vh] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-slate-800">在 庫 表</h2>
        <Button variant="secondary" onClick={() => setView('menu')}><X size={18} /> 閉じる</Button>
      </div>

      <div className="flex flex-wrap gap-6 items-end mb-6">
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-500">月度選択</p>
          <div className="flex bg-white border border-slate-200 rounded-lg p-1">
            {[7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6].map(m => (
              <button key={m} onClick={() => setSelectedMonth(m)} className={`w-10 h-8 rounded text-sm ${selectedMonth === m ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-100 text-slate-600'}`}>{m}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-bold text-slate-500">品名(ヒンメイ)検索</p>
          <div className="flex gap-2">
            <input type="text" className="flex-1 p-2 border border-slate-200 rounded-md" />
            <Button>最初検索</Button>
          </div>
        </div>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-lg flex-1 text-sm">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-slate-100 sticky top-0 z-10">
            <tr>
              <th className="p-3 border-b border-slate-200">資産コード</th>
              <th className="p-3 border-b border-slate-200">メーカー</th>
              <th className="p-3 border-b border-slate-200">品 名</th>
              <th className="p-3 border-b border-slate-200 text-right bg-rose-50/50">前月在庫</th>
              <th className="p-3 border-b border-slate-200 text-right bg-blue-50/50">入庫数</th>
              <th className="p-3 border-b border-slate-200 text-right bg-blue-50/50">出庫数</th>
              <th className="p-3 border-b border-slate-200 text-right bg-rose-50/50 font-bold">在庫数</th>
              <th className="p-3 border-b border-slate-200 text-center">使用単位</th>
              <th className="p-3 border-b border-slate-200 text-right">使用単価</th>
              <th className="p-3 border-b border-slate-200 text-right font-bold text-blue-800">在庫金額</th>
            </tr>
          </thead>
          <tbody>
            {stockData.map(row => (
              <tr key={row.id} className="hover:bg-slate-50 border-b border-slate-100">
                <td className="p-3 font-mono">{row.id}</td>
                <td className="p-3">{row.maker}</td>
                <td className="p-3 font-medium">{row.name}</td>
                <td className="p-3 text-right bg-rose-50/20">{row.prevMonth}</td>
                <td className="p-3 text-right bg-blue-50/20">{row.inbound}</td>
                <td className="p-3 text-right bg-blue-50/20">{row.outbound}</td>
                <td className="p-3 text-right bg-rose-50/20 font-bold">{row.currentStock}</td>
                <td className="p-3 text-center">{row.usageUnit}</td>
                <td className="p-3 text-right">¥{row.usageUnitPrice.toLocaleString()}</td>
                <td className="p-3 text-right font-bold text-blue-600 bg-blue-50/10">¥{row.stockValue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end mt-6">
        <Button variant="secondary"><Printer size={18} /> 印 刷</Button>
      </div>
    </Card>
  );
}
