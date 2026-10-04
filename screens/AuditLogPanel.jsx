import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCcw, Search } from 'lucide-react';
import { Button } from '../components/ui.jsx';
import { fetchAuditLogs } from '../lib/audit.js';
import {
  AUDIT_OPERATIONS, AUDIT_TABLES, formatAuditValue, getAuditActor,
  getAuditChanges, getAuditTarget,
} from '../utils/audit.js';

const EMPTY_FILTERS = { fromDate: '', toDate: '', tableName: '', operation: '', recordId: '' };
const FIELD_CLASS = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100';
const OPERATION_COLORS = {
  INSERT: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  UPDATE: 'border-blue-200 bg-blue-50 text-blue-700',
  DELETE: 'border-rose-200 bg-rose-50 text-rose-700',
};
const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function ChangeDetails({ log }) {
  return (
    <div className="px-3 py-3 sm:px-8">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="w-1/4 px-2 py-2 text-left">項目</th>
            <th className="px-2 py-2 text-left">変更前</th>
            <th className="px-2 py-2 text-left">変更後</th>
          </tr>
        </thead>
        <tbody>
          {getAuditChanges(log).map((change) => (
            <tr key={change.field} className="border-b border-slate-100 align-top last:border-0">
              <th className="break-words px-2 py-2 text-left font-medium text-slate-600">{change.label}</th>
              <td className="whitespace-pre-wrap break-words px-2 py-2 text-slate-500">
                {formatAuditValue(change.field, change.before, log.table_name)}
              </td>
              <td className="whitespace-pre-wrap break-words px-2 py-2 font-medium text-slate-800">
                {formatAuditValue(change.field, change.after, log.table_name)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AuditLogPanel({ session, onAuthExpired }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [query, setQuery] = useState({ filters: EMPTY_FILTERS, cursors: [null], revision: 0 });
  const [result, setResult] = useState({ items: [], hasMore: false, nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setExpandedId(null);
    fetchAuditLogs(session, query.filters, query.cursors.at(-1))
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((err) => {
        if (cancelled) return;
        if (err.code === 'AUTH_EXPIRED') {
          onAuthExpired?.();
          return;
        }
        const message = /invent_audit_logs.*(?:schema cache|does not exist)|(?:schema cache|does not exist).*invent_audit_logs/i.test(err.message)
          ? '監査ログの初期設定がまだ完了していません。'
          : err.message;
        setError(message);
        setResult({ items: [], hasMore: false, nextCursor: null });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, query]);

  const applyFilters = (event) => {
    event.preventDefault();
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      setFilterError('終了日は開始日以降を指定してください。');
      return;
    }
    setFilterError('');
    setQuery({ filters: { ...filters }, cursors: [null], revision: query.revision + 1 });
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setFilterError('');
    setQuery({ filters: EMPTY_FILTERS, cursors: [null], revision: query.revision + 1 });
  };

  const changeFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form onSubmit={applyFilters} className="mb-4 border-b border-slate-200 pb-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <label className="text-xs font-bold text-slate-500">
            開始日
            <input type="date" value={filters.fromDate} onChange={(event) => changeFilter('fromDate', event.target.value)} className={FIELD_CLASS} />
          </label>
          <label className="text-xs font-bold text-slate-500">
            終了日
            <input type="date" value={filters.toDate} onChange={(event) => changeFilter('toDate', event.target.value)} className={FIELD_CLASS} />
          </label>
          <label className="text-xs font-bold text-slate-500">
            対象
            <select value={filters.tableName} onChange={(event) => changeFilter('tableName', event.target.value)} className={FIELD_CLASS}>
              <option value="">すべて</option>
              {Object.entries(AUDIT_TABLES).map(([table, name]) => <option key={table} value={table}>{name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">
            操作
            <select value={filters.operation} onChange={(event) => changeFilter('operation', event.target.value)} className={FIELD_CLASS}>
              <option value="">すべて</option>
              {Object.entries(AUDIT_OPERATIONS).map(([operation, name]) => <option key={operation} value={operation}>{name}</option>)}
            </select>
          </label>
          <label className="col-span-2 text-xs font-bold text-slate-500 lg:col-span-1">
            対象ID
            <input type="text" value={filters.recordId} onChange={(event) => changeFilter('recordId', event.target.value)} className={FIELD_CLASS} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="print" disabled={loading}><Search size={16} />絞り込む</Button>
          <Button variant="secondary" onClick={resetFilters} disabled={loading}>リセット</Button>
          <Button variant="secondary" className="ml-auto" disabled={loading} onClick={() => setQuery((current) => ({ ...current, cursors: [null], revision: current.revision + 1 }))}>
            <RefreshCcw size={16} />更新
          </Button>
        </div>
        {filterError && <p className="mt-2 text-sm text-red-700" role="alert">{filterError}</p>}
      </form>

      {error && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="min-h-0 flex-1 overflow-auto border-y border-slate-200" aria-busy={loading}>
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500" role="status">読み込み中...</p>
        ) : !error && result.items.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">該当する監査ログはありません。</p>
        ) : !error && (
          <table className="w-full min-w-[920px] table-fixed text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
              <tr>
                <th className="w-10 px-2 py-3"><span className="sr-only">詳細</span></th>
                <th className="w-40 px-3 py-3 text-left">日時（日本時間）</th>
                <th className="w-20 px-3 py-3 text-left">操作</th>
                <th className="w-24 px-3 py-3 text-left">対象</th>
                <th className="w-24 px-3 py-3 text-left">対象ID</th>
                <th className="px-3 py-3 text-left">名称・資産ID</th>
                <th className="w-52 px-3 py-3 text-left">操作アカウント</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((log) => {
                const expanded = expandedId === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <tr className={`border-b border-slate-100 align-top ${expanded ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                      <td className="px-2 py-2">
                        <button
                          type="button" onClick={() => setExpandedId(expanded ? null : log.id)}
                          title={expanded ? '詳細を閉じる' : '変更内容を表示'}
                          aria-label={`${AUDIT_TABLES[log.table_name] || log.table_name} ID ${log.record_id} の変更内容`}
                          aria-expanded={expanded}
                          className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-200"
                        >
                          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-slate-600">{timeFormatter.format(new Date(log.occurred_at))}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded border px-2 py-0.5 text-xs font-bold ${OPERATION_COLORS[log.operation] || ''}`}>{AUDIT_OPERATIONS[log.operation] || log.operation}</span>
                      </td>
                      <td className="break-words px-3 py-3 text-slate-600">{AUDIT_TABLES[log.table_name] || log.table_name}</td>
                      <td className="break-words px-3 py-3 font-mono text-xs text-slate-600">{log.record_id || '-'}</td>
                      <td className="break-words px-3 py-3 font-medium text-slate-800">{getAuditTarget(log)}</td>
                      <td className="break-words px-3 py-3 text-xs text-slate-600">{getAuditActor(log)}</td>
                    </tr>
                    {expanded && <tr className="border-b border-slate-200 bg-slate-50"><td colSpan={7}><ChangeDetails log={log} /></td></tr>}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-500">
        <span>{loading ? '' : `${query.cursors.length}ページ目・${result.items.length}件`}</span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={loading || Boolean(error) || query.cursors.length === 1} onClick={() => setQuery((current) => ({ ...current, cursors: current.cursors.slice(0, -1) }))}>
            <ChevronLeft size={16} />前へ
          </Button>
          <Button variant="secondary" disabled={loading || Boolean(error) || !result.hasMore} onClick={() => setQuery((current) => ({ ...current, cursors: [...current.cursors, result.nextCursor] }))}>
            次へ<ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
