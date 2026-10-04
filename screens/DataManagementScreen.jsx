import React, { useState } from 'react';
import { Database, History, X } from 'lucide-react';
import { Button, Card } from '../components/ui.jsx';
import BackupScreen from './BackupScreen.jsx';
import AuditLogPanel from './AuditLogPanel.jsx';

export default function DataManagementScreen({ session, setView, onRestored, onAuthExpired }) {
  const [tab, setTab] = useState('backup');
  const [busy, setBusy] = useState(false);

  return (
    <Card className="flex max-h-[90vh] min-h-0 flex-col">
      <header className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-4">
        <Database size={24} className="text-slate-500" />
        <h2 className="text-2xl font-black text-slate-900">データ管理</h2>
      </header>

      <div role="tablist" aria-label="データ管理" className="mb-5 flex shrink-0 border-b border-slate-200">
        {[
          { id: 'backup', label: 'バックアップ・復元', icon: Database },
          { id: 'audit', label: '監査ログ', icon: History },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id} id={`data-tab-${id}`} type="button" role="tab"
            aria-selected={tab === id} aria-controls={`data-panel-${id}`}
            onClick={() => setTab(id)} disabled={busy}
            className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-bold transition-colors sm:px-5 ${tab === id ? 'border-slate-700 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      <div id={`data-panel-${tab}`} role="tabpanel" aria-labelledby={`data-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {tab === 'backup'
          ? <BackupScreen session={session} setView={setView} onRestored={onRestored} embedded onBusyChange={setBusy} />
          : <AuditLogPanel session={session} onAuthExpired={onAuthExpired} />}
      </div>

      <footer className="mt-4 flex shrink-0 justify-end border-t border-slate-200 pt-4">
        <Button variant="secondary" disabled={busy} onClick={() => setView('menu')}><X size={16} />閉じる</Button>
      </footer>
    </Card>
  );
}
