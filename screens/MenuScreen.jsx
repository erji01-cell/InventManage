import React from 'react';
import { ClipboardList, Database, LogOut, MinusCircle, Package, PlusCircle, RefreshCcw, Table } from 'lucide-react';

import { Button } from '../components/ui.jsx';

export default function MenuScreen({ setView, onLogout, userEmail }) {
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
        <div className="flex flex-col gap-2">
          <SmallMenuButton icon={<Database size={20} />} title="バックアップ" color="bg-purple-50 text-purple-700" onClick={() => setView('backup')} />
          <SmallMenuButton icon={<RefreshCcw size={20} />} title="年度更新" color="bg-slate-50 text-slate-700" />
        </div>
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
