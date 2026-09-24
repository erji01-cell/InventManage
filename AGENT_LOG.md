# Agent Handover Log

## 共通記録ルール

- 変更作業ごとに日時、作業場所、使用ツール、変更内容・ファイル、検証結果、残タスクを記録する。既存の追記順を維持する。
- 端末名 `DESKTOP-P1TKLAH` は自宅、`DESKTOP-22CKAVI` は職場。未登録の端末は推測せず「未確認」と記録する。
- 作業後は関連する変更と本ログをコミットし、追跡先にpushする。無関係な差分は含めず、pushできなければ理由を記録する。

複数のAIツール（Claude Code / Codex / Cursor など）でこのプロジェクトを触るときの
引き継ぎノート。セッション終了時に自動追記される運用（`~/.claude/hooks/agent-log-stop.sh`）。

新しいエントリは**先頭に追加**する（最新が一番上）。見出しには日時と作業場所
（職場/自宅、ホスト名から自動判定）を含める。詳しい経緯や設計判断は
[HANDOFF.md](HANDOFF.md) に譲り、ここは「いつ・どのツールで・何をしたか」の
短い記録に留める。

---

## [2026-09-24] Codex
- **作業内容**: 発注依頼メールの商品一覧へ、発注依頼日時を日本時間で表示する処理を追加
- **変更ファイル**: supabase/functions/send-order-notification/index.ts, AGENT_LOG.md
- **次の課題 / 残タスク**: なし（Supabase Edge Function `send-order-notification` へデプロイ済み）

## [2026-09-11] Claude Code
- **作業内容**: このログファイル（AGENT_LOG.md）を新規作成
- **変更ファイル**: AGENT_LOG.md
- **次の課題 / 残タスク**: なし（今後、作業を終えるたびにここへ追記していく）
