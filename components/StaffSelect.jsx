import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

// ネイティブ<select>はドロップダウンを開くと、番号タイプ時にブラウザ/OS側の
// type-ahead（先頭文字一致で巡回）が働き、id 1,10,11,12… が全て"1"始まりのため
// 「11」を打っても10や12に飛んでしまう。これは onKeyDown の preventDefault でも
// 抑止できないため、自前ドロップダウンに置き換える。番号タイプは id 完全一致で選ぶ。
//
// value/onChange のインターフェースは <select> と揃えてあり、各画面はタグを
// 差し替えるだけで使える。onChange には選択した id（文字列）を渡す。
const StaffSelect = forwardRef(function StaffSelect(
  {
    staff = [],
    value,
    onChange,
    className = '',
    placeholder = '担当者を選んでください',
    emptyLabel = null, // 指定すると「未選択に戻す」行を先頭に出す
    onEnter = null,    // 閉じている状態で Enter を押したときの追加動作（次フィールドへ等）
    disabled = false,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const bufferRef = useRef('');
  const timerRef = useRef(null);

  // EntryScreen 等が staffSelectRef.current?.focus() で自動フォーカスできるように
  useImperativeHandle(ref, () => ({ focus: () => buttonRef.current?.focus() }), []);

  const selected = staff.find((s) => String(s.id) === String(value)) || null;

  // 退職者（isActive === false）は選択肢から隠す。ただし、既に選択されている
  // 担当者が退職済みの場合は、過去データの名前が消えないよう末尾に残して表示する。
  const activeStaff = staff.filter((s) => s.isActive !== false);
  const visibleStaff = selected && selected.isActive === false
    ? [...activeStaff, selected]
    : activeStaff;

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  // 開いたら現在値の位置をハイライト
  useEffect(() => {
    if (!open) return;
    setHighlight(visibleStaff.findIndex((s) => String(s.id) === String(value)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ハイライト行を可視領域へスクロール
  useEffect(() => {
    if (open && highlight >= 0 && listRef.current) {
      listRef.current.querySelector(`[data-idx="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, highlight]);

  const commit = (id) => {
    onChange(id);
    setOpen(false);
    bufferRef.current = '';
    buttonRef.current?.focus();
  };

  const handleNumber = (key) => {
    bufferRef.current += key;
    const idx = visibleStaff.findIndex((s) => String(s.id) === bufferRef.current);
    if (idx >= 0) {
      onChange(String(visibleStaff[idx].id)); // id 完全一致のみ選択（巡回しない）
      setHighlight(idx);
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { bufferRef.current = ''; }, 1200);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    const { key } = event;

    if (key >= '0' && key <= '9') {
      event.preventDefault();
      if (!open) setOpen(true);
      handleNumber(key);
      return;
    }
    if (key === 'ArrowDown') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((h) => Math.min(visibleStaff.length - 1, h + 1));
      return;
    }
    if (key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((h) => Math.max(0, h - 1));
      return;
    }
    if (key === 'Enter') {
      if (open) {
        event.preventDefault();
        if (highlight >= 0 && visibleStaff[highlight]) commit(String(visibleStaff[highlight].id));
        else setOpen(false);
        return;
      }
      if (onEnter) { onEnter(event); return; } // 閉じている: 次フィールドへ
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (key === 'Escape') {
      if (open) { event.preventDefault(); setOpen(false); }
      return;
    }
    bufferRef.current = ''; // 他キーはバッファをリセット
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        ref={buttonRef}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className={`${className} bg-white text-left flex items-center justify-between gap-2`}
      >
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>
          {selected ? `${selected.id} ${selected.name}` : placeholder}
        </span>
        <span className="shrink-0 text-slate-400">▾</span>
      </button>

      {open && (
        <ul
          ref={listRef}
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {emptyLabel != null && (
            <li
              onMouseDown={(e) => { e.preventDefault(); commit(''); }}
              className="cursor-pointer px-3 py-2 text-slate-400 hover:bg-slate-50"
            >
              {emptyLabel}
            </li>
          )}
          {visibleStaff.map((s, idx) => {
            const isSelected = String(s.id) === String(value);
            const isHighlighted = idx === highlight;
            const isRetired = s.isActive === false;
            return (
              <li
                key={s.id}
                data-idx={idx}
                onMouseDown={(e) => { e.preventDefault(); commit(String(s.id)); }}
                onMouseEnter={() => setHighlight(idx)}
                className={`cursor-pointer px-3 py-2 ${isHighlighted ? 'bg-purple-100' : ''} ${isSelected ? 'font-bold text-purple-700' : 'text-slate-700'}`}
              >
                {s.id} {s.name}{isRetired && <span className="ml-1 text-xs text-slate-400">（退職）</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default StaffSelect;
