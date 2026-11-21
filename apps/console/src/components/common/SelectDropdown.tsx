'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectDropdownOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectDropdownProps<T extends string = string> {
  options: SelectDropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  headerLabel?: string;
  placeholder?: string;
  triggerIcon?: React.ReactNode;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  disabled?: boolean;
  align?: 'left' | 'right';
  menuWidthClass?: string;
  className?: string;
  title?: string;
}

interface MenuCoords {
  top: number;
  left?: number;
  right?: number;
  minWidth: number;
  openUpward: boolean;
}

export function SelectDropdown<T extends string = string>({
  options,
  value,
  onChange,
  headerLabel,
  placeholder = '선택하세요',
  triggerIcon,
  size = 'sm',
  fullWidth = false,
  disabled = false,
  align = 'left',
  menuWidthClass,
  className = '',
  title,
}: SelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedMenuHeight = Math.min(280, options.length * 36 + (headerLabel ? 32 : 12));
    const openUpward = spaceBelow < estimatedMenuHeight && rect.top > spaceBelow;

    setCoords({
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      left: align === 'left' ? rect.left : undefined,
      right: align === 'right' ? window.innerWidth - rect.right : undefined,
      minWidth: rect.width,
      openUpward,
    });
  }, [align, headerLabel, options.length]);

  useEffect(() => {
    if (!isOpen) return;
    updateCoords();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      updateCoords();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updateCoords]);

  const currentOption = options.find((opt) => opt.value === value);
  const displayIcon = triggerIcon ?? currentOption?.icon;

  const sizeClasses =
    size === 'md'
      ? 'h-[38px] px-3 text-sm rounded-lg'
      : 'h-8 px-3 text-xs rounded-lg';

  return (
    <div className={`relative ${fullWidth ? 'w-full' : 'inline-block'} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        title={title}
        className={`flex items-center justify-between gap-2 border bg-white font-medium shadow-xs transition select-none ${
          fullWidth ? 'w-full' : ''
        } ${sizeClasses} ${
          disabled
            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-75'
            : isOpen
              ? 'border-sky-500 ring-2 ring-sky-500/20 text-slate-800 cursor-pointer'
              : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {displayIcon && (
            <span className="flex items-center justify-center w-3.5 h-3.5 shrink-0">
              {displayIcon}
            </span>
          )}
          <span
            className={`truncate ${
              size === 'sm' ? 'font-semibold text-slate-800' : 'text-slate-800'
            } ${!currentOption ? 'text-slate-400' : ''}`}
          >
            {currentOption ? currentOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen &&
        mounted &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              right: coords.right,
              minWidth: coords.minWidth,
              transform: coords.openUpward ? 'translateY(-100%)' : undefined,
            }}
            className={`rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl z-[9999] animate-in fade-in zoom-in-95 duration-100 ${
              menuWidthClass || ''
            }`}
          >
            {headerLabel && (
              <div className="px-3 py-1 border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {headerLabel}
              </div>
            )}
            <div className="py-1 max-h-64 overflow-y-auto">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between gap-2 transition ${
                      opt.disabled
                        ? 'text-slate-300 cursor-not-allowed'
                        : isSelected
                          ? 'bg-sky-50 text-sky-800 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {opt.icon && (
                        <span className="flex items-center justify-center w-4 h-4 shrink-0">
                          {opt.icon}
                        </span>
                      )}
                      <span className="truncate">{opt.label}</span>
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
