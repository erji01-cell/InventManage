import React, { useEffect, useState } from 'react';
import { Database, Download, Upload, RefreshCcw, Save, X } from 'lucide-react';

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
  getLatestStorageBackupTime,
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
  const [restoreMode, setRestoreMode] = useState('merge'); // 'merge' | 'replace'

  const restoreConfirmText = (name) =>
    restoreMode === 'replace'
      ? `${name} で【完全復元】します。\n\n・バックアップ時点の状態に完全に戻します\n・バックアップより後に追加されたデータは削除されます\n・担当者マスタは保護のため変更されません\n\nよろしいですか?`
      : `${name} で復元します。\n\n・同IDのデータはバックアップの内容で上書きされます\n・バックアップより後に追加されたデータはそのまま残ります\n・担当者マスタは保護のため変更されません\n\nよろしいですか?`;

  const summarizeRestore = (result) => {
    let upserted = 0;
    let deleted = 0;
    Object.values(result).forEach((v) => {
      if (v && typeof v === 'object') {
        upserted += v.upserted || 0;
        deleted += v.deleted || 0;
      }
    });
    return `復元完了: ${upserted} 件を書き戻し${restoreMode === 'replace' ? `、後から追加された ${deleted} 件を削除` : ''}（担当者マスタは対象外）`;
  };

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listStorageBackups(session);
      setItems(list);
      setLastBackup(await getLatestStorageBackupTime(session));
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
    if (!window.confirm(restoreConfirmText(fileName))) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const payload = await downloadStorageBackup(session, fileName);
      const result = await restoreFromPayload(payload, session, { mode: restoreMode });
      setMessage(summarizeRestore(result));
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
    if (!window.confirm(restoreConfirmText(file.name))) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = await restoreFromPayload(payload, session, { mode: restoreMode });
      setMessage(summarizeRestore(result));
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
    <Card className="max-h-[90vh] flex flex-col relative">
      <button
        onClick={() => setView('menu')}
        className="absolute top-3 right-3 rounded-full p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors z-10"
        title="閉じる"
      >
        <X size={20} />
      </button>

      {/* ヘッダー */}
      <div className="mb-5 flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-500">Backup & Restore</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">バックアップ管理</h2>
          <p className="mt-2 text-sm text-slate-500">データを JSON 形式で保存・復元します</p>
        </div>
        <div className="flex items-center gap-3 mr-8">
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
      </div>

      {/* メッセージ */}
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

      {/* 自動バックアップ設定 */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-6 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={autoEnabled} onChange={toggleAuto} className="w-4 h-4" />
          <span className="text-sm font-medium">自動バックアップ（起動時＋変更の3分後）</span>
        </label>
        <span className="text-sm text-slate-500">
          前回: <span className="font-bold text-slate-700">{formatDateTime(lastBackup)}</span>
        </span>
        <span className="text-xs text-slate-400 ml-auto">
          ① Storage 保存 ② ローカル DL ③ 古い分を自動削除（最大30件）
        </span>
      </div>

      {/* 復元モード */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-6 flex-wrap">
          <span className="text-sm font-bold text-slate-600">復元方法</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="restoreMode"
              checked={restoreMode === 'merge'}
              onChange={() => setRestoreMode('merge')}
              className="accent-blue-600"
            />
            <span className="text-sm font-medium">通常復元（上書きのみ・後から追加したデータは残る）</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="restoreMode"
              checked={restoreMode === 'replace'}
              onChange={() => setRestoreMode('replace')}
              className="accent-red-600"
            />
            <span className={`text-sm font-medium ${restoreMode === 'replace' ? 'text-red-700 font-bold' : ''}`}>
              完全復元（バックアップ時点に戻す・後から追加したデータは削除）
            </span>
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          ※ どちらの方法でも担当者マスタ（invent_staff）は保護のため変更されません。
        </p>
      </div>

      {/* Storage 一覧 */}
      <div className="overflow-auto flex-1">
        <div className="mb-2 text-sm font-bold text-slate-600">
          Storage 内のバックアップ（{items.length} 件 / 最大30件保持）
        </div>
        {loading ? (
          <p className="text-slate-500 text-sm">読み込み中...</p>
        ) : items.length === 0 ? (
          <p className="text-slate-500 text-sm">バックアップはありません。</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-100 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 border-b border-slate-200">日時</th>
                <th className="text-left px-3 py-2 border-b border-slate-200">ファイル名</th>
                <th className="text-right px-3 py-2 border-b border-slate-200">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.name} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono">{parseFileNameToDate(it.name)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{it.name}</td>
                  <td className="px-3 py-2">
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
        )}
      </div>
    </Card>
  );
}
