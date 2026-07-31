const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'POSTのみ利用できます。' }, { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const notificationEmail = Deno.env.get('ORDER_NOTIFICATION_EMAIL');
  const from = Deno.env.get('ORDER_NOTIFICATION_FROM') || 'InventManage <onboarding@resend.dev>';
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !supabaseAnonKey || !authorization) {
    return Response.json({ error: '認証情報がありません。' }, { status: 401, headers: corsHeaders });
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: authorization },
  });
  if (!userResponse.ok) {
    return Response.json({ error: 'ログイン情報を確認できません。' }, { status: 401, headers: corsHeaders });
  }
  if (!resendApiKey || !notificationEmail) {
    return Response.json(
      { error: 'メール通知の秘密情報が未設定です。RESEND_API_KEYとORDER_NOTIFICATION_EMAILを確認してください。' },
      { status: 500, headers: corsHeaders }
    );
  }

  const body = await request.json().catch(() => null);
  const orders = Array.isArray(body?.orders) ? body.orders : body?.order ? [body.order] : [];
  const isValidOrder = (order: Record<string, unknown>) => (
    /^\d+$/.test(String(order?.id || ''))
    && Boolean(order?.assetName)
    && Number.isInteger(Number(order?.quantity))
    && Number(order.quantity) > 0
  );
  if (orders.length === 0 || orders.length > 100 || !orders.every(isValidOrder)) {
    return Response.json({ error: '発注データが正しくありません。' }, { status: 400, headers: corsHeaders });
  }

  const supplierNames = [...new Set(orders.map((order) => order.supplierName || '発注先未設定'))];
  const subject = orders.length === 1
    ? `【在庫管理】${supplierNames[0]}への発注依頼`
    : supplierNames.length === 1
      ? `【在庫管理】${supplierNames[0]}への発注依頼（${orders.length}商品）`
      : `【在庫管理】発注依頼（${orders.length}商品・${supplierNames.length}社）`;
  const orderRows = orders.map((order) => {
    const unit = order.purchaseUnit ? ` ${escapeHtml(order.purchaseUnit)}` : '';
    const memo = order.memo ? escapeHtml(order.memo).replaceAll('\n', '<br>') : '-';
    return `
      <tr>
        <td style="border-bottom: 1px solid #e2e8f0; padding: 10px 12px">${escapeHtml(order.supplierName || '発注先未設定')}</td>
        <td style="border-bottom: 1px solid #e2e8f0; padding: 10px 12px">${escapeHtml(order.assetName)}</td>
        <td style="border-bottom: 1px solid #e2e8f0; padding: 10px 12px; text-align: right; white-space: nowrap"><strong>${Number(order.quantity).toLocaleString('ja-JP')}${unit}</strong></td>
        <td style="border-bottom: 1px solid #e2e8f0; padding: 10px 12px">${memo}</td>
      </tr>
    `;
  }).join('');
  const requestedBy = [...new Set(orders.map((order) => order.requestedBy || '-'))].join(', ');
  const orderIds = orders.map((order) => String(order.id));
  const idempotencyDigest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(orderIds.join(','))
  );
  const idempotencyKey = `invent-order-${Array.from(new Uint8Array(idempotencyDigest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
  const recipients = notificationEmail.split(',').map((value) => value.trim()).filter(Boolean);
  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html: `
        <div style="font-family: sans-serif; color: #1e293b; line-height: 1.7">
          <h2 style="margin-bottom: 16px">新しい発注依頼が登録されました</h2>
          <p style="color: #64748b">登録者: ${escapeHtml(requestedBy)}</p>
          <table style="border-collapse: collapse; width: 100%; max-width: 900px">
            <thead>
              <tr style="background: #f1f5f9">
                <th style="padding: 10px 12px; text-align: left">発注先</th>
                <th style="padding: 10px 12px; text-align: left">資産</th>
                <th style="padding: 10px 12px; text-align: right">発注個数</th>
                <th style="padding: 10px 12px; text-align: left">摘要</th>
              </tr>
            </thead>
            <tbody>${orderRows}</tbody>
          </table>
        </div>
      `,
    }),
  });
  const result = await emailResponse.json().catch(() => null);
  if (!emailResponse.ok) {
    return Response.json(
      { error: result?.message || 'メールサービスからエラーが返されました。' },
      { status: 502, headers: corsHeaders }
    );
  }

  const emailSentAt = new Date().toISOString();
  const markResponse = await fetch(
    `${supabaseUrl}/rest/v1/invent_order_requests?id=in.(${orderIds.join(',')})`,
    {
      method: 'PATCH',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: authorization,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email_sent_at: emailSentAt }),
    }
  );

  return Response.json({
    ok: true,
    id: result?.id,
    emailSentAt,
    warning: markResponse.ok ? null : 'メールは送信されましたが、送信済み表示を保存できませんでした。',
  }, { headers: corsHeaders });
});
