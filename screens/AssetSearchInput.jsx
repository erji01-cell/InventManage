import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { isRomajiQuery, kanaSearchKey, romajiCanonical } from '../utils/romaji.js';

const RECENT_ASSET_KEY = 'invent_recent_asset_ids';

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[ぁ-ん]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase()
    .replace(/[\s\-ー・･/／,，.．()（）［\]\[\]【】「」『』]/g, '');
}

function readRecentAssetIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_ASSET_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveRecentAssetId(assetId) {
  if (!assetId) return;
  try {
    const current = readRecentAssetIds();
    const next = [String(assetId), ...current.filter((id) => id !== String(assetId))].slice(0, 8);
    localStorage.setItem(RECENT_ASSET_KEY, JSON.stringify(next));
  } catch {
    // localStorage が使えない場合は、保存だけ省略する。
  }
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
  recentAssets = [],
  showAdvancedSearch = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [recentIds, setRecentIds] = useState(() => readRecentAssetIds());
  const containerRef = useRef(null);

  const selectedAsset = assets.find((asset) => asset.id === value);
  const selectedLabel = selectedAsset ? `${selectedAsset.id} - ${selectedAsset.name}` : '';
  const isSelectedLabel = searchTerm === selectedLabel;
  const hasTypedSearch = searchTerm.trim() !== '' && !isSelectedLabel;

  useEffect(() => {
    setSearchTerm(selectedLabel);
  }, [selectedLabel]);

  const categoryOptions = useMemo(() => {
    const names = new Set();
    assets.forEach((asset) => {
      const category = asset.parentCategory || asset.category || '';
      if (category) names.add(category);
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'ja'));
  }, [assets]);

  const visibleRecentAssets = useMemo(() => {
    const movementBasedIds = recentAssets
      .map((item) => item?.asset?.id || item?.id || item)
      .filter(Boolean)
      .map(String);
    const ids = [...movementBasedIds, ...recentIds]
      .filter((id, index, array) => array.indexOf(id) === index);
    return ids
      .map((id) => assets.find((asset) => String(asset.id) === id))
      .filter(Boolean)
      .filter((asset) => !categoryFilter || (asset.parentCategory || asset.category || '') === categoryFilter)
      .slice(0, 8);
  }, [assets, categoryFilter, recentAssets, recentIds]);

  const candidates = useMemo(() => {
    if (!isOpen || isSelectedLabel) return [];

    const normalizedSearch = normalizeSearchText(searchTerm);
    const romajiSearch = isRomajiQuery(searchTerm) ? romajiCanonical(searchTerm.toLowerCase()) : '';

    return assets
      .filter((asset) => !categoryFilter || (asset.parentCategory || asset.category || '') === categoryFilter)
      .filter((asset) => {
        if (!normalizedSearch) return true;
        return assetMatches(asset, normalizedSearch, romajiSearch);
      })
      .slice(0, 20);
  }, [assets, categoryFilter, isOpen, isSelectedLabel, searchTerm]);

  const selectAsset = (asset) => {
    saveRecentAssetId(asset.id);
    setRecentIds(readRecentAssetIds());
    onChange(asset.id);
    setSearchTerm(`${asset.id} - ${asset.name}`);
    setIsOpen(false);
  };

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
      setRecentIds(readRecentAssetIds());
    }
  }, [showListSignal]);

  useEffect(() => {
    if (resetSignal > 0) {
      setSearchTerm('');
      setIsOpen(false);
      setCategoryFilter('');
    }
  }, [resetSignal]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          lang="ja"
          placeholder="品名・メーカー・分類で検索..."
          className={`w-full p-2 pr-16 border rounded-md outline-none focus:ring-2 transition-all ${
            isIn ? 'focus:ring-emerald-500' : 'focus:ring-rose-500'
          }`}
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setIsOpen(true);
            onSearchTermChange?.(event.target.value);
          }}
          onFocus={() => {
            setIsOpen(true);
            setRecentIds(readRecentAssetIds());
          }}
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

      {isOpen && showAdvancedSearch && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 bg-slate-50 p-2">
            <div className="flex items-center gap-2">
              <select
                className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(event.target.value);
                  setIsOpen(true);
                }}
              >
                <option value="">すべての分類</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              {categoryFilter && (
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs font-bold text-slate-500 hover:bg-white hover:text-slate-700"
                  onClick={() => setCategoryFilter('')}
                >
                  解除
                </button>
              )}
            </div>

            {!hasTypedSearch && visibleRecentAssets.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[11px] font-bold text-slate-400">最近使った資産</p>
                <div className="flex flex-wrap gap-1.5">
                  {visibleRecentAssets.map((asset) => (
                    <button
                      key={`recent-${asset.id}`}
                      type="button"
                      className={`max-w-[180px] truncate rounded border px-2 py-1 text-xs font-bold transition-colors ${
                        isIn
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                      title={`${asset.id} ${asset.name}${asset.maker ? ' / ' + asset.maker : ''}`}
                      onClick={() => selectAsset(asset)}
                    >
                      {asset.id} {asset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {candidates.length > 0 ? candidates.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="flex w-full flex-col border-b border-slate-100 p-3 text-left hover:bg-slate-50 last:border-none"
                onClick={() => selectAsset(asset)}
              >
                <span className="text-xs font-mono font-bold text-blue-600">{asset.id}</span>
                <span className="text-sm font-medium">{asset.name}</span>
                <span className="text-[10px] text-slate-400">
                  {[asset.parentCategory || asset.category, asset.maker].filter(Boolean).join(' / ')}
                </span>
              </button>
            )) : (
              <div className="p-3 text-sm font-medium text-slate-400">候補がありません</div>
            )}
          </div>
        </div>
      )}

      {isOpen && !showAdvancedSearch && candidates.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl">
          {candidates.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="flex w-full flex-col border-b border-slate-100 p-3 text-left hover:bg-slate-50 last:border-none"
              onClick={() => selectAsset(asset)}
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
