# Agent Handover Log

## 共通記録ルール

- 変更作業ごとに日時、作業場所、使用ツール、変更内容・ファイル、検証結果、残タスクを記録する。既存の追記順を維持する。
- 端末名 `DESKTOP-P1TKLAH` は自宅、`DESKTOP-22CKAVI` は職場。未登録の端末は推測せず「未確認」と記録する。
- 作業後は関連する変更と本ログをコミットし、追跡先にpushする。無関係な差分は含めず、pushできなければ理由を記録する。
- 適用記録: 2026-09-24 22:22（自宅）Codex / GPT-6 が本ルールを `AGENT_LOG.md` に追加。差分チェック済み。残タスクなし。

複数のAIツール（Claude Code / Codex / Cursor など）でこのプロジェクトを触るときの
引き継ぎノート。セッション終了時に自動追記される運用（`~/.claude/hooks/agent-log-stop.sh`）。

新しいエントリは**先頭に追加**する（最新が一番上）。見出しには日時と作業場所
（職場/自宅、ホスト名から自動判定）を含める。詳しい経緯や設計判断は
[HANDOFF.md](HANDOFF.md) に譲り、ここは「いつ・どのツールで・何をしたか」の
短い記録に留める。

---

## 2026-10-08 11:06（職場）Codex / GPT-6
- **作業内容**: 発注一覧に山下医科器械専用のA4縦「注文書」を追加。現在の状態と選択した登録日に該当する同社の登録済み発注だけを表示・印刷し、メーカー・商品名・入り数・数量を掲載。
- **変更ファイル**: InventManage.jsx, screens/OrderRequestScreen.jsx, tests/order-sheet-preview.html, tests/order-sheet-preview.jsx, AGENT_LOG.md。
- **検証結果**: ビルド、差分チェック、合成データによる登録日・状態・取引先の絞り込み、狭い画面の表示、印刷用iframeの内容を確認。
- **次の課題 / 残タスク**: 実機のA4印刷とFAX送信は未確認。送信前に宛先FAX番号と出力内容を確認する。

## 2026-10-04 20:43（自宅）Codex / GPT-6
- **作業内容**: 監査ログ記録用SQLと「データ管理 → 監査ログ」画面を追加。データ変更前後・操作アカウントをDBトリガーで保存し、期間・対象・操作・IDの絞り込みとページ表示に対応。
- **変更ファイル**: InventManage.jsx, screens/DataManagementScreen.jsx, screens/AuditLogPanel.jsx, screens/BackupScreen.jsx, lib/audit.js, utils/audit.js, outputs/supabase_migration/create_audit_logs.sql, AUDIT_LOG_SETUP.md, README.md, tests/audit*, HANDOFF.md, AGENT_LOG.md。
- **検証結果**: ビルド、表示処理7件とPGlite上のSQL/権限検証、テストデータによるブラウザでの一覧・展開・絞り込み・ページ切り替え・小さい画面の確認。
- **SQL適用確認**: ユーザーがSQL Editorで実行後、REST APIで `invent_audit_logs` を読み取り、HTTP 200・0件を確認。本番データを変更するテストは行っていない。
- **次の課題 / 残タスク**: 通常の保存後に監査ログの記録を確認する。2026-10-04にユーザーから監査ログ関連の変更のコミット・プッシュ指示を受領。

## 2026-10-01 08:44（職場） Claude Code / Sonnet 5
- **作業内容**: `git pull origin main` でリモートの最新状態を取得・確認（コード変更なし）。取得内容にCodex（自宅）による発注依頼メールの日時表示機能の追記が含まれていることをユーザーに報告
- **変更ファイル**: なし（本エントリのみ AGENT_LOG.md に追記）
- **次の課題 / 残タスク**: なし

## [2026-09-24] Codex
- **作業内容**: 発注依頼メールの商品一覧へ、発注依頼日時を日本時間で表示する処理を追加
- **変更ファイル**: supabase/functions/send-order-notification/index.ts, AGENT_LOG.md
- **次の課題 / 残タスク**: なし（Supabase Edge Function `send-order-notification` へデプロイ済み）

## [2026-09-11] Claude Code
- **作業内容**: このログファイル（AGENT_LOG.md）を新規作成
- **変更ファイル**: AGENT_LOG.md
- **次の課題 / 残タスク**: なし（今後、作業を終えるたびにここへ追記していく）
