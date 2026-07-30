# 発注・通知機能のSupabase設定

## 1. テーブルとRealtime

SupabaseのSQL Editorで `create_order_requests.sql` を実行します。発注テーブル、RLS、Realtime公開設定が作成されます。

## 2. メール送信設定

ResendでAPIキーを作成し、Supabase Edge FunctionsのSecretsへ次の3項目を設定します。

- `RESEND_API_KEY`: ResendのAPIキー
- `ORDER_NOTIFICATION_EMAIL`: 通知先メールアドレス。複数の場合はカンマ区切り
- `ORDER_NOTIFICATION_FROM`: 送信元。例 `InventManage <orders@example.jp>`

Resendでは本番送信前に送信元ドメインの認証が必要です。試験時のみ `InventManage <onboarding@resend.dev>` を利用できます。

## 3. Edge Functionの配置

Supabase CLIでログイン・プロジェクト接続済みの状態で実行します。

```powershell
supabase functions deploy send-order-notification
```

ブラウザから呼ぶ関数なのでJWT検証は有効のままにします。アプリ側でもJWTを検証し、ログイン中の利用者だけがメールを送れます。

## 通知の動作

- アプリ起動中: `invent_order_requests`の変更をSupabase Realtimeで受信し、画面内バナーと許可済みのPC通知を表示
- アプリ起動時: 前回確認後に追加された未完了発注を表示
- アプリの開閉に関係なく: 発注登録直後にEdge Functionからメールを送信

メール送信だけ失敗した場合も発注は保存されます。発注一覧の「再送」から再実行できます。
