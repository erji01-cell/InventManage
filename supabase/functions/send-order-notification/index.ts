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
  const order = body?.order;
  if (!order?.id || !order?.assetName || !Number.isInteger(Number(order.quantity)) || Number(order.quantity) <= 0) {
    return Response.json({ error: '発注データが正しくありません。' }, { status: 400, headers: corsHeaders });
  }

  const unit = order.purchaseUnit ? ` ${escapeHtml(order.purchaseUnit)}` : '';
  const memo = order.memo ? escapeHtml(order.memo).replaceAll('\n', '<br>') : '-';
  const recipients = notificationEmail.split(',').map((value) => value.trim()).filter(Boolean);
  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `【在庫管理】${order.supplierName || '発注先未設定'}への発注依頼`,
      html: `
        <div style="font-family: sans-serif; color: #1e293b; line-height: 1.7">
          <h2 style="margin-bottom: 16px">新しい発注依頼が登録されました</h2>
          <table style="border-collapse: collapse">
            <tr><th style="padding: 6px 18px 6px 0; text-align: left">発注先</th><td>${escapeHtml(order.supplierName || '発注先未設定')}</td></tr>
            <tr><th style="padding: 6px 18px 6px 0; text-align: left">資産</th><td>${escapeHtml(order.assetName)}</td></tr>
            <tr><th style="padding: 6px 18px 6px 0; text-align: left">発注個数</th><td><strong>${Number(order.quantity).toLocaleString('ja-JP')}${unit}</strong></td></tr>
            <tr><th style="padding: 6px 18px 6px 0; text-align: left">登録者</th><td>${escapeHtml(order.requestedBy || '-')}</td></tr>
            <tr><th style="padding: 6px 18px 6px 0; text-align: left">摘要</th><td>${memo}</td></tr>
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
    `${supabaseUrl}/rest/v1/invent_order_requests?id=eq.${encodeURIComponent(order.id)}`,
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
