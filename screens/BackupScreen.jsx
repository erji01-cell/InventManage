import React, { useEffect, useState } from 'react';
import { ArrowLeft, Download, Upload, RefreshCcw, Trash2, Save } from 'lucide-react';

import { Button, Card } from '../components/ui.jsx';
import {
  performBackup,
  listStorageBackups,
  downloadStorageBackup,
  restoreFromPayload,
  downloadJsonLocally,
  isAutoBackupEnabled,
  setAutoBackupEnabled,
  getLastBackupTime,
} from '../lib/backup.js';

function formatDateTime(ts) {
  if (!ts) return '未実行';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseFileNameToDate(name) {
  // backup_2026-05-22_14-30-15.json
  const m = name.match(/backup_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.json/);
  if (!m) return name;
  return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}

export default function BackupScreen({ session, setView, onRestored }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [autoEnabled, setAutoEnabledState] = useState(isAutoBackupEnabled());
  const [lastBackup, setLastBackup] = useState(getLastBackupTime());

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listStorageBackups(session);
      setItems(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleBackup = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await performBackup(session);
      setLastBackup(getLastBackupTime());
      setMessage(`バックアップ完了: ${result.fileName}${result.pruneResult ? `（古い ${result.pruneResult.deleted} 件を削除）` : ''}`);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreFromStorage = async (fileName) => {
    if (busy) return;
    if (!window.confirm(`${fileName} で復元します。\n現在のデータは同IDのものが上書きされます。よろしいですか?`)) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const payload = await downloadStorageBackup(session, fileName);
      const result = await restoreFromPayload(payload, session);
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      setMessage(`復元完了: 合計 ${total} 件`);
      if (onRestored) await onRestored();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadFromStorage = async (fileName) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const payload = await downloadStorageBackup(session, fileName);
      downloadJsonLocally(payload, fileName);
      setMessage(`${fileName} をダウンロードしました。`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreFromFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!window.confirm(`${file.name} で復元します。\n現在のデータは同IDのものが上書きされます。よろしいですか?`)) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = await restoreFromPayload(payload, session);
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      setMessage(`復元完了: 合計 ${total} 件`);
      if (onRestored) await onRestored();
    } catch (e) {
      setError(`復元に失敗しました: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleAuto = () => {
    const next = !autoEnabled;
    setAutoBackupEnabled(next);
    setAutoEnabledState(next);
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="secondary" onClick={() => setView('menu')}>
          <ArrowLeft size={16} />
          メニュー
        </Button>
        <h1 className="text-2xl font-bold">バックアップ管理</h1>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm whitespace-pre-wrap">
          {error}
        </div>
      )}

      <Card className="mb-4">
        <h2 className="text-lg font-bold mb-3">手動バックアップ / 復元</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="success" onClick={handleBackup} disabled={busy}>
            <Save size={16} />
            今すぐバックアップ
          </Button>
          <label className={`px-4 py-2 rounded-md font-medium flex items-center gap-2 shadow-sm border cursor-pointer bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Upload size={16} />
            ファイルから復元
            <input type="file" accept="application/json,.json" onChange={handleRestoreFromFile} disabled={busy} className="hidden" />
          </label>
          <Button variant="secondary" onClick={refresh} disabled={busy || loading}>
            <RefreshCcw size={16} />
            一覧を更新
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          バックアップ実行時：① Supabase Storage に JSON 保存 ② ローカルに JSON ダウンロード ③ 古いバックアップを直近30件まで自動削除。
        </p>
      </Card>

      <Card className="mb-4">
        <h2 className="text-lg font-bold mb-3">自動バックアップ設定</h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={autoEnabled} onChange={toggleAuto} className="w-4 h-4" />
          <span className="text-sm">アプリ起動時、前回バックアップから 24 時間以上経過していれば自動実行する</span>
        </label>
        <p className="mt-2 text-sm text-slate-600">
          前回バックアップ: <span className="font-bold">{formatDateTime(lastBackup)}</span>
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-bold mb-3">Storage 内のバックアップ（最新 {items.length} 件 / 最大30件保持）</h2>
        {loading ? (
          <p className="text-slate-500 text-sm">読み込み中...</p>
        ) : items.length === 0 ? (
          <p className="text-slate-500 text-sm">バックアップはありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2">日時</th>
                  <th className="text-left p-2">ファイル名</th>
                  <th className="text-right p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.name} className="border-t border-slate-100">
                    <td className="p-2 font-mono">{parseFileNameToDate(it.name)}</td>
                    <td className="p-2 font-mono text-xs text-slate-500">{it.name}</td>
                    <td className="p-2">
                      <div className="flex gap-2 justify-end">
                        <Button variant="secondary" onClick={() => handleDownloadFromStorage(it.name)} disabled={busy}>
                          <Download size={14} />
                          DL
                        </Button>
                        <Button variant="danger" onClick={() => handleRestoreFromStorage(it.name)} disabled={busy}>
                          <Upload size={14} />
                          復元
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
