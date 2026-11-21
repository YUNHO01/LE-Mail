'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  onClear?: () => void;
  disabled?: boolean;
}

/**
 * 전사 표준 검색창 컴포넌트 (ams / Cruip 표준 패턴)
 * Flex 컨테이너 기반으로 아이콘과 텍스트가 겹치지 않는 안전한 표준 레이아웃을 제공합니다.
 */
export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = '검색어를 입력하세요...',
  className = '',
  size = 'md',
  onClear,
  disabled = false,
}) => {
  const isSm = size === 'sm';

  const handleClear = () => {
    onChange('');
    if (onClear) onClear();
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-lg bg-white border border-slate-200 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 shadow-xs transition-colors ${
        isSm ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
      } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''} ${className}`}
    >
      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full text-xs bg-transparent border-0 p-0 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0 leading-normal"
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 p-0.5 text-slate-400 hover:text-slate-600 rounded-full transition"
          title="검색어 지우기"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

export default SearchInput;
