import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuditQuery, formatAuditValue, getAuditActor, getAuditChanges, getAuditTarget,
} from '../utils/audit.js';

test('audit date filters include the full end date in Japan time', () => {
  const params = new URLSearchParams(buildAuditQuery({ fromDate: '2026-10-01', toDate: '2026-10-31' }).split('?')[1]);
  assert.deepEqual(params.getAll('occurred_at'), [
    'gte.2026-10-01T00:00:00+09:00', 'lt.2026-11-01T00:00:00+09:00',
  ]);
  const leapDay = new URLSearchParams(buildAuditQuery({ toDate: '2028-02-29' }).split('?')[1]);
  assert.equal(leapDay.get('occurred_at'), 'lt.2028-03-01T00:00:00+09:00');
});

test('paging uses timestamp and ID together without an offset', () => {
  const params = new URLSearchParams(buildAuditQuery(
    { tableName: 'invent_parent_assets', operation: 'UPDATE', recordId: ' P-0042 ' },
    { occurred_at: '2026-10-04T08:00:00.123456+00:00', id: 80 },
  ).split('?')[1]);
  assert.equal(params.get('order'), 'occurred_at.desc,id.desc');
  assert.equal(params.get('limit'), '51');
  assert.equal(params.get('record_id'), 'eq.P-0042');
  assert.equal(params.get('table_name'), 'eq.invent_parent_assets');
  assert.equal(params.get('operation'), 'eq.UPDATE');
  assert.equal(params.get('or'), '(occurred_at.lt.2026-10-04T08:00:00.123456+00:00,and(occurred_at.eq.2026-10-04T08:00:00.123456+00:00,id.lt.80))');
  assert.equal(params.has('offset'), false);
});

test('a record ID containing URL separators cannot add filters', () => {
  const params = new URLSearchParams(buildAuditQuery({ recordId: 'P-1&operation=eq.DELETE' }).split('?')[1]);
  assert.equal(params.get('record_id'), 'eq.P-1&operation=eq.DELETE');
  assert.equal(params.has('operation'), false);
});

test('changed fields retain null, zero and false values', () => {
  const changes = getAuditChanges({
    operation: 'UPDATE', old_data: { delivery_price: 10, is_active: true, child_memo: '旧摘要', maker: '同じ' },
    new_data: { delivery_price: 0, is_active: false, child_memo: null, maker: '同じ' },
    changed_fields: ['delivery_price', 'is_active', 'child_memo', 'maker'],
  });
  assert.deepEqual(changes.map((change) => [change.field, change.after]), [
    ['delivery_price', 0], ['is_active', false], ['child_memo', null],
  ]);
  assert.equal(formatAuditValue('delivery_price', 0), '0');
  assert.equal(formatAuditValue('is_active', false), '無効');
});

test('deleted records are displayed using the saved snapshot', () => {
  const log = { operation: 'DELETE', old_data: { id: 519, brand_name: '削除済みの資産', child_memo: '過去の摘要' }, new_data: null };
  assert.equal(getAuditTarget(log), '削除済みの資産');
  assert.equal(getAuditChanges(log).find((change) => change.field === 'child_memo').before, '過去の摘要');
});

test('identical status codes have the correct label for each table', () => {
  assert.equal(formatAuditValue('status', 'completed', 'invent_order_requests'), '発注完了');
  assert.equal(formatAuditValue('status', 'completed', 'invent_inventory_counts'), '完了');
});

test('the authenticated operator is distinct from the selected input staff', () => {
  assert.equal(getAuditActor({ actor_email: 'operator@example.test', new_data: { staff_name: '入力担当者' } }), 'operator@example.test');
  assert.equal(getAuditActor({ actor_role: 'service_role' }), '自動処理');
  assert.equal(getAuditActor({ actor_role: 'postgres' }), 'DB管理・自動処理');
});
