'use client';

import React from 'react';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  showStatusText?: boolean;
  size?: 'sm' | 'md';
  color?: 'indigo' | 'sky' | 'amber';
  disabled?: boolean;
  id?: string;
  className?: string;
}

const COLOR_MAP: Record<'indigo' | 'sky' | 'amber', { bg: string; ring: string; text: string }> = {
  indigo: {
    bg: 'bg-indigo-600',
    ring: 'focus:ring-indigo-500',
    text: 'text-indigo-600',
  },
  sky: {
    bg: 'bg-sky-600',
    ring: 'focus:ring-sky-500',
    text: 'text-sky-600',
  },
  amber: {
    bg: 'bg-amber-500',
    ring: 'focus:ring-amber-500',
    text: 'text-amber-600',
  },
};

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  showStatusText = true,
  size = 'md',
  color = 'indigo',
  disabled = false,
  id,
  className = '',
}) => {
  const palette = COLOR_MAP[color];
  const isSm = size === 'sm';

  const trackClass = isSm ? 'h-5 w-9' : 'h-6 w-11';
  const thumbClass = isSm ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const translateClass = isSm
    ? checked
      ? 'translate-x-4'
      : 'translate-x-0.5'
    : checked
    ? 'translate-x-5'
    : 'translate-x-0.5';

  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <div className={`inline-flex items-center gap-2.5 ${disabled ? 'opacity-50' : ''} ${className}`}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={handleToggle}
        className={`relative inline-flex shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${trackClass} ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        } ${checked ? palette.bg : 'bg-slate-300'} ${palette.ring}`}
      >
        <span
          className={`inline-block transform rounded-full bg-white shadow-xs transition-transform ${thumbClass} ${translateClass}`}
        />
      </button>

      {(showStatusText || label) && (
        <button
          type="button"
          disabled={disabled}
          onClick={handleToggle}
          className={`inline-flex items-center gap-1.5 text-left ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          {showStatusText && (
            <span
              className={`inline-block w-6 text-[11px] font-bold ${
                checked ? palette.text : 'text-slate-400'
              }`}
            >
              {checked ? 'ON' : 'OFF'}
            </span>
          )}
          {label && <span className="text-xs font-medium text-slate-700">{label}</span>}
        </button>
      )}
    </div>
  );
};
