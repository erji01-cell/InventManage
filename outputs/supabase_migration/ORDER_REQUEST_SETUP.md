# 発注・通知機能のSupabase設定

## 1. 発注テーブル

SupabaseのSQL Editorで `create_order_requests.sql` を実行します。発注テーブルとRLS設定が作成されます。

発注テーブルをすでに作成済みの場合は、`add_order_delivery_status.sql` を実行して「納品完了」状態を追加します。

## 2. メール送信設定

ResendでAPIキーを作成し、Supabase Edge FunctionsのSecretsへ次の3項目を設定します。

- `RESEND_API_KEY`: ResendのAPIキー
- `ORDER_NOTIFICATION_EMAIL`: 通知先メールアドレス。複数の場合はカンマ区切り
- `ORDER_NOTIFICATION_FROM`: 送信元。例 `InventManage <orders@example.jp>`

Resendでは本番送信前に送信元ドメインの認証が必要です。試験時のみ `InventManage <onboarding@resend.dev>` を利用できます。

## 3. Edge Functionの配置

Supabase CLIでログイン・プロジェクト接続済みの状態で実行します。

```powershell
supabase functions deploy send-order-notification --no-verify-jwt
```

Edge Function内でSupabase Authへ問い合わせ、ログイン中の利用者であることを確認します。

## 通知の動作

- 発注登録直後にEdge Functionからメールを送信
- 通知先側でアプリが開いているかどうかには影響されません

メール送信だけ失敗した場合も発注は保存されます。発注一覧の「再送」から再実行できます。

## 4. 納品完了データの保存期間

SupabaseのSQL Editorで `order_requests_one_year_retention.sql` を1回実行します。

- 実行時点で、納品完了から1年を超えたデータを削除
- 以後は毎日03:10（日本時間）に、納品完了から1年を超えたデータを自動削除
- 発注未完了・発注完了（未納品）のデータは削除しない
- 判定にはSupabaseのサーバー時刻を使用
