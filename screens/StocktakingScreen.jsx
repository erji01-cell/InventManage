import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ArrowLeft, AlertTriangle } from 'lucide-react';

import { Button, Card } from '../components/ui.jsx';
import {
  fetchStocktakings,
  fetchStocktakingItems,
  createStocktaking,
  updateStocktakingItem,
  completeStocktaking,
  deleteStocktaking,
  countLinkedMovements,
} from '../lib/stocktaking.js';
import { performBackup } from '../lib/backup.js';

export default function StocktakingScreen({ session, setView, assets, movements, staff, onCompleted }) {
  const [mode, setMode] = useState('list'); // 'list' | 'entry' | 'review'
  const [sessions, setSessions] = useState([]);
  const [currentCountId, setCurrentCountId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showOnlyDiff, setShowOnlyDiff] = useState(false);
  const [sortOrder, setSortOrder] = useState('id');
  const [staffId, setStaffId] = useState(staff[0]?.id || '');
  const [memo, setMemo] = useState('');
  const [basisDate, setBasisDate] = useState(new Date().toISOString().split('T')[0]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmDate, setConfirmDate] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // {session, linkedCount}
  const [deleteRunning, setDeleteRunning] = useState(false);

  const loadList = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchStocktakings(session);
      setSessions(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async (countId) => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchStocktakingItems(countId, session);
      setItems(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'list') loadList();
  }, [mode]);

  const startNew = async () => {
    if (!window.confirm('新規棚卸しを開始しますか？\n（現在のシステム在庫をスナップショット保存します）')) return;
    setLoading(true);
    setError('');
    try {
      const created = await createStocktaking({ staffId, memo, basisDate, assets, movements }, session);
      setCurrentCountId(created.id);
      await loadItems(created.id);
      setMemo('');
      setMode('entry');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resumeSession = async (s) => {
    setCurrentCountId(s.id);
    await loadItems(s.id);
    setMode(s.status === 'completed' ? 'review' : 'entry');
  };

  const openDeleteModal = async (s) => {
    let linkedCount = 0;
    if (s.status === 'completed') {
      try {
        linkedCount = await countLinkedMovements(s.id, session);
      } catch {
        // 取得失敗時は0扱い
      }
    }
    setDeleteTarget({ session: s, linkedCount });
  };

  const executeDelete = async (withBackup) => {
    if (!deleteTarget) return;
    setDeleteRunning(true);
    setError('');
    try {
      if (withBackup) {
        await performBackup(session, { downloadLocal: true });
      }
      await deleteStocktaking(deleteTarget.session.id, session);
      setDeleteTarget(null);
      await loadList();
      await onCompleted?.(); // 親側で assets/movements を再読み込み
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteRunning(false);
    }
  };

  const persistItem = async (item, patch) => {
    try {
      await updateStocktakingItem(item.id, patch, session);
    } catch (err) {
      setError(err.message);
    }
  };

  const assetMap = useMemo(() => new Map(assets.map((a) => [String(a.id), a])), [assets]);

  const enriched = useMemo(() => items.map((item) => {
    const asset = assetMap.get(String(item.asset_id));
    const diff = item.counted_qty == null ? null : Number(item.counted_qty) - Number(item.system_qty);
    return { ...item, asset, diff };
  }), [items, assetMap]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((x) =>
        String(x.asset_id).toLowerCase().includes(q) ||
        (x.asset?.name || '').toLowerCase().includes(q) ||
        (x.asset?.maker || '').toLowerCase().includes(q)
      );
    }
    if (showOnlyDiff) {
      list = list.filter((x) => x.counted_qty == null || (x.diff !== null && x.diff !== 0));
    }
    const arr = [...list];
    const catOrder = (x) => x.asset?.categoryOrder ?? 9999;
    const kana = (x) => x.asset?.kanaName || x.asset?.name || '';
    const code = (x) => Number(x.asset_id) || 0;
    switch (sortOrder) {
      case 'category_id':
        arr.sort((a, b) => (catOrder(a) - catOrder(b)) || (code(a) - code(b)));
        break;
      case 'category_kana':
        arr.sort((a, b) => (catOrder(a) - catOrder(b)) || kana(a).localeCompare(kana(b), 'ja'));
        break;
      case 'kana':
        arr.sort((a, b) => kana(a).localeCompare(kana(b), 'ja'));
        break;
      case 'id':
      default:
        arr.sort((a, b) => code(a) - code(b));
        break;
    }
    return arr;
  }, [enriched, search, showOnlyDiff, sortOrder]);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentCountId),
    [sessions, currentCountId]
  );

  const diffSummary = useMemo(() => {
    const diffs = enriched.filter((x) => x.diff !== null && x.diff !== 0);
    const totalDiffValue = diffs.reduce(
      (sum, x) => sum + x.diff * Number(x.unit_price || 0),
      0
    );
    return { diffCount: diffs.length, totalDiffValue, totalItems: enriched.length };
  }, [enriched]);

  const openConfirmModal = () => {
    // デフォルト日付：基準日（無ければ開始日、それも無ければ今日）
    const defaultDate = currentSession?.basis_date
      || (currentSession?.started_at ? new Date(currentSession.started_at).toISOString().split('T')[0] : null)
      || new Date().toISOString().split('T')[0];
    setConfirmDate(defaultDate);
    setShowConfirmModal(true);
  };

  const executeComplete = async () => {
    if (!confirmDate) {
      setError('調整日を選択してください。');
      return;
    }
    setShowConfirmModal(false);
    setLoading(true);
    setError('');
    try {
      const staffMember = staff.find((s) => String(s.id) === String(staffId));
      const result = await completeStocktaking({
        countId: currentCountId,
        items: enriched,
        staffId,
        staffName: staffMember?.name || '棚卸し',
        date: confirmDate,
      }, session);
      alert(`棚卸し完了：${result.diffCount} 件を入出庫データに記録しました。\n調整日: ${confirmDate}`);
      await onCompleted?.();
      setMode('list');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ===========================================
  // Render: list mode
  // ===========================================
  if (mode === 'list') {
    return (
      <Card className="border-t-8 border-t-teal-500">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-teal-700 flex items-center gap-2">
            <ClipboardCheck size={28} /> 棚卸し
          </h2>
          <Button variant="secondary" onClick={() => setView('menu')}>メニューへ戻る</Button>
        </div>

        <div className="mb-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <h3 className="font-bold mb-3 text-teal-800">新規棚卸し開始</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-slate-600">担当者</span>
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="p-2 border rounded bg-white">
                {staff.map((s) => <option key={s.id} value={s.id}>{s.id} {s.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-slate-600">基準日</span>
              <input
                type="date"
                value={basisDate}
                onChange={(e) => setBasisDate(e.target.value)}
                className="p-2 border rounded bg-white"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-slate-600">メモ（任意）</span>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="p-2 border rounded bg-white"
                placeholder="例: 2026年度上期棚卸し"
              />
            </label>
          </div>
          <div className="mt-2 text-xs text-slate-600 bg-white p-2 rounded border border-teal-200">
            💡 <span className="font-bold">基準日</span>：この日付までの入出庫でシステム在庫を計算してスナップショット保存します。
            期末確定の場合は<span className="font-bold">期末日（例: 3/31）</span>を指定してください。
            （デフォルトは本日）
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="success" className="px-8" onClick={startNew} disabled={loading}>
              {loading ? '開始中...' : '新規棚卸しを開始'}
            </Button>
          </div>
        </div>

        <h3 className="font-bold mb-3 text-slate-700">棚卸し履歴</h3>
        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded">⚠ {error}</div>}
        {loading && <p className="text-slate-500 text-center py-4">読み込み中...</p>}
        {!loading && sessions.length === 0 ? (
          <p className="text-slate-500 text-center py-8 border border-dashed rounded">まだ棚卸し記録はありません。</p>
        ) : (
          <div className="overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">開始日時</th>
                  <th className="p-2 text-left">基準日</th>
                  <th className="p-2 text-left">完了日時</th>
                  <th className="p-2 text-left">担当者</th>
                  <th className="p-2 text-left">ステータス</th>
                  <th className="p-2 text-left">メモ</th>
                  <th className="p-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 whitespace-nowrap">{new Date(s.started_at).toLocaleString('ja-JP')}</td>
                    <td className="p-2 whitespace-nowrap font-bold text-teal-700">{s.basis_date ? new Date(s.basis_date).toLocaleDateString('ja-JP') : '-'}</td>
                    <td className="p-2 whitespace-nowrap">{s.completed_at ? new Date(s.completed_at).toLocaleString('ja-JP') : '-'}</td>
                    <td className="p-2">{staff.find((m) => String(m.id) === String(s.staff_id))?.name || s.staff_id || '-'}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {s.status === 'completed' ? '完了' : '入力中'}
                      </span>
                    </td>
                    <td className="p-2">{s.memo || '-'}</td>
                    <td className="p-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <Button variant="primary" onClick={() => resumeSession(s)}>
                          {s.status === 'completed' ? '詳細' : '続きを入力'}
                        </Button>
                        <Button variant="danger" onClick={() => openDeleteModal(s)}>削除</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-[30rem] flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertTriangle size={22} className="text-red-700" />
                </div>
                <h2 className="text-lg font-black text-slate-800">棚卸しの削除</h2>
              </div>

              <div className="text-sm text-slate-700 leading-relaxed">
                {deleteTarget.session.status === 'completed' ? (
                  <>
                    ⚠ <span className="font-bold">完了済み棚卸し</span>を削除します。<br /><br />
                    この棚卸しから生じた「[棚卸し調整]」の入出庫データ{' '}
                    <span className="font-black text-red-600 text-base">{deleteTarget.linkedCount} 件</span>{' '}
                    も同時に削除され、<br />
                    <span className="font-bold">在庫数は棚卸し前の状態に戻ります</span>。
                  </>
                ) : (
                  <>
                    入力中の棚卸しセッションを削除します。<br />
                    明細データも削除されますが、入出庫データや在庫には影響しません。
                  </>
                )}
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                ⚠ この操作は取り消せません。
              </div>

              {deleteTarget.session.status === 'completed' && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <p className="font-bold mb-1">💾 削除前にバックアップを取りますか？</p>
                  <p className="text-xs">
                    JSON形式でSupabase Storage + ローカルに保存します（推奨）
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2 w-full">
                {deleteTarget.session.status === 'completed' && (
                  <Button variant="primary" className="w-full" onClick={() => executeDelete(true)} disabled={deleteRunning}>
                    {deleteRunning ? 'バックアップ＆削除中...' : 'バックアップして削除（推奨）'}
                  </Button>
                )}
                <Button variant="danger" className="w-full" onClick={() => executeDelete(false)} disabled={deleteRunning}>
                  {deleteRunning ? '削除中...' : 'バックアップなしで削除'}
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => setDeleteTarget(null)} disabled={deleteRunning}>
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    );
  }

  // ===========================================
  // Render: entry mode (実数入力)
  // ===========================================
  if (mode === 'entry') {
    const completed = enriched.filter((x) => x.counted_qty !== null).length;
    return (
      <Card className="border-t-8 border-t-teal-500">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-black text-teal-700 flex items-center gap-2">
              <ClipboardCheck size={28} /> 棚卸し 実数入力
            </h2>
            {currentSession?.basis_date && (
              <p className="text-sm text-slate-600 mt-1">
                基準日: <span className="font-bold text-teal-700">{new Date(currentSession.basis_date).toLocaleDateString('ja-JP')}</span>
                <span className="ml-2 text-xs text-slate-400">（この日時点のシステム在庫で比較）</span>
              </p>
            )}
          </div>
          <Button variant="secondary" onClick={() => setMode('list')}>
            <ArrowLeft size={16} /> 一覧へ
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="資産コード・品名・メーカーで検索"
            className="flex-1 min-w-64 p-2 border rounded"
          />
          <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
            <span className="text-slate-600">並び順</span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="p-2 border rounded bg-white font-normal"
            >
              <option value="id">コード順</option>
              <option value="category_id">分類ごと → コード順</option>
              <option value="category_kana">分類ごと → アイウエオ順</option>
              <option value="kana">品名アイウエオ順</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
            <input type="checkbox" checked={showOnlyDiff} onChange={(e) => setShowOnlyDiff(e.target.checked)} />
            未入力・差異ありのみ表示
          </label>
          <span className="text-sm text-slate-600">
            進捗: <span className="font-bold">{completed}</span> / {enriched.length}
          </span>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded">⚠ {error}</div>}

        <div className="overflow-auto max-h-[60vh] border rounded">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 sticky top-0">
              <tr>
                <th className="p-2 text-left">コード</th>
                <th className="p-2 text-left">品名</th>
                <th className="p-2 text-right">システム在庫</th>
                <th className="p-2 text-center">実数</th>
                <th className="p-2 text-right">差異</th>
                <th className="p-2 text-left">単位</th>
                <th className="p-2 text-left">メモ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">該当する資産がありません。</td></tr>
              ) : filtered.map((item, idx) => {
                const isGrouped = sortOrder === 'category_id' || sortOrder === 'category_kana';
                const cat = item.asset?.parentCategory || '（分類なし）';
                const prevCat = idx > 0 ? (filtered[idx - 1].asset?.parentCategory || '（分類なし）') : null;
                const showHeader = isGrouped && cat !== prevCat;
                return (
                <React.Fragment key={item.id}>
                  {showHeader && (
                    <tr className="bg-teal-50">
                      <td colSpan={7} className="p-2 font-bold text-teal-800 border-y border-teal-200">{cat}</td>
                    </tr>
                  )}
                <tr className="border-b hover:bg-slate-50">
                  <td className="p-2 font-mono">{item.asset_id}</td>
                  <td className="p-2">{item.asset?.name || '(削除済資産)'}</td>
                  <td className="p-2 text-right">{Number(item.system_qty).toLocaleString()}</td>
                  <td className="p-2 text-center">
                    <input
                      type="number"
                      value={item.counted_qty == null ? '' : item.counted_qty}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, counted_qty: v === '' ? null : Number(v) } : x));
                      }}
                      onBlur={(e) => {
                        const v = e.target.value;
                        persistItem(item, { counted_qty: v === '' ? null : Number(v) });
                      }}
                      className="w-24 p-1 border rounded text-right bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  </td>
                  <td className={`p-2 text-right font-bold ${item.diff == null ? 'text-slate-400' : item.diff > 0 ? 'text-emerald-600' : item.diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {item.diff == null ? '-' : (item.diff > 0 ? '+' : '') + item.diff.toLocaleString()}
                  </td>
                  <td className="p-2">{item.asset?.usageUnit || '-'}</td>
                  <td className="p-2">
                    <input
                      type="text"
                      value={item.note || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, note: v } : x));
                      }}
                      onBlur={(e) => persistItem(item, { note: e.target.value })}
                      className="w-full p-1 border rounded"
                      placeholder="-"
                    />
                  </td>
                </tr>
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-between items-center">
          <p className="text-xs text-slate-500">入力した値は枠を離れた時点で自動保存されます</p>
          <Button variant="primary" className="px-8" onClick={() => setMode('review')}>差異確認へ →</Button>
        </div>
      </Card>
    );
  }

  // ===========================================
  // Render: review mode (差異確認・確定)
  // ===========================================
  const diffOnly = enriched.filter((x) => x.diff !== null && x.diff !== 0);
  const isCompleted = currentSession?.status === 'completed';

  return (
    <Card className="border-t-8 border-t-teal-500">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-black text-teal-700 flex items-center gap-2">
            <ClipboardCheck size={28} /> 棚卸し 差異確認
          </h2>
          {currentSession?.basis_date && (
            <p className="text-sm text-slate-600 mt-1">
              基準日: <span className="font-bold text-teal-700">{new Date(currentSession.basis_date).toLocaleDateString('ja-JP')}</span>
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={() => setMode(isCompleted ? 'list' : 'entry')}>
          <ArrowLeft size={16} /> {isCompleted ? '一覧へ' : '入力に戻る'}
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="差異件数" value={`${diffSummary.diffCount} 件`} />
        <Stat
          label="評価額差異合計"
          value={`${diffSummary.totalDiffValue >= 0 ? '+' : ''}¥${diffSummary.totalDiffValue.toLocaleString()}`}
          color={diffSummary.totalDiffValue === 0 ? 'text-slate-700' : diffSummary.totalDiffValue > 0 ? 'text-emerald-700' : 'text-red-700'}
        />
        <Stat label="対象品目数" value={`${diffSummary.totalItems} 件`} />
      </div>

      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded">⚠ {error}</div>}

      <div className="overflow-auto max-h-[55vh] border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 sticky top-0">
            <tr>
              <th className="p-2 text-left">コード</th>
              <th className="p-2 text-left">品名</th>
              <th className="p-2 text-right">システム</th>
              <th className="p-2 text-right">実数</th>
              <th className="p-2 text-right">差異</th>
              <th className="p-2 text-right">単価</th>
              <th className="p-2 text-right">評価額差異</th>
              <th className="p-2 text-left">メモ</th>
            </tr>
          </thead>
          <tbody>
            {diffOnly.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-slate-500">差異はありません。</td></tr>
            ) : diffOnly.map((item) => {
              const valueDiff = item.diff * Number(item.unit_price || 0);
              return (
                <tr key={item.id} className="border-b">
                  <td className="p-2 font-mono">{item.asset_id}</td>
                  <td className="p-2">{item.asset?.name || '(削除済)'}</td>
                  <td className="p-2 text-right">{Number(item.system_qty).toLocaleString()}</td>
                  <td className="p-2 text-right">{Number(item.counted_qty).toLocaleString()}</td>
                  <td className={`p-2 text-right font-bold ${item.diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {(item.diff > 0 ? '+' : '') + item.diff.toLocaleString()}
                  </td>
                  <td className="p-2 text-right">¥{Number(item.unit_price || 0).toLocaleString()}</td>
                  <td className={`p-2 text-right font-bold ${valueDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {(valueDiff >= 0 ? '+' : '') + `¥${valueDiff.toLocaleString()}`}
                  </td>
                  <td className="p-2">{item.note || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isCompleted ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="success" className="px-8" onClick={openConfirmModal} disabled={loading || diffOnly.length === 0}>
            {loading ? '処理中...' : `棚卸し調整を確定（${diffOnly.length}件を入出庫データに記録）`}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-slate-500">
          この棚卸しは確定済みです（{currentSession?.completed_at && new Date(currentSession.completed_at).toLocaleString('ja-JP')}）
        </p>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-[28rem] flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={24} className="text-teal-700" />
              <h2 className="text-lg font-black text-slate-800">棚卸し調整の確定</h2>
            </div>
            <div className="text-sm text-slate-700 leading-relaxed">
              差異 <span className="font-bold">{diffSummary.diffCount} 件</span> を入出庫データに記録します。<br />
              評価額差異合計:{' '}
              <span className={`font-bold ${diffSummary.totalDiffValue === 0 ? 'text-slate-700' : diffSummary.totalDiffValue > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {diffSummary.totalDiffValue >= 0 ? '+' : ''}¥{diffSummary.totalDiffValue.toLocaleString()}
              </span>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-slate-700">調整日（入出庫データの日付）</span>
              <input
                type="date"
                value={confirmDate}
                onChange={(e) => setConfirmDate(e.target.value)}
                className="p-2 border-2 rounded-lg outline-none focus:border-teal-400 bg-teal-50 text-lg font-bold text-center"
              />
              <span className="text-xs text-slate-500">
                既定: 基準日（{currentSession?.basis_date ? new Date(currentSession.basis_date).toLocaleDateString('ja-JP') : (currentSession?.started_at ? new Date(currentSession.started_at).toLocaleDateString('ja-JP') : '-')}）<br />
                期末確定の場合は <span className="font-bold">基準日と同じ日</span> を指定するのがお勧めです。
              </span>
            </label>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              ⚠ この操作は取り消せません。確定すると入出庫データに「[棚卸し調整]」として記録されます。
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="secondary" className="flex-1" onClick={() => setShowConfirmModal(false)}>キャンセル</Button>
              <Button variant="success" className="flex-1" onClick={executeComplete} disabled={!confirmDate}>確定する</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, color = 'text-slate-700' }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <p className="text-xs text-slate-500 font-bold">{label}</p>
      <p className={`text-xl font-black ${color}`}>{value}</p>
    </div>
  );
}
