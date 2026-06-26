import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { isRomajiQuery, kanaSearchKey, romajiCanonical } from '../utils/romaji.js';

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[ぁ-ん]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase()
    .replace(/[\s\-ー・･/／,，.．()（）［\]\[\]【】「」『』]/g, '');
}

function assetMatches(asset, query, romajiSearch) {
  const fields = [
    asset.id,
    asset.name,
    asset.kanaName,
    asset.maker,
    asset.category,
    asset.parentCategory,
    asset.parentGenericName,
    asset.supplier,
  ];
  const normalizedFields = fields.map(normalizeSearchText);
  if (normalizedFields.some((field) => field.includes(query))) return true;
  if (!romajiSearch) return false;
  return kanaSearchKey(asset.kanaName || '').includes(romajiSearch)
    || kanaSearchKey(asset.parentGenericName || '').includes(romajiSearch);
}

export default function AssetSearchInput({
  assets,
  value,
  onChange,
  isIn,
  showListSignal,
  resetSignal = 0,
  inputRef = null,
  onSearchTermChange,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedAsset = assets.find((asset) => asset.id === value);
  const selectedLabel = selectedAsset ? `${selectedAsset.id} - ${selectedAsset.name}` : '';

  useEffect(() => {
    setSearchTerm(selectedLabel);
  }, [selectedLabel]);

  const candidates = useMemo(() => {
    if (!isOpen || searchTerm === selectedLabel) return [];

    const normalizedSearch = normalizeSearchText(searchTerm);
    const romajiSearch = isRomajiQuery(searchTerm) ? romajiCanonical(searchTerm.toLowerCase()) : '';

    return assets
      .filter((asset) => {
        if (!normalizedSearch) return true;
        return assetMatches(asset, normalizedSearch, romajiSearch);
      })
      .slice(0, 10);
  }, [assets, isOpen, searchTerm, selectedLabel]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showListSignal > 0) {
      setSearchTerm('');
      setIsOpen(true);
    }
  }, [showListSignal]);

  useEffect(() => {
    if (resetSignal > 0) {
      setSearchTerm('');
      setIsOpen(false);
    }
  }, [resetSignal]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          lang="ja"
          placeholder="品名・メーカーで検索..."
          className={`w-full p-2 pr-16 border rounded-md outline-none focus:ring-2 transition-all ${
            isIn ? 'focus:ring-emerald-500' : 'focus:ring-rose-500'
          }`}
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setIsOpen(true);
            onSearchTermChange?.(event.target.value);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <div className="absolute right-2 flex items-center gap-1">
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setIsOpen(false);
                onChange('');
                onSearchTermChange?.('');
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          )}
          <Search className="text-slate-400" size={16} />
        </div>
      </div>

      {isOpen && candidates.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl">
          {candidates.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="flex w-full flex-col border-b border-slate-100 p-3 text-left hover:bg-slate-50 last:border-none"
              onClick={() => {
                onChange(asset.id);
                setSearchTerm(`${asset.id} - ${asset.name}`);
                setIsOpen(false);
              }}
            >
              <span className="text-xs font-mono font-bold text-blue-600">{asset.id}</span>
              <span className="text-sm font-medium">{asset.name}</span>
              <span className="text-[10px] text-slate-400">{asset.maker}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
