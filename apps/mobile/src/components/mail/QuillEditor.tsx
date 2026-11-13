'use client';

import React, { useEffect, useRef } from 'react';
import Quill from 'quill';
import '@/styles/quill-custom.css';

export interface QuillEditorProps {
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export const QuillEditor: React.FC<QuillEditorProps> = ({
  value,
  onChange,
  placeholder = '메일 내용을 입력하세요...',
  minHeight = '350px',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const isInternalChangeRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // 이전 인스턴스 엘리먼트 초기화
    containerRef.current.innerHTML = '';
    const editorDiv = document.createElement('div');
    containerRef.current.appendChild(editorDiv);

    const quill = new Quill(editorDiv, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ align: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
          ['blockquote', 'code-block'],
          ['link', 'image'],
          ['clean'],
        ],
      },
    });

    quillRef.current = quill;

    // 초기 본문 HTML 주입
    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value);
    }

    // 마운트 시 자동 포커스로 인한 브라우저 스크롤 점프(scrollIntoView) 방지
    quill.blur();

    // 본문 변경 리스너
    quill.on('text-change', () => {
      isInternalChangeRef.current = true;
      const html = quill.root.innerHTML;
      const text = quill.getText();
      const cleanHtml = html === '<p><br></p>' || html === '<p></p>' ? '' : html;
      onChange(cleanHtml, text);
      setTimeout(() => {
        isInternalChangeRef.current = false;
      }, 0);
    });

    return () => {
      quillRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  // 외부(답장, 임시저장 로드 등)에서 value 변경 시 에디터 내용 동기화
  useEffect(() => {
    if (!quillRef.current || isInternalChangeRef.current) return;
    const currentHtml = quillRef.current.root.innerHTML;
    const normalizedCurrent =
      currentHtml === '<p><br></p>' || currentHtml === '<p></p>' ? '' : currentHtml;

    if (normalizedCurrent !== value) {
      quillRef.current.clipboard.dangerouslyPasteHTML(value || '');
    }
  }, [value]);

  return (
    <div
      className="lemail-quill-wrapper"
      style={{ '--editor-min-height': minHeight } as React.CSSProperties}
    >
      <div ref={containerRef} className="w-full" />
    </div>
  );
};

export default QuillEditor;
