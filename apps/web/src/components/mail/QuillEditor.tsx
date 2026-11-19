'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import '@/styles/quill-custom.css';

const FONT_FAMILIES = [
  false,
  'Malgun Gothic',
  'Nanum Gothic',
  'Nanum Myeongjo',
  'NanumBarunGothic',
  'Nanum Pen Script',
  'Arial',
  'Georgia',
  'Courier New',
] as const;
const FONT_SIZES = ['10px', '12px', false, '16px', '18px', '20px', '24px', '28px', '32px'] as const;
const GRID_MAX_ROWS = 8;
const GRID_MAX_COLS = 8;
const IMAGE_SIZE_PRESETS = [
  { label: '25%', value: '25%' },
  { label: '50%', value: '50%' },
  { label: '75%', value: '75%' },
  { label: '100%', value: '100%' },
  { label: '원본', value: null },
] as const;

const TABLE_BUTTON_SVG =
  '<svg viewBox="0 0 18 18"><rect class="ql-stroke" height="12" width="12" x="3" y="3"></rect><line class="ql-stroke" x1="3" x2="15" y1="7" y2="7"></line><line class="ql-stroke" x1="3" x2="15" y1="11" y2="11"></line><line class="ql-stroke" x1="7" x2="7" y1="7" y2="15"></line><line class="ql-stroke" x1="11" x2="11" y1="7" y2="15"></line></svg>';

interface QuillTableModule {
  getTable: (range?: { index: number; length: number } | null) => [
    { domNode?: HTMLElement } | null,
    unknown,
    unknown,
    number,
  ];
  insertTable: (rows: number, cols: number) => void;
  insertRowAbove: () => void;
  insertRowBelow: () => void;
  insertColumnLeft: () => void;
  insertColumnRight: () => void;
  deleteRow: () => void;
  deleteColumn: () => void;
  deleteTable: () => void;
}

interface TableFloatingBox {
  top: number;
  left: number;
}

interface ImageOverlayBox {
  top: number;
  left: number;
  width: number;
  height: number;
  currentWidthAttr: string | null;
}

let modulesRegistered = false;
function ensureQuillSetup() {
  if (modulesRegistered) return;
  const FontStyle = Quill.import('attributors/style/font') as { whitelist: string[] };
  FontStyle.whitelist = FONT_FAMILIES.filter(
    (f): f is Exclude<(typeof FONT_FAMILIES)[number], false> => typeof f === 'string',
  );
  Quill.register(FontStyle as unknown as Parameters<typeof Quill.register>[0], true);

  const SizeStyle = Quill.import('attributors/style/size') as { whitelist: string[] };
  SizeStyle.whitelist = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
  Quill.register(SizeStyle as unknown as Parameters<typeof Quill.register>[0], true);

  const icons = Quill.import('ui/icons') as Record<string, string>;
  icons['table-insert'] = TABLE_BUTTON_SVG;

  modulesRegistered = true;
}

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const isInternalChangeRef = useRef(false);
  const savedRangeRef = useRef<{ index: number; length: number } | null>(null);
  const selectedImgRef = useRef<HTMLImageElement | null>(null);

  const [tableBox, setTableBox] = useState<TableFloatingBox | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const [gridPos, setGridPos] = useState<{ top: number; left: number }>({ top: 42, left: 12 });
  const [hoverSize, setHoverSize] = useState<{ rows: number; cols: number }>({ rows: 3, cols: 3 });
  const [imgBox, setImgBox] = useState<ImageOverlayBox | null>(null);

  const syncImageOverlay = useCallback(() => {
    const img = selectedImgRef.current;
    const wrapper = wrapperRef.current;
    const quill = quillRef.current;
    if (!img || !wrapper || !quill || !quill.root.contains(img)) {
      selectedImgRef.current = null;
      setImgBox(null);
      return;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    setImgBox({
      top: imgRect.top - wrapperRect.top,
      left: imgRect.left - wrapperRect.left,
      width: imgRect.width,
      height: imgRect.height,
      currentWidthAttr: img.getAttribute('width'),
    });
  }, []);

  const syncTableOverlay = useCallback(() => {
    const quill = quillRef.current;
    const wrapper = wrapperRef.current;
    if (!quill || !wrapper) {
      setTableBox(null);
      return;
    }
    const range = quill.getSelection();
    if (!range) {
      setTableBox(null);
      return;
    }
    const tableModule = quill.getModule('table') as QuillTableModule | undefined;
    const [tableBlot] = tableModule?.getTable(range) ?? [null];
    const tableDom = tableBlot?.domNode;
    if (!tableDom || !quill.root.contains(tableDom)) {
      setTableBox(null);
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const tableRect = tableDom.getBoundingClientRect();
    const toolbarEl = wrapper.querySelector('.ql-toolbar') as HTMLElement | null;
    const toolbarBottom = toolbarEl
      ? toolbarEl.getBoundingClientRect().bottom - wrapperRect.top
      : 42;

    const tableTop = tableRect.top - wrapperRect.top;
    const tableBottom = tableRect.bottom - wrapperRect.top;
    const tableLeft = tableRect.left - wrapperRect.left;

    const placeAbove = tableTop - toolbarBottom >= 42;
    const top = placeAbove ? tableTop - 38 : tableBottom + 6;
    const left = Math.max(8, Math.min(tableLeft, Math.max(8, wrapperRect.width - 420)));

    setTableBox({ top, left });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    ensureQuillSetup();

    // 이전 인스턴스 엘리먼트 초기화
    containerRef.current.innerHTML = '';
    const editorDiv = document.createElement('div');
    containerRef.current.appendChild(editorDiv);

    const quill = new Quill(editorDiv, {
      theme: 'snow',
      placeholder,
      modules: {
        table: true,
        toolbar: {
          container: [
            [{ header: [1, 2, 3, false] }],
            [{ font: [...FONT_FAMILIES] }],
            [{ size: [...FONT_SIZES] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ align: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
            ['blockquote', 'code-block'],
            ['link', 'image', 'table-insert'],
            ['clean'],
          ],
          handlers: {
            'table-insert': () => {
              const range = quill.getSelection();
              if (range) {
                savedRangeRef.current = range;
              }
              if (wrapperRef.current) {
                const btn = wrapperRef.current.querySelector('.ql-table-insert') as HTMLElement | null;
                if (btn) {
                  const wrapperRect = wrapperRef.current.getBoundingClientRect();
                  const btnRect = btn.getBoundingClientRect();
                  const left = Math.max(8, Math.min(btnRect.left - wrapperRect.left, wrapperRect.width - 210));
                  setGridPos({
                    top: btnRect.bottom - wrapperRect.top + 6,
                    left,
                  });
                }
              }
              setHoverSize({ rows: 3, cols: 3 });
              setGridOpen((prev) => !prev);
            },
          },
        },
      },
    });

    quillRef.current = quill;

    const tableBtn = wrapperRef.current?.querySelector('.ql-table-insert');
    if (tableBtn) {
      tableBtn.setAttribute('title', '표 추가');
      tableBtn.setAttribute('aria-label', '표 추가');
    }

    const updateTableState = () => {
      const range = quill.getSelection();
      if (range) {
        savedRangeRef.current = range;
      }
      syncTableOverlay();
    };

    const handleRootClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'IMG') {
        selectedImgRef.current = target as HTMLImageElement;
        syncImageOverlay();
      } else {
        selectedImgRef.current = null;
        setImgBox(null);
      }
    };

    const handleRootScroll = () => {
      syncImageOverlay();
      syncTableOverlay();
    };

    quill.root.addEventListener('click', handleRootClick);
    quill.root.addEventListener('scroll', handleRootScroll);

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
      updateTableState();
      syncImageOverlay();
      setTimeout(() => {
        isInternalChangeRef.current = false;
      }, 0);
    });

    quill.on('selection-change', (range) => {
      if (range) {
        savedRangeRef.current = range;
      }
      updateTableState();
    });

    return () => {
      quill.root.removeEventListener('click', handleRootClick);
      quill.root.removeEventListener('scroll', handleRootScroll);
      quillRef.current = null;
      selectedImgRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [syncImageOverlay, syncTableOverlay]);

  // 외부(답장, 임시저장 로드 등)에서 value 변경 시 에디터 내용 동기화
  useEffect(() => {
    if (!quillRef.current || isInternalChangeRef.current) return;
    const currentHtml = quillRef.current.root.innerHTML;
    const normalizedCurrent =
      currentHtml === '<p><br></p>' || currentHtml === '<p></p>' ? '' : currentHtml;

    if (normalizedCurrent !== value) {
      quillRef.current.clipboard.dangerouslyPasteHTML(value || '');
      selectedImgRef.current = null;
      setImgBox(null);
    }
  }, [value]);

  // 바깥 클릭 / ESC 키로 표 그리드 팝업 및 이미지 선택 해제
  useEffect(() => {
    if (!gridOpen && !imgBox && !tableBox) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (gridOpen && !target.closest('.lemail-table-grid-popover') && !target.closest('.ql-table-insert')) {
        setGridOpen(false);
      }
      if (
        imgBox &&
        target.tagName !== 'IMG' &&
        !target.closest('.lemail-image-resize-overlay')
      ) {
        selectedImgRef.current = null;
        setImgBox(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setGridOpen(false);
        selectedImgRef.current = null;
        setImgBox(null);
        setTableBox(null);
      }
    };
    const handleResize = () => {
      syncImageOverlay();
      syncTableOverlay();
    };
    window.addEventListener('resize', handleResize);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [gridOpen, imgBox, tableBox, syncImageOverlay, syncTableOverlay]);

  const applyImageWidth = (widthValue: string | null) => {
    const img = selectedImgRef.current;
    const quill = quillRef.current;
    if (!img || !quill) return;

    const blot = Quill.find(img) as { format?: (name: string, val: unknown) => void } | null;
    if (blot && typeof blot.format === 'function') {
      blot.format('width', widthValue ?? false);
      blot.format('height', false);
    } else {
      if (widthValue) {
        img.setAttribute('width', widthValue);
      } else {
        img.removeAttribute('width');
      }
      img.removeAttribute('height');
    }
    quill.update('user');
    requestAnimationFrame(syncImageOverlay);
  };

  const handleInsertTable = (rows: number, cols: number) => {
    const quill = quillRef.current;
    if (!quill) return;
    const tableModule = quill.getModule('table') as QuillTableModule | undefined;
    if (!tableModule) return;

    const targetIndex = savedRangeRef.current?.index ?? Math.max(0, quill.getLength() - 1);
    quill.focus();
    quill.setSelection(targetIndex, 0, 'silent');
    tableModule.insertTable(rows, cols);
    setGridOpen(false);
    requestAnimationFrame(syncTableOverlay);
  };

  const runTableAction = (action: (tableModule: QuillTableModule) => void) => {
    const quill = quillRef.current;
    if (!quill) return;
    const tableModule = quill.getModule('table') as QuillTableModule | undefined;
    if (!tableModule) return;
    action(tableModule);
    requestAnimationFrame(syncTableOverlay);
  };

  return (
    <div
      ref={wrapperRef}
      className="lemail-quill-wrapper relative"
      style={{ '--editor-min-height': minHeight } as React.CSSProperties}
    >
      {/* 행×열 그리드 선택 팝업 */}
      {gridOpen && (
        <div
          className="lemail-table-grid-popover absolute z-30 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
          style={{ top: gridPos.top, left: gridPos.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-600">
            <span>표 크기 선택</span>
            <span className="text-sky-600 tabular-nums">
              {hoverSize.rows} × {hoverSize.cols}
            </span>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: GRID_MAX_ROWS * GRID_MAX_COLS }, (_, idx) => {
              const r = Math.floor(idx / GRID_MAX_COLS) + 1;
              const c = (idx % GRID_MAX_COLS) + 1;
              const active = r <= hoverSize.rows && c <= hoverSize.cols;
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onMouseEnter={() => setHoverSize({ rows: r, cols: c })}
                  onClick={() => handleInsertTable(r, c)}
                  aria-label={`${r}행 ${c}열 표 삽입`}
                  className={`h-4 w-4 rounded-[3px] border transition ${
                    active
                      ? 'border-sky-500 bg-sky-100'
                      : 'border-slate-200 bg-slate-50 hover:border-sky-400'
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 이미지 선택 시 크기 조절 오버레이 */}
      {imgBox && (
        <div
          className="lemail-image-resize-overlay pointer-events-none absolute z-20 border-2 border-sky-500"
          style={{
            top: imgBox.top,
            left: imgBox.left,
            width: imgBox.width,
            height: imgBox.height,
          }}
        >
          {/* 크기 프리셋 플로팅 바 (이미지 중앙 배치) */}
          <div
            className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-lg backdrop-blur-xs"
            onMouseDown={(e) => e.preventDefault()}
          >
            {IMAGE_SIZE_PRESETS.map((preset) => {
              const isActive =
                preset.value === null
                  ? !imgBox.currentWidthAttr
                  : imgBox.currentWidthAttr === preset.value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyImageWidth(preset.value)}
                  className={`rounded px-1.5 py-0.5 transition ${
                    isActive
                      ? 'bg-sky-600 text-white'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
            <span className="ml-1 border-l border-slate-200 pl-1.5 text-[10px] text-slate-400 tabular-nums">
              {Math.round(imgBox.width)}px
            </span>
          </div>
        </div>
      )}

      <div ref={containerRef} className="w-full" />

      {/* 표 내부 선택 시 표 근처(위 또는 아래)에 노출되는 플로팅 컨트롤 바 */}
      {tableBox && (
        <div
          className="lemail-table-floating-bar absolute z-20 flex max-w-[calc(100%-16px)] flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-lg backdrop-blur-xs"
          style={{ top: tableBox.top, left: tableBox.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="mr-0.5 font-semibold text-sky-700">표</span>
          <button
            type="button"
            onClick={() => runTableAction((m) => m.insertRowAbove())}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:border-sky-300 hover:text-sky-700 transition"
          >
            +위행
          </button>
          <button
            type="button"
            onClick={() => runTableAction((m) => m.insertRowBelow())}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:border-sky-300 hover:text-sky-700 transition"
          >
            +아래행
          </button>
          <div className="mx-0.5 h-3.5 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => runTableAction((m) => m.insertColumnLeft())}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:border-sky-300 hover:text-sky-700 transition"
          >
            +좌열
          </button>
          <button
            type="button"
            onClick={() => runTableAction((m) => m.insertColumnRight())}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:border-sky-300 hover:text-sky-700 transition"
          >
            +우열
          </button>
          <div className="mx-0.5 h-3.5 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => runTableAction((m) => m.deleteRow())}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:border-amber-300 hover:text-amber-700 transition"
          >
            행삭제
          </button>
          <button
            type="button"
            onClick={() => runTableAction((m) => m.deleteColumn())}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:border-amber-300 hover:text-amber-700 transition"
          >
            열삭제
          </button>
          <button
            type="button"
            onClick={() => runTableAction((m) => m.deleteTable())}
            className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-rose-700 hover:bg-rose-100 transition"
          >
            표삭제
          </button>
        </div>
      )}
    </div>
  );
};

export default QuillEditor;
