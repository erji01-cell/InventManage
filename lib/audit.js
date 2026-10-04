import { supabaseRequest } from './supabase.js';
import { buildAuditQuery } from '../utils/audit.js';

export const AUDIT_PAGE_SIZE = 50;

export async function fetchAuditLogs(session, filters, cursor = null) {
  const rows = await supabaseRequest(buildAuditQuery(filters, cursor, AUDIT_PAGE_SIZE), {}, session);
  const items = rows.slice(0, AUDIT_PAGE_SIZE);
  const last = items.at(-1);
  return {
    items,
    hasMore: rows.length > AUDIT_PAGE_SIZE,
    nextCursor: last ? { occurred_at: last.occurred_at, id: last.id } : null,
  };
}
