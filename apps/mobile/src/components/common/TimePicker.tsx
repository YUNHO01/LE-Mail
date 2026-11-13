'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X } from 'lucide-react';

export interface TimePickerProps {
  value?: string;
  defaultValue?: string;
  onChange?: (timeStr: string) => void;
  placeholder?: string;
  minuteIncrement?: number;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  size?: 'xs' | 'sm' | 'md';
  allowClear?: boolean;
  id?: string;
  name?: string;
}

const POPOVER_WIDTH = 224;
const POPOVER_HEIGHT = 276;

function parseTime(timeStr?: string): { hour: string; minute: string } {
  if (!timeStr || typeof timeStr !== 'string') {
    return { hour: '09', minute: '00' };
  }
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hour: '09', minute: '00' };
  }
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return {
    hour: String(h).padStart(2, '0'),
    minute: String(m).padStart(2, '0'),
  };
}

export function TimePicker({
  value,
  defaultValue,
  onChange,
  placeholder = 'HH:MM',
  minuteIncrement = 5,
  disabled = false,
  required = false,
  className = '',
  inputClassName = '',
  size = 'sm',
  allowClear = false,
  id,
  name,
}: TimePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [internalValue, setInternalValue] = useState<string>(() => defaultValue || '');
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (value === undefined && defaultValue !== undefined) {
      setInternalValue(defaultValue);
    }
  }, [value, defaultValue]);

  const activeValue = value !== undefined ? value : internalValue;
  const { hour: selectedHour, minute: selectedMinute } = useMemo(
    () => parseTime(activeValue),
    [activeValue],
  );

  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
    [],
  );

  const minutes = useMemo(() => {
    const step = Math.max(1, Math.min(30, minuteIncrement));
    const list: string[] = [];
    for (let m = 0; m < 60; m += step) {
      list.push(String(m).padStart(2, '0'));
    }
    return list;
  }, [minuteIncrement]);

  const updatePosition = () => {
    if (!containerRef.current || typeof window === 'undefined') return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    // 우측 정렬 우선 + 뷰포트 경계 클램핑
    let left = rect.right - POPOVER_WIDTH;
    if (left + POPOVER_WIDTH > vw - margin) {
      left = vw - POPOVER_WIDTH - margin;
    }
    if (left < margin) {
      left = margin;
    }

    // 아래 공간 부족 시 위로 배치
    let top = rect.bottom + 6;
    if (top + POPOVER_HEIGHT > vh - margin) {
      const aboveTop = rect.top - POPOVER_HEIGHT - 6;
      top = aboveTop >= margin ? aboveTop : Math.max(margin, vh - POPOVER_HEIGHT - margin);
    }

    setCoords({ top, left });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    // 선택된 시간/분으로 스크롤 이동
    requestAnimationFrame(() => {
      const activeH = hourListRef.current?.querySelector('[data-active="true"]');
      const activeM = minuteListRef.current?.querySelector('[data-active="true"]');
      activeH?.scrollIntoView({ block: 'center' });
      activeM?.scrollIntoView({ block: 'center' });
    });

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const emitChange = (nextHour: string, nextMinute: string) => {
    const nextVal = `${nextHour}:${nextMinute}`;
    if (value === undefined) {
      setInternalValue(nextVal);
    }
    onChange?.(nextVal);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (value === undefined) {
      setInternalValue('');
    }
    onChange?.('');
    setIsOpen(false);
  };

  const sizeClasses = {
    xs: 'text-[11px] py-1 px-2.5 pr-7',
    sm: 'text-xs py-1.5 px-3 pr-8',
    md: 'text-sm py-2 px-3.5 pr-9',
  }[size];

  const hasWidthClass = /(^|\s)w-/.test(className);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center ${hasWidthClass ? '' : 'w-full'} ${className}`}
    >
      <input
        id={id}
        name={name}
        type="text"
        value={activeValue}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        readOnly
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`w-full rounded-lg border border-slate-200 bg-white text-slate-800 cursor-pointer focus:border-[#007AFF] focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${sizeClasses} ${inputClassName}`}
      />
      <div className="absolute right-2.5 flex items-center gap-1 pointer-events-none">
        {allowClear && activeValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="pointer-events-auto p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
            title="초기화"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <Clock className="w-3.5 h-3.5 text-slate-400" />
      </div>

      {isMounted &&
        isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
              zIndex: 9999,
            }}
            className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2">
              <span className="text-xs font-bold text-slate-700">
                {selectedHour} : {selectedMinute}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg bg-[#007AFF] px-2.5 py-1 text-[11px] font-semibold text-white active:scale-95 transition"
              >
                확인
              </button>
            </div>

            {/* Hour / Minute 2-Column Picker */}
            <div className="grid grid-cols-2 divide-x divide-slate-100 h-52">
              <div ref={hourListRef} className="overflow-y-auto p-1.5 space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 text-center">
                  시
                </div>
                {hours.map((h) => {
                  const isActive = h === selectedHour;
                  return (
                    <button
                      key={h}
                      type="button"
                      data-active={isActive}
                      onClick={() => emitChange(h, selectedMinute)}
                      className={`w-full rounded-lg py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'bg-[#007AFF] text-white'
                          : 'text-slate-700 hover:bg-slate-100 active:bg-slate-100'
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>

              <div ref={minuteListRef} className="overflow-y-auto p-1.5 space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 text-center">
                  분
                </div>
                {minutes.map((m) => {
                  const isActive = m === selectedMinute;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-active={isActive}
                      onClick={() => emitChange(selectedHour, m)}
                      className={`w-full rounded-lg py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'bg-[#007AFF] text-white'
                          : 'text-slate-700 hover:bg-slate-100 active:bg-slate-100'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default TimePicker;
