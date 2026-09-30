-- 担当者マスタ（invent_staff）に「15: 杉原一明」を追加する。
-- invent_staff は一括操作（削除・置換・再投入）の対象外とする方針のため、
-- 1件だけのピンポイントな INSERT として実行する。
--
-- 実行手順:
--   1. まず下の SELECT だけを実行し、id=15 が未使用であることを確認する
--      （既に使われていた場合はここで中止し、空いている番号を確認してから
--       このファイルの 15 を書き換えて再実行する）
--   2. 空いていることを確認したら INSERT を実行する
--   3. 最後の SELECT で登録結果を確認する

-- 1. 事前確認（0件であることを確認してから次へ進む）
SELECT * FROM invent_staff WHERE id = 15;

-- 2. 追加
INSERT INTO invent_staff (id, name, is_active)
VALUES (15, '杉原一明', true);

-- id 列に identity/シーケンスが設定されている場合、明示的に id を指定して
-- INSERT すると次回の自動採番と衝突する可能性があるため、念のため合わせておく。
-- シーケンスが存在しない場合（invent_child_assets と同様に未設定の場合）は
-- 何も起きず安全にスキップされる。
DO $$
DECLARE
  seq_name text := pg_get_serial_sequence('invent_staff', 'id');
BEGIN
  IF seq_name IS NOT NULL THEN
    PERFORM setval(seq_name, (SELECT COALESCE(MAX(id), 1) FROM invent_staff));
  END IF;
END $$;

-- 3. 登録結果の確認
SELECT * FROM invent_staff WHERE id = 15;
