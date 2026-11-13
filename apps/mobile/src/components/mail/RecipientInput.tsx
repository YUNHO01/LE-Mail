'use client';

import React, { useState, useEffect, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { X, AlertCircle, User, Building2, Star } from 'lucide-react';
import { contactsApi } from '@/lib/api';
import { ContactSearchResultDto } from '@lemail/shared-types';

interface RecipientInputProps {
  label: string;
  recipients: string[];
  onChange: (recipients: string[]) => void;
  placeholder?: string;
  rightAction?: React.ReactNode;
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

/**
 * "홍길동 <hong@example.com>" 또는 "hong@example.com" 에서 실제 이메일 주소만 추출
 */
export const extractPureEmail = (raw: string): string => {
  const match = raw.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return raw.trim();
};

export const RecipientInput: React.FC<RecipientInputProps> = ({
  label,
  recipients,
  onChange,
  placeholder = '이메일 주소 입력 후 Enter',
  rightAction,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 자동완성 상태
  const [suggestions, setSuggestions] = useState<ContactSearchResultDto[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searching, setSearching] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 외부 클릭 시 추천 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 검색어 입력 시 Debounce 자동완성 API 호출
  useEffect(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || trimmed.includes(',')) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const results = await contactsApi.search(trimmed);
        // 이미 추가된 이메일은 제안 목록에서 제외
        const pureCurrentEmails = recipients.map(extractPureEmail).map((e) => e.toLowerCase());
        const filtered = results.filter(
          (item) => !pureCurrentEmails.includes(item.email.toLowerCase()),
        );

        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setSelectedIndex(filtered.length > 0 ? 0 : -1);
      } catch (err) {
        // ignore search failure
      } finally {
        setSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [inputValue, recipients]);

  const addEmails = (rawText: string) => {
    // 쉼표, 세미콜론, 줄바꿈 등으로 분리
    const splitTokens = rawText
      .split(/[,;\n\r]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    const validNewEmails: string[] = [];
    const invalidEmails: string[] = [];

    const existingPureEmails = recipients.map(extractPureEmail).map((e) => e.toLowerCase());

    for (const token of splitTokens) {
      const pure = extractPureEmail(token);
      if (EMAIL_REGEX.test(pure)) {
        if (!existingPureEmails.includes(pure.toLowerCase())) {
          validNewEmails.push(token);
          existingPureEmails.push(pure.toLowerCase());
        }
      } else {
        invalidEmails.push(token);
      }
    }

    if (invalidEmails.length > 0) {
      setError(`유효하지 않은 이메일 형식: ${invalidEmails.join(', ')}`);
    } else {
      setError(null);
    }

    if (validNewEmails.length > 0) {
      onChange([...recipients, ...validNewEmails]);
    }
  };

  const handleSelectSuggestion = (item: ContactSearchResultDto) => {
    const formatted = item.name ? `${item.name} <${item.email}>` : item.email;
    addEmails(formatted);
    setInputValue('');
    setShowSuggestions(false);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[selectedIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (inputValue.trim()) {
        e.preventDefault();
        addEmails(inputValue);
        setInputValue('');
        setShowSuggestions(false);
      }
    } else if (e.key === 'Backspace' && !inputValue && recipients.length > 0) {
      removeRecipient(recipients.length - 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    if (pastedText) {
      addEmails(pastedText);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const handleBlur = () => {
    // 마우스 클릭 이벤트가 먼저 일어날 수 있도록 지연 처리
    setTimeout(() => {
      if (inputValue.trim() && !showSuggestions) {
        addEmails(inputValue);
        setInputValue('');
      }
    }, 200);
  };

  const removeRecipient = (indexToRemove: number) => {
    onChange(recipients.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="flex flex-col gap-1 relative" ref={containerRef}>
      <div className="flex items-start gap-3 border-b border-slate-200 py-2.5 px-3 focus-within:border-sky-500 focus-within:bg-sky-50/20 transition-all">
        <label className="w-20 text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0 pt-1.5">
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-h-[32px] relative">
          {recipients.map((entry, idx) => (
            <span
              key={`${entry}-${idx}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 py-1 pl-3 pr-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
            >
              <span>{entry}</span>
              <button
                type="button"
                onClick={() => removeRecipient(idx)}
                className="rounded-full p-0.5 text-slate-400 hover:bg-slate-300 hover:text-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleBlur}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder={recipients.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[200px] border-none bg-transparent py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        {rightAction && (
          <div className="shrink-0 flex items-center gap-2 pt-1 text-xs">
            {rightAction}
          </div>
        )}
      </div>

      {/* 자동완성 제안 팝오버 드롭다운 */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-24 top-full mt-1 w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl py-1.5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3.5 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-100 flex items-center justify-between">
            <span>주소록 및 사내 사용자 추천</span>
            <span className="text-[10px] text-slate-400 font-normal">
              ↑↓ 키로 이동, Enter/Tab 선택
            </span>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
            {suggestions.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const isSystem = item.source === 'SYSTEM_USER';
              return (
                <div
                  key={`${item.id}-${idx}`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // blur 방지
                    handleSelectSuggestion(item);
                  }}
                  className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer text-xs transition ${
                    isSelected ? 'bg-sky-50/80 text-sky-950' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSystem
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {item.name ? item.name.slice(0, 1) : <User className="h-3.5 w-3.5" />}
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                        <span>{item.name}</span>
                        <span className="font-mono text-[11px] font-normal text-slate-500">
                          &lt;{item.email}&gt;
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {item.company || ''}{' '}
                        {item.department ? `• ${item.department}` : ''}{' '}
                        {item.position ? `• ${item.position}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    {isSystem ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 border border-indigo-200">
                        <Building2 className="h-3 w-3" />
                        <span>사내</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-200">
                        <User className="h-3 w-3" />
                        <span>주소록</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-rose-600 bg-rose-50 rounded-lg">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
