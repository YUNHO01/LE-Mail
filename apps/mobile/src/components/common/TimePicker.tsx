'use client';

import React, { useEffect, useRef } from 'react';
import flatpickr from 'flatpickr';
import { Korean } from 'flatpickr/dist/l10n/ko';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const fpInstance = useRef<flatpickr.Instance | null>(null);
  const isInternalChange = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!inputRef.current) return;

    fpInstance.current = flatpickr(inputRef.current, {
      locale: Korean,
      enableTime: true,
      noCalendar: true,
      dateFormat: 'H:i',
      time_24hr: true,
      minuteIncrement,
      defaultDate: value || defaultValue || undefined,
      disableMobile: true,
      onChange: (_selectedDates, timeStr) => {
        isInternalChange.current = true;
        onChangeRef.current?.(timeStr);
      },
    });

    return () => {
      fpInstance.current?.destroy();
      fpInstance.current = null;
    };
  }, [minuteIncrement]);

  useEffect(() => {
    if (!fpInstance.current) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (value) {
      fpInstance.current.setDate(value, false);
    } else {
      fpInstance.current.clear(false);
    }
  }, [value]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (fpInstance.current) {
      fpInstance.current.clear(false);
    }
    onChange?.('');
  };

  const sizeClasses = {
    xs: 'text-[11px] py-1 px-2.5 pr-7',
    sm: 'text-xs py-1.5 px-3 pr-8',
    md: 'text-sm py-2 px-3.5 pr-9',
  }[size];

  const hasWidthClass = /(^|\s)w-/.test(className);

  return (
    <div
      className={`relative inline-flex items-center ${hasWidthClass ? '' : 'w-full'} ${className}`}
    >
      <input
        ref={inputRef}
        id={id}
        name={name}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        readOnly
        className={`w-full rounded-lg border border-slate-200 bg-white text-slate-800 cursor-pointer focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${sizeClasses} ${inputClassName}`}
      />
      <div className="absolute right-2.5 flex items-center gap-1 pointer-events-none">
        {allowClear && value && !disabled && (
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
    </div>
  );
}

export default TimePicker;

