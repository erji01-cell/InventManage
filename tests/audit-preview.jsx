// Isolated UI fixture: every API request is mocked; no production writes or reads.
import React from 'react';
import { createRoot } from 'react-dom/client';
import DataManagementScreen from '../screens/DataManagementScreen.jsx';
import '../styles.css';

const scenario = new URLSearchParams(window.location.search).get('state');
const logs = Array.from({ length: 55 }, (_, index) => {
  const id = 55 - index;
  const operation = index === 1 ? 'DELETE' : index === 2 ? 'INSERT' : 'UPDATE';
  const oldData = { id, brand_name: `テスト資産${id}`, delivery_price: 1500, child_memo: '変更前の摘要' };
  const newData = { ...oldData, delivery_price: 1200, child_memo: '購入価格を修正' };
  return {
    id, occurred_at: new Date(Date.UTC(2026, 9, 4, 7, 0, 0) - index * 60000).toISOString(),
    table_name: 'invent_child_assets', record_id: String(id), operation,
    actor_email: 'operator@example.test', actor_role: 'authenticated',
    old_data: operation === 'INSERT' ? null : oldData,
    new_data: operation === 'DELETE' ? null : newData,
    changed_fields: operation === 'UPDATE' ? ['delivery_price', 'child_memo'] : Object.keys(oldData),
  };
});

window.fetch = async (input) => {
  const url = new URL(String(input));
  const params = url.searchParams;
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname === '/storage/v1/object/list/backups') return json([]);
  if (url.pathname !== '/rest/v1/invent_audit_logs') return json({ message: 'Test fixture blocks this request.' }, 400);
  if (scenario === 'unconfigured') return json({ message: "Could not find the table 'public.invent_audit_logs' in the schema cache" }, 404);
  if (scenario === 'empty') return json([]);
  let filtered = logs;
  for (const field of ['table_name', 'operation', 'record_id']) {
    if (params.has(field)) filtered = filtered.filter((log) => log[field] === params.get(field).slice(3));
  }
  for (const filter of params.getAll('occurred_at')) {
    const [operator, ...value] = filter.split('.');
    const boundary = Date.parse(value.join('.'));
    filtered = filtered.filter((log) => operator === 'gte' ? Date.parse(log.occurred_at) >= boundary : Date.parse(log.occurred_at) < boundary);
  }
  const cursorId = params.get('or')?.match(/id\.lt\.(\d+)/)?.[1];
  if (cursorId) filtered = filtered.filter((log) => log.id < Number(cursorId));
  return json(filtered.slice(0, Number(params.get('limit'))));
};

const session = { access_token: 'test-only', expires_at: 4102444800 };
createRoot(document.getElementById('root')).render(
  <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-900 md:p-8">
    <div className="mx-auto max-w-7xl">
      <DataManagementScreen session={session} setView={() => {}} onRestored={async () => {}} />
    </div>
  </div>,
);
