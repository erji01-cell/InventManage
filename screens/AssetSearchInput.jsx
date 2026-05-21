import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export default function AssetSearchInput({ assets, value, onChange, isIn, showListSignal, inputRef = null }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedAsset = assets.find(a => a.id === value);
  
  useEffect(() => {
    if (selectedAsset) {
      setSearchTerm(`${selectedAsset.id} - ${selectedAsset.name}`);
    } else {
      setSearchTerm('');
    }
  }, [selectedAsset]);

  const candidates = useMemo(() => {
    if (!isOpen || searchTerm === (selectedAsset ? `${selectedAsset.id} - ${selectedAsset.name}` : '')) {
      return [];
    }
    const lowerSearch = searchTerm.toLowerCase();
    return assets.filter(a => 
      a.id.toLowerCase().includes(lowerSearch) || 
      a.name.toLowerCase().includes(lowerSearch) ||
      a.kanaName.toLowerCase().includes(lowerSearch)
    ).slice(0, 10);
  }, [searchTerm, assets, isOpen, selectedAsset]);

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

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          placeholder="資産コードまたは品名で検索..."
          className={`w-full p-2 pr-16 border rounded-md outline-none focus:ring-2 transition-all ${
            isIn ? 'focus:ring-emerald-500' : 'focus:ring-rose-500'
          }`}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
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
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-60 overflow-y-auto">
          {candidates.map(asset => (
            <button
              key={asset.id}
              type="button"
              className="w-full text-left p-3 hover:bg-slate-50 flex flex-col border-b border-slate-100 last:border-none"
              onClick={() => {
                onChange(asset.id);
                setSearchTerm(`${asset.id} - ${asset.name}`);
                setIsOpen(false);
              }}
            >
              <span className="text-xs font-mono text-blue-600 font-bold">{asset.id}</span>
              <span className="text-sm font-medium">{asset.name}</span>
              <span className="text-[10px] text-slate-400">{asset.maker}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
