import React, { useRef, useState } from 'react';
import { AlertTriangle, ClipboardCheck, ClipboardList, Database, LogOut, MinusCircle, Package, PlusCircle, RefreshCcw, Table } from 'lucide-react';

import { Button, Card } from '../components/ui.jsx';

const ADMIN_PASSWORD = '0125';

function getFiscalDisplay(latestFiscalYearClosedAt) {
  let startYear;

  if (latestFiscalYearClosedAt) {
    const [year, month] = String(latestFiscalYearClosedAt).split('-').map(Number);
    startYear = month >= 7 ? year + 1 : year;
  } else {
    const now = new Date();
    startYear = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  }

  const endYear = startYear + 1;
  return {
    versionLabel: `ver${endYear}.07.01`,
    periodLabel: `${startYear}年7月～${endYear}年6月`,
  };
}

export default function MenuScreen({ setView, onLogout, userEmail, onYearEndUpdate, onFetchLastStocktaking, isAdminUnlocked, setIsAdminUnlocked, onNavigateHistory, onNavigateStock, latestFiscalYearClosedAt }) {
  const [passwordTarget, setPasswordTarget] = useState(null); // 'backup' | 'yearEnd' | 'stocktaking' | null
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const inputRef = useRef(null);
  const [yearEndStep, setYearEndStep] = useState(0); // 0: closed, 1: first confirm, 2: second confirm
  const [yearEndRunning, setYearEndRunning] = useState(false);
  const [yearEndError, setYearEndError] = useState('');
  const [yearEndDone, setYearEndDone] = useState(false);
  const [yearEndDate, setYearEndDate] = useState(''); // 期末日
  const [showStocktakingWarning, setShowStocktakingWarning] = useState(false);
  const [lastStocktaking, setLastStocktaking] = useState(null);

  const closeYearEnd = () => {
    setYearEndStep(0);
    setYearEndRunning(false);
    setYearEndError('');
    setYearEndDone(false);
    setYearEndDate('');
    setShowStocktakingWarning(false);
    setLastStocktaking(null);
  };

  const runYearEnd = async () => {
    if (!yearEndDate) {
      setYearEndError('期末日を入力してください。');
      return;
    }
    setYearEndRunning(true);
    setYearEndError('');
    try {
      await onYearEndUpdate?.(yearEndDate);
      setYearEndDone(true);
    } catch (err) {
      setYearEndError(err?.message || '年度更新に失敗しました。');
    } finally {
      setYearEndRunning(false);
    }
  };

  // 認証済みターゲットを実行する共通処理
  const executeAdminAction = async (target) => {
    if (target === 'backup') {
      setView('backup');
    } else if (target === 'stocktaking') {
      setView('stocktaking');
    } else if (target === 'yearEnd') {
      const last = await onFetchLastStocktaking?.();
      setLastStocktaking(last);
      const days = last?.completed_at
        ? Math.floor((Date.now() - new Date(last.completed_at).getTime()) / 86400000)
        : null;
      if (last == null || days > 90) {
        setShowStocktakingWarning(true);
      } else {
        setYearEndStep(1);
      }
    }
  };

  const openPasswordModal = (target) => {
    // 既にセッション中で認証済みならパスワード入力をスキップ
    if (isAdminUnlocked) {
      executeAdminAction(target);
      return;
    }
    setPasswordTarget(target);
    setPasswordInput('');
    setPasswordError('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const closePasswordModal = () => {
    setPasswordTarget(null);
    setPasswordInput('');
    setPasswordError('');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      const target = passwordTarget;
      closePasswordModal();
      setIsAdminUnlocked(true); // セッション中は他のロック付きボタンも解放
      await executeAdminAction(target);
    } else {
      setPasswordError('パスワードが違います。');
      setPasswordInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const isYearEndPassword = passwordTarget === 'yearEnd';
  const isStocktakingPassword = passwordTarget === 'stocktaking';
  const passwordTitle = isYearEndPassword ? '年度更新' : isStocktakingPassword ? '棚卸し' : 'バックアップ';
  const passwordIconBg = isYearEndPassword ? 'bg-slate-100' : isStocktakingPassword ? 'bg-teal-100' : 'bg-purple-100';
  const passwordIcon = isYearEndPassword
    ? <RefreshCcw size={28} className="text-slate-700" />
    : isStocktakingPassword
    ? <ClipboardCheck size={28} className="text-teal-700" />
    : <Database size={28} className="text-purple-700" />;
  const passwordInputClass = isYearEndPassword
    ? 'focus:border-slate-400 bg-slate-50'
    : isStocktakingPassword
    ? 'focus:border-teal-400 bg-teal-50'
    : 'focus:border-purple-400 bg-purple-50';
  const fiscalDisplay = getFiscalDisplay(latestFiscalYearClosedAt);

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center">
      <Card className="relative w-full max-w-5xl overflow-hidden border-slate-200 bg-white px-8 py-10 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <div className="mx-auto mb-10 w-full max-w-4xl rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <Package size={28} />
              </div>
              <div className="text-left">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                    在庫管理システム
                  </h1>
                  <span className="text-xs font-bold text-slate-400">{fiscalDisplay.versionLabel}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-slate-500">InventManage</p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 md:items-end">
              <span className="text-[10px] font-black tracking-[0.18em] text-slate-400">FISCAL YEAR</span>
              <span className="text-sm font-black text-slate-800">{fiscalDisplay.periodLabel}</span>
            </div>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
          <MenuButton icon={<PlusCircle size={24} />} title="入庫画面" tone="emerald" onClick={() => setView('inbound')} />
          <MenuButton icon={<ClipboardList size={24} />} title="入出庫データ" tone="blue" onClick={() => (onNavigateHistory ? onNavigateHistory() : setView('history'))} />
          <MenuButton icon={<Table size={24} />} title="在庫表" tone="amber" onClick={() => (onNavigateStock ? onNavigateStock() : setView('stock'))} />
          <MenuButton icon={<MinusCircle size={24} />} title="出庫画面" tone="rose" onClick={() => setView('outbound')} />
          <MenuButton icon={<Package size={24} />} title="資産マスタ" tone="purple" onClick={() => setView('assets')} />
          <div className="flex flex-col gap-1.5">
            <SmallMenuButton icon={<ClipboardCheck size={18} />} title="棚卸し" tone="teal" onClick={() => openPasswordModal('stocktaking')} />
            <SmallMenuButton icon={<RefreshCcw size={18} />} title="年度更新" tone="slate" onClick={() => openPasswordModal('yearEnd')} />
            <SmallMenuButton icon={<Database size={18} />} title="バックアップ" tone="purple" onClick={() => openPasswordModal('backup')} />
          </div>
        </div>

        <div className="mx-auto mt-10 flex w-full max-w-4xl justify-end">
          <Button variant="danger" className="px-10 py-2 text-base" onClick={onLogout}>
            <LogOut size={20} />
            ログアウト
          </Button>
        </div>
      </Card>

      {showStocktakingWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-[28rem] flex flex-col items-center gap-5">
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-amber-100 rounded-full">
                <AlertTriangle size={28} className="text-amber-700" />
              </div>
              <h2 className="text-lg font-black text-slate-800">棚卸し未実施 / 期間経過</h2>
            </div>
            <div className="text-sm text-slate-700 text-center leading-relaxed">
              {lastStocktaking ? (
                <>
                  最後の棚卸しから<br />
                  <span className="font-black text-red-600 text-lg">
                    {Math.floor((Date.now() - new Date(lastStocktaking.completed_at).getTime()) / 86400000)} 日
                  </span> 経過しています。<br />
                  <span className="text-xs text-slate-500">
                    （{new Date(lastStocktaking.completed_at).toLocaleDateString('ja-JP')} 実施）
                  </span>
                </>
              ) : (
                <>
                  これまで<span className="font-black text-red-600">棚卸しが実施されていません</span>。
                </>
              )}
              <br /><br />
              年度更新前に棚卸しを実施することで、<br />
              <span className="font-bold">期末在庫を実地在庫に合わせる</span>ことができます。
            </div>
            <div className="flex flex-col gap-2 w-full">
              <Button variant="primary" className="w-full" onClick={() => { closeYearEnd(); setView('stocktaking'); }}>
                棚卸しを先に行う（推奨）
              </Button>
              <Button variant="danger" className="w-full" onClick={() => { setShowStocktakingWarning(false); setYearEndStep(1); }}>
                このまま年度更新へ進む
              </Button>
              <Button variant="secondary" className="w-full" onClick={closeYearEnd}>キャンセル</Button>
            </div>
          </div>
        </div>
      )}

      {yearEndStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-[28rem] flex flex-col items-center gap-5">
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-slate-100 rounded-full">
                <RefreshCcw size={28} className="text-slate-700" />
              </div>
              <h2 className="text-lg font-black text-slate-800">年度更新</h2>
            </div>

            {yearEndDone ? (
              <>
                <p className="text-sm text-emerald-700 font-bold text-center">年度更新が完了しました。</p>
                <p className="text-xs text-slate-500 text-center">
                  期末日（{yearEndDate}）時点の在庫を新年度の期首在庫として登録しました。<br />
                  入出庫履歴は<span className="font-bold">削除されず保持されます</span>（過去データ参照可）。
                </p>
                <Button variant="primary" className="w-full" onClick={closeYearEnd}>閉じる</Button>
              </>
            ) : (
              <>
                {yearEndStep === 1 && (
                  <>
                    <p className="text-sm text-slate-700 text-center leading-relaxed">
                      <span className="font-bold">期末日</span>を入力してください。<br />
                      この日付までの入出庫を集計し、<br />
                      期末在庫を新年度の<span className="font-bold">期首在庫</span>として登録します。
                    </p>
                    <label className="w-full flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-600">期末日</span>
                      <input
                        type="date"
                        value={yearEndDate}
                        onChange={(e) => setYearEndDate(e.target.value)}
                        className="p-2 border-2 rounded-lg outline-none focus:border-slate-400 bg-slate-50 text-lg font-bold text-center"
                      />
                    </label>
                    <div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 w-full">
                      ✅ 入出庫履歴は<span className="font-bold">削除されません</span>（過去年度の参照・分析が可能）。<br />
                      期末日より後の入出庫は新年度のデータとしてそのまま残ります。
                    </div>
                    {yearEndError && (
                      <p className="text-sm text-red-600 font-bold text-center">{yearEndError}</p>
                    )}
                    <div className="flex gap-2 w-full">
                      <Button variant="secondary" className="flex-1" onClick={closeYearEnd}>キャンセル</Button>
                      <Button variant="danger" className="flex-1" onClick={() => setYearEndStep(2)} disabled={!yearEndDate}>次へ</Button>
                    </div>
                  </>
                )}
                {yearEndStep === 2 && (
                  <>
                    <p className="text-sm text-slate-700 text-center leading-relaxed">
                      期末日：<span className="font-black text-slate-900 text-base">{yearEndDate}</span><br /><br />
                      ⚠ この操作は取り消せません。<br />
                      実行前に<span className="text-blue-700">自動でJSONバックアップ</span>を取ります<br />
                      （Supabase Storage と ローカルDL）。<br /><br />
                      <span className="font-black text-red-600 text-base">本当に年度更新しますか？</span>
                    </p>
                    {yearEndError && (
                      <p className="text-sm text-red-600 font-bold text-center">{yearEndError}</p>
                    )}
                    <div className="flex gap-2 w-full">
                      <Button variant="secondary" className="flex-1" onClick={closeYearEnd} disabled={yearEndRunning}>キャンセル</Button>
                      <Button variant="danger" className="flex-1" onClick={runYearEnd} disabled={yearEndRunning}>
                        {yearEndRunning ? 'バックアップ＆更新中...' : '実行する'}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {passwordTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-80 flex flex-col items-center gap-5">
            <div className="flex flex-col items-center gap-2">
              <div className={`p-3 rounded-full ${passwordIconBg}`}>
                {passwordIcon}
              </div>
              <h2 className="text-lg font-black text-slate-800">{passwordTitle}</h2>
              <p className="text-sm text-slate-500">パスワードを入力してください</p>
            </div>
            <form onSubmit={handlePasswordSubmit} className="w-full flex flex-col gap-3">
              <input
                ref={inputRef}
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
                className={`w-full p-3 text-center text-xl tracking-widest border-2 rounded-lg outline-none ${passwordInputClass}`}
                placeholder="●●●●"
                maxLength={10}
              />
              {passwordError && (
                <p className="text-sm text-red-600 font-bold text-center">{passwordError}</p>
              )}
              <Button type="submit" variant="primary" className="w-full py-3">確認</Button>
              <Button variant="secondary" className="w-full" onClick={closePasswordModal}>キャンセル</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const menuTones = {
  emerald: {
    button: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50',
    icon: 'bg-white text-emerald-600 ring-emerald-100',
    accent: 'bg-emerald-500',
  },
  blue: {
    button: 'border-blue-200 bg-blue-50/70 text-blue-700 hover:border-blue-300 hover:bg-blue-50',
    icon: 'bg-white text-blue-600 ring-blue-100',
    accent: 'bg-blue-500',
  },
  amber: {
    button: 'border-amber-200 bg-amber-50/70 text-amber-700 hover:border-amber-300 hover:bg-amber-50',
    icon: 'bg-white text-amber-600 ring-amber-100',
    accent: 'bg-amber-500',
  },
  rose: {
    button: 'border-rose-200 bg-rose-50/70 text-rose-700 hover:border-rose-300 hover:bg-rose-50',
    icon: 'bg-white text-rose-600 ring-rose-100',
    accent: 'bg-rose-500',
  },
  indigo: {
    button: 'border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50',
    icon: 'bg-white text-indigo-600 ring-indigo-100',
    accent: 'bg-indigo-500',
  },
  teal: {
    button: 'border-teal-200 bg-teal-50/80 text-teal-700 hover:border-teal-300 hover:bg-teal-50',
    icon: 'bg-white text-teal-600 ring-teal-100',
    accent: 'bg-teal-500',
  },
  slate: {
    button: 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-slate-100',
    icon: 'bg-white text-slate-600 ring-slate-100',
    accent: 'bg-slate-500',
  },
  purple: {
    button: 'border-purple-200 bg-purple-50/80 text-purple-700 hover:border-purple-300 hover:bg-purple-50',
    icon: 'bg-white text-purple-600 ring-purple-100',
    accent: 'bg-purple-500',
  },
};

function MenuButton({ icon, title, tone, onClick }) {
  const style = menuTones[tone] || menuTones.slate;

  return (
    <button
      onClick={onClick}
      className={`group relative flex min-h-[158px] flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border p-8 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] ${style.button}`}
    >
      <div className={`absolute left-5 right-5 top-0 h-1 rounded-b-full opacity-80 ${style.accent}`} />
      <div className={`rounded-full p-3 shadow-sm ring-8 transition-transform group-hover:scale-110 ${style.icon}`}>
        {icon}
      </div>
      <span className="text-lg font-black tracking-tight">{title}</span>
    </button>
  );
}

function SmallMenuButton({ icon, title, tone, onClick }) {
  const style = menuTones[tone] || menuTones.slate;

  return (
    <button
      onClick={onClick}
      className={`group flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-1.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${style.button}`}
    >
      <div className={`rounded-full p-1.5 shadow-sm ring-4 transition-transform group-hover:scale-110 ${style.icon}`}>
        {icon}
      </div>
      <span className="text-sm font-black">{title}</span>
    </button>
  );
}
