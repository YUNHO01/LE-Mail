'use client';

import React, { useState, useEffect, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { X, AlertCircle, User, Building2, Star } from 'lucide-react';
import { contactsApi } from '@/lib/api';
import { ContactSearchResultDto } from '@lemail/shared-types';

export type RecipientFieldType = 'to' | 'cc' | 'bcc';

interface RecipientInputProps {
  label: string;
  recipients: string[];
  onChange: (recipients: string[]) => void;
  placeholder?: string;
  rightAction?: React.ReactNode;
  fieldType?: RecipientFieldType;
  isDropTargetActive?: boolean;
  onDragHoverFieldChange?: (field: RecipientFieldType | null) => void;
  onRequestExpandFields?: () => void;
  onDropRecipient?: (
    sourceField: RecipientFieldType,
    sourceIndex: number,
    targetField: RecipientFieldType,
    targetIndex?: number,
  ) => void;
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
  fieldType,
  isDropTargetActive = false,
  onDragHoverFieldChange,
  onRequestExpandFields,
  onDropRecipient,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 인라인 칩 수정 상태
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Pointer Events 기반 모바일/데스크톱 겸용 드래그 상태
  const [pointerDrag, setPointerDrag] = useState<{
    index: number;
    entry: string;
    x: number;
    y: number;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragOriginRef = useRef<{
    index: number;
    entry: string;
    startX: number;
    startY: number;
    pointerType: string;
    active: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);

  // 자동완성 상태
  const [suggestions, setSuggestions] = useState<ContactSearchResultDto[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searching, setSearching] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIndex !== null) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingIndex]);

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
    if (editingIndex === indexToRemove) {
      setEditingIndex(null);
      setEditingValue('');
    }
  };

  const startEditing = (idx: number, currentEntry: string) => {
    setEditingIndex(idx);
    setEditingValue(currentEntry);
    setError(null);
    setShowSuggestions(false);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingValue('');
    setError(null);
  };

  const commitEdit = (idx: number) => {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      removeRecipient(idx);
      setEditingIndex(null);
      setEditingValue('');
      setError(null);
      return;
    }

    const pure = extractPureEmail(trimmed);
    if (!EMAIL_REGEX.test(pure)) {
      setError(`유효하지 않은 이메일 형식: ${trimmed}`);
      return;
    }

    const otherPureEmails = recipients
      .filter((_, i) => i !== idx)
      .map((item) => extractPureEmail(item).toLowerCase());

    if (otherPureEmails.includes(pure.toLowerCase())) {
      setError(`이미 등록된 수신자입니다: ${pure}`);
      return;
    }

    const next = [...recipients];
    next[idx] = trimmed;
    onChange(next);
    setEditingIndex(null);
    setEditingValue('');
    setError(null);
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      e.preventDefault();
      commitEdit(idx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    const findTargetAtPoint = (clientX: number, clientY: number) => {
      const elements = document.elementsFromPoint(clientX, clientY);
      let targetField: RecipientFieldType | null = null;
      let targetChipIndex: number | undefined;
      let hitExpand = false;

      for (const el of elements) {
        if (!hitExpand && el.getAttribute('data-recipient-expand') === 'true') {
          hitExpand = true;
        }
        const chipIdxAttr = el.getAttribute('data-recipient-chip-index');
        if (targetChipIndex === undefined && chipIdxAttr !== null) {
          const parsed = Number(chipIdxAttr);
          if (!Number.isNaN(parsed)) targetChipIndex = parsed;
        }
        const fieldAttr = el.getAttribute('data-recipient-field') as RecipientFieldType | null;
        if (!targetField && fieldAttr) {
          targetField = fieldAttr;
        }
      }

      return { targetField, targetChipIndex, hitExpand };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;

      const dx = e.clientX - origin.startX;
      const dy = e.clientY - origin.startY;
      const dist = Math.hypot(dx, dy);

      if (!origin.active) {
        if (origin.pointerType === 'mouse' && dist > 5) {
          origin.active = true;
          suppressNextClickRef.current = true;
          setPointerDrag({
            index: origin.index,
            entry: origin.entry,
            x: e.clientX,
            y: e.clientY,
          });
        } else if (dist > 8) {
          // 터치 스크롤 의도로 간주하여 롱프레스 취소
          clearLongPressTimer();
          dragOriginRef.current = null;
          return;
        } else {
          return;
        }
      }

      setPointerDrag({
        index: origin.index,
        entry: origin.entry,
        x: e.clientX,
        y: e.clientY,
      });

      const { targetField, hitExpand } = findTargetAtPoint(e.clientX, e.clientY);
      if (hitExpand) {
        onRequestExpandFields?.();
      }
      onDragHoverFieldChange?.(targetField);
    };

    const handlePointerEnd = (e: PointerEvent) => {
      clearLongPressTimer();
      const origin = dragOriginRef.current;
      dragOriginRef.current = null;

      if (!origin || !origin.active) {
        return;
      }

      const { targetField, targetChipIndex } = findTargetAtPoint(e.clientX, e.clientY);
      if (fieldType && targetField && onDropRecipient) {
        onDropRecipient(
          fieldType,
          origin.index,
          targetField,
          targetField === fieldType ? targetChipIndex : undefined,
        );
      }

      setPointerDrag(null);
      onDragHoverFieldChange?.(null);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (dragOriginRef.current?.active) {
        e.preventDefault();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      clearLongPressTimer();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [fieldType, onDropRecipient, onDragHoverFieldChange, onRequestExpandFields]);

  const handleChipPointerDown = (
    e: React.PointerEvent<HTMLSpanElement>,
    idx: number,
    entry: string,
  ) => {
    if (!fieldType || !onDropRecipient || editingIndex === idx) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    dragOriginRef.current = {
      index: idx,
      entry,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
      active: false,
    };

    if (e.pointerType !== 'mouse') {
      clearLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        const origin = dragOriginRef.current;
        if (!origin) return;
        origin.active = true;
        suppressNextClickRef.current = true;
        setPointerDrag({
          index: origin.index,
          entry: origin.entry,
          x: origin.startX,
          y: origin.startY,
        });
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(20);
        }
      }, 200);
    }
  };

  return (
    <div
      className="flex flex-col gap-1 relative"
      ref={containerRef}
      data-recipient-field={fieldType}
    >
      <div
        className={`flex items-start gap-3 border-b py-2.5 px-3 transition-all ${
          isDropTargetActive
            ? 'border-sky-500 bg-sky-50/70 ring-1 ring-inset ring-sky-400/60 rounded-lg'
            : 'border-slate-200 focus-within:border-sky-500 focus-within:bg-sky-50/20'
        }`}
      >
        <label className="w-20 text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0 pt-1.5">
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-h-[32px] relative">
          {recipients.map((entry, idx) => {
            const isEditing = editingIndex === idx;
            const isDragging = pointerDrag?.index === idx;

            if (isEditing) {
              return (
                <span
                  key={`edit-${idx}`}
                  className="inline-flex items-center rounded-full bg-white border-2 border-sky-500 py-0.5 px-2.5 text-xs shadow-sm max-w-full"
                >
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingValue}
                    onChange={(e) => {
                      setEditingValue(e.target.value);
                      if (error) setError(null);
                    }}
                    onKeyDown={(e) => handleEditKeyDown(e, idx)}
                    onBlur={() => commitEdit(idx)}
                    size={Math.max(editingValue.length + 2, 14)}
                    className="bg-transparent text-xs font-medium text-slate-900 focus:outline-none min-w-[100px] max-w-full"
                    aria-label="수신자 이메일 수정"
                  />
                </span>
              );
            }

            return (
              <span
                key={`${entry}-${idx}`}
                data-recipient-chip-index={idx}
                onPointerDown={(e) => handleChipPointerDown(e, idx, entry)}
                className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-2 text-xs font-medium transition select-none ${
                  isDragging
                    ? 'opacity-40 bg-slate-200 border-slate-300 text-slate-500'
                    : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200'
                }`}
              >
                <span
                  onClick={() => {
                    if (suppressNextClickRef.current) {
                      suppressNextClickRef.current = false;
                      return;
                    }
                    startEditing(idx, entry);
                  }}
                  className="cursor-text max-w-[210px] truncate"
                >
                  {entry}
                </span>
                <button
                  type="button"
                  onClick={() => removeRecipient(idx)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-300 hover:text-slate-700"
                  aria-label="수신자 삭제"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}

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

      {pointerDrag && (
        <div
          style={{
            left: pointerDrag.x,
            top: pointerDrag.y,
          }}
          className="fixed z-[120] -translate-x-1/2 -translate-y-1/2 pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-sky-600 text-white px-3 py-1.5 text-xs font-semibold shadow-xl ring-2 ring-white/80 max-w-[240px] truncate"
        >
          <span className="truncate">{pointerDrag.entry}</span>
        </div>
      )}
    </div>
  );
};
