'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

export interface MailEditorProps {
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  minHeight?: string;
}

// Next.js SSR 방지: 클라이언트 사이드에서만 Quill 로드
const DynamicQuillEditor = dynamic(() => import('./QuillEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center bg-slate-50/50 text-slate-400">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
        <span>편집기 로딩 중...</span>
      </div>
    </div>
  ),
});

export const MailEditor: React.FC<MailEditorProps> = ({
  value,
  onChange,
  placeholder = '메일 내용을 입력하세요...',
  minHeight = '350px',
}) => {
  return (
    <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100">
      <DynamicQuillEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={minHeight}
      />
    </div>
  );
};

export default MailEditor;
