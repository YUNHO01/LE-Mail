'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Quote,
  RemoveFormatting,
  Code,
  Type,
} from 'lucide-react';

interface MailEditorProps {
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
}

export const MailEditor: React.FC<MailEditorProps> = ({
  value,
  onChange,
  placeholder = '메일 내용을 입력하세요...',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const [htmlSource, setHtmlSource] = useState(value);

  // 초기 값 설정 및 외부 업데이트 동기화
  useEffect(() => {
    if (editorRef.current && !showHtmlSource) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
    setHtmlSource(value);
  }, [value, showHtmlSource]);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.innerText;
      setHtmlSource(html);
      onChange(html, text);
    }
  };

  const executeCommand = (command: string, arg: string | undefined = undefined) => {
    if (showHtmlSource) return;
    document.execCommand(command, false, arg);
    handleInput();
  };

  const handleAddLink = () => {
    if (showHtmlSource) return;
    const url = prompt('삽입할 링크 URL을 입력하세요 (예: https://example.com):');
    if (url) {
      executeCommand('createLink', url);
    }
  };

  const handleHtmlSourceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newHtml = e.target.value;
    setHtmlSource(newHtml);
    // 임시 div로 순수 text 추출
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newHtml;
    onChange(newHtml, tempDiv.innerText);
  };

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all">
      {/* 서식 툴바 */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/70 p-2 text-slate-700">
        {/* 기본 서식 */}
        <button
          type="button"
          onClick={() => executeCommand('bold')}
          title="굵게 (Ctrl+B)"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <Bold className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('italic')}
          title="기울임 (Ctrl+I)"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <Italic className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('underline')}
          title="밑줄 (Ctrl+U)"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <Underline className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('strikeThrough')}
          title="취소선"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <Strikethrough className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-slate-300" />

        {/* 글자색 선택 */}
        <div className="flex items-center gap-1 px-1">
          <input
            type="color"
            title="글자색 변경"
            disabled={showHtmlSource}
            onChange={(e) => executeCommand('foreColor', e.target.value)}
            className="h-6 w-6 cursor-pointer border-none bg-transparent p-0 disabled:opacity-40"
          />
        </div>

        <div className="mx-1 h-4 w-px bg-slate-300" />

        {/* 정렬 */}
        <button
          type="button"
          onClick={() => executeCommand('justifyLeft')}
          title="왼쪽 정렬"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <AlignLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('justifyCenter')}
          title="가운데 정렬"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <AlignCenter className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('justifyRight')}
          title="오른쪽 정렬"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <AlignRight className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-slate-300" />

        {/* 리스트 & 인용 */}
        <button
          type="button"
          onClick={() => executeCommand('insertUnorderedList')}
          title="글머리 기호"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <List className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('insertOrderedList')}
          title="번호 매기기"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <ListOrdered className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand('formatBlock', 'blockquote')}
          title="인용구"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <Quote className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handleAddLink}
          title="링크 삽입"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <LinkIcon className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-slate-300" />

        <button
          type="button"
          onClick={() => executeCommand('removeFormat')}
          title="서식 지우기"
          disabled={showHtmlSource}
          className="rounded p-1.5 hover:bg-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition"
        >
          <RemoveFormatting className="h-4 w-4" />
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowHtmlSource(!showHtmlSource)}
            title={showHtmlSource ? '에디터 보기' : 'HTML 소스 보기'}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition ${
              showHtmlSource
                ? 'bg-sky-100 text-sky-800'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>HTML 소스</span>
          </button>
        </div>
      </div>

      {/* 에디터 본문 영역 */}
      <div className="relative min-h-[340px] p-4 text-slate-900">
        {showHtmlSource ? (
          <textarea
            value={htmlSource}
            onChange={handleHtmlSourceChange}
            className="w-full h-[320px] font-mono text-xs leading-relaxed p-3 bg-slate-900 text-slate-100 rounded-lg focus:outline-none resize-y"
            placeholder="HTML 소스코드를 직접 작성하세요..."
          />
        ) : (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            data-placeholder={placeholder}
            className="prose prose-sm max-w-none min-h-[320px] focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none"
            style={{ minHeight: '320px' }}
          />
        )}
      </div>
    </div>
  );
};
