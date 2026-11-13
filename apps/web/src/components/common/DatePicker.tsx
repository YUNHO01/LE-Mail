'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DatePickerProps {
    value?: string;
    defaultValue?: string;
    onChange?: (dateStr: string) => void;
    placeholder?: string;
    dateFormat?: string;
    viewMode?: 'date' | 'month' | 'year';
    minDate?: string | Date;
    maxDate?: string | Date;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    inputClassName?: string;
    size?: 'xs' | 'sm' | 'md';
    allowClear?: boolean;
    id?: string;
    name?: string;
}

type ViewLevel = 'day' | 'month' | 'year';

const MONTH_NAMES = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월',
];

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function parseDateString(dateStr?: string): { year?: number; month?: number; day?: number } {
    if (!dateStr || typeof dateStr !== 'string') return {};
    const trimmed = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [y, m, d] = trimmed.split('-').map(Number);
        return { year: y, month: m, day: d };
    }
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
        const [y, m] = trimmed.split('-').map(Number);
        return { year: y, month: m };
    }
    if (/^\d{4}$/.test(trimmed)) {
        return { year: Number(trimmed) };
    }
    return {};
}

function formatDateToYmd(year: number, month: number, day: number): string {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
}

export function DatePicker({
    value,
    defaultValue,
    onChange,
    dateFormat,
    viewMode = 'date',
    placeholder,
    minDate,
    maxDate,
    disabled = false,
    required = false,
    className = '',
    inputClassName = '',
    size = 'sm',
    allowClear = false,
    id,
    name,
}: DatePickerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    const isYearMode = viewMode === 'year' || dateFormat === 'Y';
    const isMonthMode = !isYearMode && (viewMode === 'month' || dateFormat === 'Y-m');

    const today = useMemo(() => new Date(), []);
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();
    const todayYmd = useMemo(
        () => formatDateToYmd(todayYear, todayMonth, todayDay),
        [todayYear, todayMonth, todayDay],
    );

    const [internalValue, setInternalValue] = useState<string>(() => defaultValue || '');

    useEffect(() => {
        if (value === undefined && defaultValue !== undefined) {
            setInternalValue(defaultValue);
        }
    }, [value, defaultValue]);

    const activeValue = value !== undefined ? value : internalValue;
    const parsed = useMemo(() => parseDateString(activeValue), [activeValue]);

    const initialViewLevel: ViewLevel = isYearMode ? 'year' : isMonthMode ? 'month' : 'day';
    const [viewLevel, setViewLevel] = useState<ViewLevel>(initialViewLevel);
    const [viewYear, setViewYear] = useState<number>(() => parsed.year || todayYear);
    const [viewMonth, setViewMonth] = useState<number>(() => parsed.month || todayMonth);
    const [decadeStart, setDecadeStart] = useState<number>(() => {
        const y = parsed.year || todayYear;
        return Math.floor(y / 10) * 10;
    });

    const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number }>({
        top: 0,
        left: 0,
    });

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (activeValue) {
            const p = parseDateString(activeValue);
            if (p.year) {
                setViewYear(p.year);
                setDecadeStart(Math.floor(p.year / 10) * 10);
            }
            if (p.month) {
                setViewMonth(p.month);
            }
        }
    }, [activeValue]);

    useEffect(() => {
        if (isOpen) {
            if (isYearMode) setViewLevel('year');
            else if (isMonthMode) setViewLevel('month');
            else setViewLevel('day');
        }
    }, [isOpen, isYearMode, isMonthMode]);

    const calculatePosition = useCallback(() => {
        if (!containerRef.current) return null;
        const rect = containerRef.current.getBoundingClientRect();
        const popoverHeight = 345;
        const popoverWidth = 288;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        const spaceBelow = viewportHeight - rect.bottom;
        const openUpwards = spaceBelow < popoverHeight && rect.top > popoverHeight;

        const top = openUpwards ? rect.top - popoverHeight - 6 : rect.bottom + 6;
        let left = rect.left;

        if (left + popoverWidth > viewportWidth - 12) {
            left = Math.max(12, viewportWidth - popoverWidth - 12);
        }
        if (left < 12) {
            left = 12;
        }

        return { top, left };
    }, []);

    const updatePosition = useCallback(() => {
        const coords = calculatePosition();
        if (coords) {
            setPopoverCoords(coords);
        }
    }, [calculatePosition]);

    const handleToggleOpen = () => {
        if (disabled) return;
        if (!isOpen) {
            const coords = calculatePosition();
            if (coords) {
                setPopoverCoords(coords);
            }
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        updatePosition();

        const handleScrollOrResize = () => {
            updatePosition();
        };

        window.addEventListener('resize', handleScrollOrResize);
        window.addEventListener('scroll', handleScrollOrResize, true);

        return () => {
            window.removeEventListener('resize', handleScrollOrResize);
            window.removeEventListener('scroll', handleScrollOrResize, true);
        };
    }, [isOpen, updatePosition]);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                containerRef.current &&
                !containerRef.current.contains(target) &&
                popoverRef.current &&
                !popoverRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const effectivePlaceholder =
        placeholder || (isYearMode ? '연도 선택' : isMonthMode ? 'YYYY-MM' : 'YYYY-MM-DD');

    const displayValue = useMemo(() => {
        if (!activeValue) return '';
        if (isYearMode) {
            const cleanYear = activeValue.replace(/[년年]/g, '').trim();
            return `${cleanYear}년`;
        }
        return activeValue;
    }, [activeValue, isYearMode]);

    const sizeClasses = {
        xs: 'text-[11px] py-1 px-2.5 pr-7',
        sm: 'text-xs py-1.5 px-3 pr-8',
        md: 'text-sm py-2 px-3.5 pr-9',
    }[size];

    const handleSelectDate = useCallback(
        (newDate: string) => {
            if (value === undefined) {
                setInternalValue(newDate);
            }
            onChange?.(newDate);
        },
        [value, onChange],
    );

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleSelectDate('');
    };

    const isDateDisabled = useCallback(
        (ymdStr: string) => {
            if (minDate) {
                const minStr =
                    typeof minDate === 'string' ? minDate : minDate.toISOString().slice(0, 10);
                if (ymdStr < minStr) return true;
            }
            if (maxDate) {
                const maxStr =
                    typeof maxDate === 'string' ? maxDate : maxDate.toISOString().slice(0, 10);
                if (ymdStr > maxStr) return true;
            }
            return false;
        },
        [minDate, maxDate],
    );

    const calendarDays = useMemo(() => {
        const firstDayIndex = new Date(viewYear, viewMonth - 1, 1).getDay();
        const daysInCurrentMonth = new Date(viewYear, viewMonth, 0).getDate();
        const daysInPrevMonth = new Date(viewYear, viewMonth - 1, 0).getDate();

        const days: Array<{
            dateStr: string;
            dayNumber: number;
            isCurrentMonth: boolean;
            isSelected: boolean;
            isToday: boolean;
            isDisabled: boolean;
        }> = [];

        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            const prevMonthYear = viewMonth === 1 ? viewYear - 1 : viewYear;
            const prevMonthVal = viewMonth === 1 ? 12 : viewMonth - 1;
            const dateStr = formatDateToYmd(prevMonthYear, prevMonthVal, dayNum);
            days.push({
                dateStr,
                dayNumber: dayNum,
                isCurrentMonth: false,
                isSelected: dateStr === activeValue,
                isToday: dateStr === todayYmd,
                isDisabled: isDateDisabled(dateStr),
            });
        }

        for (let d = 1; d <= daysInCurrentMonth; d++) {
            const dateStr = formatDateToYmd(viewYear, viewMonth, d);
            days.push({
                dateStr,
                dayNumber: d,
                isCurrentMonth: true,
                isSelected: dateStr === activeValue,
                isToday: dateStr === todayYmd,
                isDisabled: isDateDisabled(dateStr),
            });
        }

        const remainingCount = 42 - days.length;
        for (let d = 1; d <= remainingCount; d++) {
            const nextMonthYear = viewMonth === 12 ? viewYear + 1 : viewYear;
            const nextMonthVal = viewMonth === 12 ? 1 : viewMonth + 1;
            const dateStr = formatDateToYmd(nextMonthYear, nextMonthVal, d);
            days.push({
                dateStr,
                dayNumber: d,
                isCurrentMonth: false,
                isSelected: dateStr === activeValue,
                isToday: dateStr === todayYmd,
                isDisabled: isDateDisabled(dateStr),
            });
        }

        return days;
    }, [viewYear, viewMonth, activeValue, todayYmd, isDateDisabled]);

    const years = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i);
    }, [decadeStart]);

    const hasWidthClass = /(^|\s)w-/.test(className);

    return (
        <div
            ref={containerRef}
            className={`relative inline-flex items-center ${hasWidthClass ? '' : 'w-full'} ${className}`}
        >
            <input
                id={id}
                name={isYearMode ? undefined : name}
                disabled={disabled}
                required={required}
                value={displayValue}
                placeholder={effectivePlaceholder}
                readOnly
                onClick={handleToggleOpen}
                className={`w-full rounded-lg border border-slate-200 bg-white text-slate-800 cursor-pointer focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${sizeClasses} ${inputClassName}`}
            />
            {name && isYearMode && (
                <input type="hidden" name={name} value={activeValue} />
            )}

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
                <CalendarIcon
                    onClick={handleToggleOpen}
                    className={`w-3.5 h-3.5 text-slate-400 ${disabled ? '' : 'pointer-events-auto cursor-pointer'}`}
                />
            </div>

            {isOpen &&
                isMounted &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        ref={popoverRef}
                        style={{
                            position: 'fixed',
                            top: `${popoverCoords.top}px`,
                            left: `${popoverCoords.left}px`,
                            zIndex: 9999,
                        }}
                        className="w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5 select-none"
                    >
                        {viewLevel === 'day' && (
                            <div>
                                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (viewMonth === 1) {
                                                setViewYear((prev) => prev - 1);
                                                setViewMonth(12);
                                            } else {
                                                setViewMonth((prev) => prev - 1);
                                            }
                                        }}
                                        className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                                        title="이전 달"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>

                                    <div className="flex items-center gap-1 text-xs">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDecadeStart(Math.floor(viewYear / 10) * 10);
                                                setViewLevel('year');
                                            }}
                                            className="font-bold text-slate-800 hover:text-violet-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                                            title="연도 선택으로 이동"
                                        >
                                            {viewYear}년
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setViewLevel('month');
                                            }}
                                            className="font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1"
                                            title="월 선택으로 이동"
                                        >
                                            <span>{viewMonth}월</span>
                                            <span className="text-[10px] text-violet-500">▼</span>
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (viewMonth === 12) {
                                                setViewYear((prev) => prev + 1);
                                                setViewMonth(1);
                                            } else {
                                                setViewMonth((prev) => prev + 1);
                                            }
                                        }}
                                        className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                                        title="다음 달"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-7 gap-1 mb-1 text-center">
                                    {WEEKDAY_NAMES.map((w, idx) => (
                                        <span
                                            key={w}
                                            className={`text-[11px] font-semibold py-0.5 ${idx === 0
                                                    ? 'text-rose-500'
                                                    : idx === 6
                                                        ? 'text-sky-500'
                                                        : 'text-slate-400'
                                                }`}
                                        >
                                            {w}
                                        </span>
                                    ))}
                                </div>

                                <div className="grid grid-cols-7 gap-1">
                                    {calendarDays.map((d, idx) => (
                                        <button
                                            key={`${d.dateStr}-${idx}`}
                                            type="button"
                                            disabled={d.isDisabled}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (d.isDisabled) return;
                                                handleSelectDate(d.dateStr);
                                                setIsOpen(false);
                                            }}
                                            className={`h-8 w-8 mx-auto flex items-center justify-center text-xs rounded-lg transition-colors font-medium ${d.isSelected
                                                    ? 'bg-violet-600 text-white font-bold shadow-xs'
                                                    : d.isToday
                                                        ? 'border border-violet-400 text-violet-700 font-semibold hover:bg-violet-50'
                                                        : !d.isCurrentMonth
                                                            ? 'text-slate-300 hover:bg-slate-50'
                                                            : idx % 7 === 0
                                                                ? 'text-rose-500 hover:bg-rose-50'
                                                                : idx % 7 === 6
                                                                    ? 'text-sky-600 hover:bg-sky-50'
                                                                    : 'text-slate-800 hover:bg-slate-100'
                                                } ${d.isDisabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                                        >
                                            {d.dayNumber}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {viewLevel === 'month' && (
                            <div>
                                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewYear((prev) => prev - 1);
                                        }}
                                        className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                                        title="이전 연도"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDecadeStart(Math.floor(viewYear / 10) * 10);
                                            setViewLevel('year');
                                        }}
                                        className="font-bold text-xs text-slate-800 hover:text-violet-600 px-2 py-0.5 rounded-md hover:bg-slate-100 transition-colors flex items-center gap-1"
                                        title="연도 선택으로 이동"
                                    >
                                        <span>{viewYear}년</span>
                                        <span className="text-[10px] text-slate-400">▼</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewYear((prev) => prev + 1);
                                        }}
                                        className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                                        title="다음 연도"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    {MONTH_NAMES.map((mName, mIdx) => {
                                        const mNum = mIdx + 1;
                                        const isSelected = parsed.year === viewYear && parsed.month === mNum;
                                        const isCurrent = viewYear === todayYear && mNum === todayMonth;

                                        return (
                                            <button
                                                key={mName}
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isMonthMode) {
                                                        const yStr = String(viewYear);
                                                        const mStr = String(mNum).padStart(2, '0');
                                                        handleSelectDate(`${yStr}-${mStr}`);
                                                        setIsOpen(false);
                                                    } else {
                                                        setViewMonth(mNum);
                                                        setViewLevel('day');
                                                    }
                                                }}
                                                className={`py-2 text-xs rounded-xl transition-colors font-medium ${isSelected
                                                        ? 'bg-violet-600 text-white font-bold shadow-xs'
                                                        : isCurrent
                                                            ? 'border border-violet-400 text-violet-700 font-semibold hover:bg-violet-50'
                                                            : 'text-slate-700 hover:bg-slate-100'
                                                    }`}
                                            >
                                                {mName}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {viewLevel === 'year' && (
                            <div>
                                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDecadeStart((prev) => prev - 10);
                                        }}
                                        className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                                        title="이전 10년"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>

                                    <span className="text-xs font-bold text-slate-800">
                                        {decadeStart}년 ~ {decadeStart + 9}년
                                    </span>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDecadeStart((prev) => prev + 10);
                                        }}
                                        className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                                        title="다음 10년"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-3 gap-1.5">
                                    {years.map((yr) => {
                                        const isSelected = parsed.year === yr;
                                        const isCurrent = yr === todayYear;
                                        const isOutOfDecade = yr < decadeStart || yr > decadeStart + 9;

                                        return (
                                            <button
                                                key={yr}
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setViewYear(yr);
                                                    if (isYearMode) {
                                                        handleSelectDate(String(yr));
                                                        setIsOpen(false);
                                                    } else {
                                                        setViewLevel('month');
                                                    }
                                                }}
                                                className={`py-2 text-xs rounded-xl transition-colors font-medium ${isSelected
                                                        ? 'bg-violet-600 text-white font-bold shadow-xs'
                                                        : isCurrent
                                                            ? 'border border-violet-400 text-violet-700 font-semibold hover:bg-violet-50'
                                                            : isOutOfDecade
                                                                ? 'text-slate-300 hover:bg-slate-50'
                                                                : 'text-slate-700 hover:bg-slate-100'
                                                    }`}
                                            >
                                                {yr}년
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>,
                    document.body,
                )}
        </div>
    );
}

export default DatePicker;

