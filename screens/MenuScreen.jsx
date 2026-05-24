import React, { useRef, useState } from 'react';
import { AlertTriangle, ClipboardCheck, ClipboardList, Database, LogOut, MinusCircle, Package, PlusCircle, RefreshCcw, Table } from 'lucide-react';

import { Button, Card } from '../components/ui.jsx';

const ADMIN_PASSWORD = '0125';

export default function MenuScreen({ setView, onLogout, userEmail, onYearEndUpdate, onFetchLastStocktaking }) {
  const [passwordTarget, setPasswordTarget] = useState(null); // 'backup' | 'yearEnd' | 'stocktaking' | null
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const inputRef = useRef(null);
  const [yearEndStep, setYearEndStep] = useState(0); // 0: closed, 1: first confirm, 2: second confirm
  const [yearEndRunning, setYearEndRunning] = useState(false);
  const [yearEndError, setYearEndError] = useState('');
  const [yearEndDone, setYearEndDone] = useState(false);
  const [showStocktakingWarning, setShowStocktakingWarning] = useState(false);
  const [lastStocktaking, setLastStocktaking] = useState(null);

  const closeYearEnd = () => {
    setYearEndStep(0);
    setYearEndRunning(false);
    setYearEndError('');
    setYearEndDone(false);
    setShowStocktakingWarning(false);
    setLastStocktaking(null);
  };

  const runYearEnd = async () => {
    setYearEndRunning(true);
    setYearEndError('');
    try {
      await onYearEndUpdate?.();
      setYearEndDone(true);
    } catch (err) {
      setYearEndError(err?.message || '年度更新に失敗しました。');
    } finally {
      setYearEndRunning(false);
    }
  };

  const openPasswordModal = (target) => {
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
      if (target === 'backup') {
        setView('backup');
      } else if (target === 'stocktaking') {
        setView('stocktaking');
      } else if (target === 'yearEnd') {
        // 棚卸し実施状況をチェック
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

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-5xl flex flex-col items-center gap-10 py-12 px-8">
        <div className="text-center">
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-800 mb-2">
            在庫管理システム <span className="text-orange-500 font-normal">2026年度版</span>
          </h1>
          <p className="text-xl text-slate-500">2026.07.01 更新</p>
          {userEmail && <p className="mt-2 text-sm text-slate-400">{userEmail}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          <MenuButton icon={<PlusCircle size={24} />} title="入庫画面" color="bg-emerald-50 text-emerald-700" onClick={() => setView('inbound')} />
          <MenuButton icon={<ClipboardList size={24} />} title="入出庫データ" color="bg-blue-50 text-blue-700" onClick={() => setView('history')} />
          <MenuButton icon={<Table size={24} />} title="在庫表" color="bg-amber-50 text-amber-700" onClick={() => setView('stock')} />
          <MenuButton icon={<MinusCircle size={24} />} title="出庫画面" color="bg-rose-50 text-rose-700" onClick={() => setView('outbound')} />
          <MenuButton icon={<Package size={24} />} title="資産マスタ" color="bg-indigo-50 text-indigo-700" onClick={() => setView('assets')} />
          <div className="flex flex-col gap-2">
            <SmallMenuButton icon={<ClipboardCheck size={20} />} title="棚卸し" color="bg-teal-50 text-teal-700" onClick={() => openPasswordModal('stocktaking')} />
            <SmallMenuButton icon={<RefreshCcw size={20} />} title="年度更新" color="bg-slate-50 text-slate-700" onClick={() => openPasswordModal('yearEnd')} />
            <SmallMenuButton icon={<Database size={20} />} title="バックアップ" color="bg-purple-50 text-purple-700" onClick={() => openPasswordModal('backup')} />
          </div>
        </div>

        <Button variant="danger" className="px-12 py-3 text-lg" onClick={onLogout}>
          <LogOut size={20} />
          ログアウト
        </Button>
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
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-96 flex flex-col items-center gap-5">
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
                  バックアップ（JSON）を保存後、期末在庫が新年度の期首在庫として登録され、入出庫履歴は削除されました。
                </p>
                <Button variant="primary" className="w-full" onClick={closeYearEnd}>閉じる</Button>
              </>
            ) : (
              <>
                {yearEndStep === 1 && (
                  <>
                    <p className="text-sm text-slate-700 text-center leading-relaxed">
                      期末在庫を新年度の<span className="font-bold">期首在庫</span>として登録し、<br />
                      これまでの入出庫履歴を<span className="font-bold text-red-600">全て削除</span>します。<br /><br />
                      <span className="font-black text-red-600">年度更新しますか？</span>
                    </p>
                    {yearEndError && (
                      <p className="text-sm text-red-600 font-bold text-center">{yearEndError}</p>
                    )}
                    <div className="flex gap-2 w-full">
                      <Button variant="secondary" className="flex-1" onClick={closeYearEnd}>キャンセル</Button>
                      <Button variant="danger" className="flex-1" onClick={() => setYearEndStep(2)}>はい</Button>
                    </div>
                  </>
                )}
                {yearEndStep === 2 && (
                  <>
                    <p className="text-sm text-red-700 text-center leading-relaxed font-bold">
                      ⚠ この操作は取り消せません。<br /><br />
                      実行前に<span className="text-blue-700">自動でJSONバックアップ</span>を取ります<br />
                      （Supabase Storage と ローカルDL）。<br />
                      入出庫履歴は全て削除されます。<br />
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

function SmallMenuButton({ icon, title, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`${color} py-3 px-4 rounded-xl shadow-sm border border-current border-opacity-10 hover:shadow-md transition-all flex flex-1 items-center justify-center gap-3 group active:scale-95`}
    >
      <div className="p-2 bg-white bg-opacity-50 rounded-full group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <span className="text-base font-bold">{title}</span>
    </button>
  );
}
