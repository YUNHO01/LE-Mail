'use client';

import React, { useState, KeyboardEvent, ClipboardEvent } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface RecipientInputProps {
  label: string;
  recipients: string[];
  onChange: (recipients: string[]) => void;
  placeholder?: string;
  rightAction?: React.ReactNode;
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

export const RecipientInput: React.FC<RecipientInputProps> = ({
  label,
  recipients,
  onChange,
  placeholder = '이메일 주소 입력 후 Enter',
  rightAction,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addEmails = (rawText: string) => {
    // 쉼표, 세미콜론, 줄바꿈, 공백 등으로 분리
    const splitEmails = rawText
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    const validNewEmails: string[] = [];
    const invalidEmails: string[] = [];

    for (const email of splitEmails) {
      if (EMAIL_REGEX.test(email)) {
        if (!recipients.includes(email) && !validNewEmails.includes(email)) {
          validNewEmails.push(email);
        }
      } else {
        invalidEmails.push(email);
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (inputValue.trim()) {
        e.preventDefault();
        addEmails(inputValue);
        setInputValue('');
      }
    } else if (e.key === 'Backspace' && !inputValue && recipients.length > 0) {
      // 입력창이 비어있을 때 백스페이스 누르면 마지막 태그 삭제
      removeRecipient(recipients.length - 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    if (pastedText) {
      addEmails(pastedText);
      setInputValue('');
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addEmails(inputValue);
      setInputValue('');
    }
  };

  const removeRecipient = (indexToRemove: number) => {
    onChange(recipients.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3 border-b border-slate-200 py-2.5 px-3 focus-within:border-sky-500 focus-within:bg-sky-50/20 transition-all">
        <label className="w-20 text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0 pt-1.5">
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-h-[32px]">
          {recipients.map((email, idx) => (
            <span
              key={`${email}-${idx}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 py-1 pl-3 pr-2 text-xs font-medium text-slate-800 transition hover:bg-slate-200"
            >
              <span>{email}</span>
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
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleBlur}
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

      {error && (
        <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-rose-600 bg-rose-50 rounded-lg">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
