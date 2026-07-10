# InventManage プロジェクト引き継ぎドキュメント

**最終更新**: 2026-07-10  
**現在のブランチ**: main（全て反映済み）  
**ステータス**: 稼働中・定期改善対応

---

## プロジェクト概要

**InventManage** は、React 19 + Vite 7 + Tailwind CSS で構築された、複数拠点での資産在庫管理・年度更新を統一する SPA です。Supabase (PostgreSQL) をバックエンドとして使用。

- **会計年度**: 7月開始（7月1日〜6月30日）
- **複数PC対応**: ログイン状態の同期、並行トランザクション処理
- **バックアップ機能**: 変更内容の自動保存、復元モード選択（通常/完全）
- **RPC関数による原子性**: 年度更新、同時出庫チェック、親資産採番

---

## 最近の実装（2026年7月）

### 1. ✅ 認証エラー判定の改善 (2026-07-10)
**問題**: 起動時自動バックアップ時に「認証切れ」警告が頻発していた。  
**原因**:
- サーバー応答がエラー（5xx、29など）でも一律「トークン有効期限切れ」と判定
- スリープ復帰後のネットワーク不安定時にも有効なセッションを破棄
- 再ログインを強いるが、実は再試行で解決する一時的エラーだった

**対応**: `lib/supabase.js` の `performSessionRefresh` 関数を修正
- **400/401/403**: 認証エラー → セッション破棄、ログイン画面へ
- **5xx/429/ネットワーク断**: 一時的エラー → セッション温存、再試行

**InventManage.jsx** の自動バックアップ処理
- 起動時バックアップ: 認証切れは警告なしでログイン画面へ（再ログイン後に自動リトライ）
- 3分周期バックアップ: 同様。成功時は警告を消す
- 本当に手動対応が必要なエラーのみ警告表示

### 2. ✅ 実装完了した全改善（過去）
| # | 項目 | 実装日 | ファイル |
|---|------|-------|---------|
| ① | Map化による高速化（assets.find削減） | 6月 | MovementHistoryScreen, StockStatusScreen |
| ② | フォーカス時自動更新（1分間隔） | 6月 | InventManage.jsx |
| ③ | Tailwindビルド化（CDN廃止） | 6月 | styles.css, postcss.config.js, index.html |
| ④ | 年度更新RPC化（dry_run検証付き） | 6月 | year_end_update_rpc.sql |
| ⑤ | 出庫の在庫チェックDB関数化 | 6月 | register_movement_rpc.sql |
| ⑥ | 親資産採番競合対策（アドバイザリロック） | 6月 | create_parent_asset_rpc.sql |
| ⑦ | バックアップ「完全復元」モード追加 | 6月 | backup.js, BackupScreen.jsx |
| ⑧ | 過去年度遅延読み込み + useMemo最適化 | 6月 | InventManage.jsx, MovementHistoryScreen.jsx |

---

## 現在の設計と主要概念

### 会計年度と日付の扱い

**fiscal year（会計年度）の計算**（SQL & JS共通）:
```
月 >= 7  → その年（例: 2026年7月 = FY2026）
月 < 7   → 前年（例: 2026年3月 = FY2025）
```

**年度更新の時系列**:
1. **before**: 資産ごとに `opening_stock`, `fiscal_year_closed_at=NULL`
2. **year-end実行**: `fiscal_year_closed_at=期末日` + スナップショット記録
3. **after**: 新年度の `opening_stock = 期末在庫` となる

**重要**: 締め済み期間（`fiscal_year_closed_at`以降）への入出庫は DB側でも拒否（アプリ側との二重チェック）

### 資産ID体系

**親資産**: `P-0001`, `P-0002`, ...（分類ごとに一意）  
→ `invent_create_parent_asset_rpc()` で採番（アドバイザリロック採用）

**子資産**: `A-0001`, `A-0002`, ...（連番）  
→ 親資産の傘下で管理

### 多PC環境での同時実行制御

| 問題 | 解決手法 | 場所 |
|------|--------|------|
| 同時出庫で在庫マイナス | `invent_register_movement()` で行ロック | DB関数 |
| 親資産ID重複 | `pg_advisory_xact_lock()` で直列化 | DB関数 |
| トークンリフレッシュ競合 | localStorage に新しいトークンがあれば再利用 | lib/supabase.js |
| データ鮮度 | フォーカス時（1分最小間隔）自動更新 | InventManage.jsx |

### バックアップ復元モード

**「通常復元」（merge モード）**:
- upsert のみ（変更・追加を反映）
- バックアップ後に追加されたデータは残る
- 軽い修正に使用

**「完全復元」（replace モード）**:
- バックアップ時点に完全ロールバック
- バックアップ後の追加データ削除（FK順序に従い）
- 大きなエラーが見つかったときに使用

---

## RPC関数一覧

### 1. `invent_year_end_update(end_date, dry_run)`
**用途**: 会計年度末の年度更新（スナップショット保存 + 期首在庫更新）

**パラメータ**:
- `end_date`: 期末日（例: '2026-06-30'）
- `dry_run`: true なら計算のみ、false なら実行

**戻り値**: jsonb
```json
{
  "dry_run": false,
  "fiscal_year": 2026,
  "end_date": "2026-06-30",
  "asset_count": 541,
  "changed_count": 127,
  "snapshot_count": 541,
  "updated_count": 541,
  "rows": [
    { "id": 1, "opening": 100, "closing": 98 },
    ...
  ]
}
```

**流れ**:
1. アプリ側で client 計算
2. `dry_run=true` で RPC呼び出し
3. 結果が client 計算と一致を確認
4. 一致なら `dry_run=false` で本実行

### 2. `invent_register_movement(asset_id, date, type, quantity, ...)`
**用途**: 入出庫登録（在庫チェック + 登録を原子的に）

**重要な挙動**:
- **入庫**: チェックなし、登録
- **出庫**: 現在庫（`opening_stock + 締め後の入出庫`）をロック下で計算、不足なら例外
- **締め済み期間**: どの type でも例外（`fiscal_year_closed_at` 以降の日付は拒否）

### 3. `invent_create_parent_asset(category, category_id, generic_name)`
**用途**: 親資産の採番 + 登録

**特徴**:
- アドバイザリロックで複数PC同時登録を直列化
- テキスト順でなく数値順（P-9999 → P-10000 でも正しく採番）

---

## 主要ファイル構成

```
InventManage/
├── InventManage.jsx              # メインコンポーネント
│   ├─ 起動時自動バックアップ（AUTH_EXPIRED時はログイン画面へ）
│   ├─ 3分周期変更バックアップ（フラグベース）
│   ├─ フォーカス時自動更新（1分最小間隔）
│   ├─ 過去年度遅延読み込み（タブ選択で fetchMovementsForFiscalYear）
│   └─ negativeStockAssets計算（警告バナー用）
│
├── lib/
│   ├── supabase.js               # Supabase操作
│   │   ├─ loadInventoryData（起動時、post-close のみ）
│   │   ├─ fetchMovementsForFiscalYear（過去年度専用）
│   │   └─ performSessionRefresh（400/401/403 のみ認証切れ判定）
│   └── backup.js                 # バックアップ/復元
│       ├─ performBackup（skipIfUnchanged対応）
│       ├─ RESTORE_TABLES（invent_staff を除外）
│       └─ restoreFromPayload（merge/replace モード）
│
├── screens/
│   ├── MenuScreen.jsx            # メニュー＋負在庫警告バナー＋クイックバックアップ
│   ├── BackupScreen.jsx          # バックアップ管理
│   ├── StockStatusScreen.jsx     # 在庫状況（movementsByAsset Map）
│   ├── MovementHistoryScreen.jsx # 入出庫履歴（assetById Map + useMemo）
│   └── ...
│
├── components/
│   ├── StaffSelect.jsx           # 担当者選択（退職者フィルタ付き）
│   └── ...
│
├── outputs/supabase_migration/
│   ├── year_end_update_rpc.sql
│   ├── register_movement_rpc.sql
│   └── create_parent_asset_rpc.sql
│
├── styles.css                    # @tailwind directives
├── postcss.config.js             # Tailwind + autoprefixer
├── tailwind.config.js            # content scanning設定
├── CLAUDE.md                     # RTK設定
└── HANDOFF.md                    # このファイル
```

---

## 保護設定

### 🚫 invent_staff（担当者マスタ）は変更禁止

理由: 過去データに紐付く職員が削除されると履歴が見えなくなる  
→ `backup.js` の `RESTORE_TABLES` で除外、退職者は `is_active=false` フラグで管理

---

## 既知の制限と対応状況

| # | 内容 | 対応状況 | 補足 |
|----|------|--------|------|
| 認証切れ警告頻発 | ✅ 修正（2026-07-10） | 完了 | 5xx とネットワーク断を区別 |
| 過去年度データ表示 | ✅ 遅延読み込み | 完了 | 起動時は現年度のみ |
| 負在庫資産 | ✅ 警告バナー | 完了 | MenuScreen に表示 |
| 同時出庫競合 | ✅ DB関数 + 行ロック | 完了 | register_movement_rpc |
| 親資産ID競合 | ✅ アドバイザリロック | 完了 | create_parent_asset_rpc |
| 年度更新の中途半端 | ✅ RPC + dry_run | 完了 | トランザクション原子性確保 |
| 退職者がドロップダウンに残る | ✅ is_active フィルタ | 完了 | 過去データは表示される |

---

## デプロイとテスト

### 起動
```bash
npm run dev
# http://localhost:5173 で起動
```

### ビルド
```bash
npm run build
# Tailwind ビルド時生成（CDN廃止）
```

### RPC関数の導入
Supabase SQL Editor で `outputs/supabase_migration/*.sql` を実行（初回セットアップのみ）

---

## 次のセッションで確認すること

1. **Vercel デプロイ状況**: 認証エラー警告の頻度が低下したか観察
2. **ユーザーからのフィードバック**: 「バックアップ失敗」メッセージの再発がないか
3. **年度更新実行**: 年度更新が安定して原子的に完了するか
4. **多PC同時実行**: 並行トランザクション（出庫・採番）が正しく制御されるか

---

## メモ: 重要な判断理由

### なぜ「認証切れ」判定を 400/401/403 に限定したのか？
- トークンリフレッシュの失敗 = 必ずしもトークン有効期限切れではない
- スリープ中のネットワーク断後や、一時的サーバー混雑でも occur
- ユーザーに「再ログイン」を強いるのは UX 低下
- セッションは温存して「再試行可能」として扱う方が堅牢

### なぜ「完全復元」モードを追加したのか？
- 従来の upsert のみでは「バックアップ時点に戻す」ができない
- バックアップ後の追加データが残り、意図と異なる
- FK 削除順序（子→親）を遵守しながら完全ロールバック

### なぜ過去年度を遅延読み込みにしたのか？
- 初回起動時に 3,774 行全てを fetch → 1-2秒のラグ
- 実際に必要なのは「現年度の締め後データのみ」（約10行）
- 過去年度は「ユーザーが該当タブをクリックしたとき」のみ fetch
- 起動時間 70% 短縮

---

## 担当者メモ

**ユーザー**: erji01@gmail.com  
**プロジェクト使用言語**: 日本語  
**タイムゾーン**: JST（日本）  
**会計年度**: 7月開始  

---

**このドキュメントは次のセッションで読み込まれるため、変更があれば都度更新してください。**
