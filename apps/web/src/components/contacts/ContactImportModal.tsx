'use client';

import React, { useState, useRef, DragEvent } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, RefreshCw, HelpCircle } from 'lucide-react';
import { contactsApi } from '@/lib/api';
import { DuplicateContactAction, ImportContactsResultDto } from '@lemail/shared-types';

interface ContactImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export const ContactImportModal: React.FC<ContactImportModalProps> = ({
  isOpen,
  onClose,
  onImported,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateContactAction>('SKIP');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportContactsResultDto | null>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'vcf' && ext !== 'xlsx' && ext !== 'xls') {
      setError('지원하지 않는 파일 형식입니다. Excel (.xlsx, .xls), CSV (.csv), 또는 vCard (.vcf) 파일을 선택해 주세요.');
      return;
    }

    setError(null);
    setSelectedFile(file);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content || '');
    };
    reader.onerror = () => {
      setError('파일을 읽는 도중 오류가 발생했습니다.');
    };

    if (ext === 'xlsx' || ext === 'xls') {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file, 'utf-8');
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleExecuteImport = async () => {
    if (!selectedFile || !fileContent) {
      setError('가져올 주소록 파일을 먼저 선택해 주세요.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await contactsApi.importContacts({
        fileContent,
        filename: selectedFile.name,
        duplicateAction,
      });

      setResult(res);
      onImported();
    } catch (err: any) {
      setError(err.message || '가져오기 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setSelectedFile(null);
    setFileContent('');
    setError(null);
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-4">
      <div className="relative flex w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl border border-black/[0.08] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-3.5 bg-[#f5f5f7]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0071e3]/12 text-[#0071e3]">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-[#1d1d1f]">외부 주소록 가져오기</h3>
              <p className="text-[11px] text-[#86868b]">
                Excel (.xlsx, .xls), Outlook CSV, Google 연락처, vCard (.vcf) 파일을 가져옵니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="rounded-lg p-1.5 text-[#86868b] hover:bg-black/[0.06] hover:text-[#1d1d1f] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-[#ff3b30]/[0.06] border border-[#ff3b30]/20 px-3.5 py-2.5 text-xs text-[#d70015] flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 결과 안내창 (완료 시) */}
          {result ? (
            <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-black/[0.02] border-b border-black/[0.06]">
                <CheckCircle2 className="h-4 w-4 text-[#34c759]" />
                <span className="text-xs font-semibold text-[#1d1d1f]">
                  주소록 가져오기가 완료되었습니다.
                </span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-black/[0.06] text-center">
                <div className="p-3.5 bg-white">
                  <div className="text-[11px] text-[#86868b]">전체 데이터</div>
                  <div className="mt-0.5 text-base font-semibold text-[#1d1d1f]">{result.total}건</div>
                </div>
                <div className="p-3.5 bg-white">
                  <div className="text-[11px] text-[#86868b]">가져오기 성공</div>
                  <div className="mt-0.5 text-base font-semibold text-[#0071e3]">{result.imported}건</div>
                </div>
                <div className="p-3.5 bg-white">
                  <div className="text-[11px] text-[#86868b]">건너뜀</div>
                  <div className="mt-0.5 text-base font-semibold text-[#6e6e73]">{result.skipped}건</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="border-t border-black/[0.06] px-4 py-3 bg-[#ff3b30]/[0.04] text-[11px] text-[#d70015] max-h-28 overflow-y-auto">
                  <div className="font-semibold mb-1">오류 발생 항목 ({result.errors.length}건):</div>
                  {result.errors.slice(0, 5).map((e, idx) => (
                    <div key={idx}>• {e}</div>
                  ))}
                  {result.errors.length > 5 && <div>외 {result.errors.length - 5}건 더 있음</div>}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* 파일 업로드 드롭존 */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-2xl border border-dashed p-6 cursor-pointer transition-colors text-center ${
                  isDragging
                    ? 'border-[#0071e3] bg-[#0071e3]/[0.04]'
                    : selectedFile
                    ? 'border-[#0071e3]/45 bg-[#0071e3]/[0.03]'
                    : 'border-black/[0.15] bg-white hover:border-[#0071e3]/45 hover:bg-[#0071e3]/[0.02]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.vcf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center text-[#0071e3]">
                      <FileText className="h-8 w-8" />
                    </div>
                    <div className="text-[13px] font-semibold text-[#1d1d1f]">{selectedFile.name}</div>
                    <div className="text-[11px] text-[#86868b]">
                      {(selectedFile.size / 1024).toFixed(1)} KB • 다시 선택하려면 클릭하세요
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-center text-[#86868b]">
                      <Upload className="h-7 w-7" />
                    </div>
                    <div className="text-xs font-medium text-[#1d1d1f]">
                      Excel(.xlsx, .xls), CSV 또는 vCard(.vcf) 파일을 이곳에 끌어다 놓으세요
                    </div>
                    <div className="text-[11px] text-[#86868b]">
                      또는 <span className="text-[#0071e3] font-medium hover:underline">내 컴퓨터에서 파일 찾기</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 중복 처리 옵션 */}
              <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
                <div className="px-4 py-2.5 bg-black/[0.02] border-b border-black/[0.06] text-[11px] font-semibold text-[#6e6e73]">
                  기존 이메일과 중복될 때 처리 방법
                </div>
                <div className="p-3 grid grid-cols-3 gap-2">
                  <label
                    className={`flex flex-col p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                      duplicateAction === 'SKIP'
                        ? 'border-[#0071e3] bg-[#0071e3]/[0.06] text-[#1d1d1f] font-semibold ring-1 ring-[#0071e3]'
                        : 'border-black/[0.10] bg-white text-[#1d1d1f] hover:bg-black/[0.02]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dupAction"
                      value="SKIP"
                      checked={duplicateAction === 'SKIP'}
                      onChange={() => setDuplicateAction('SKIP')}
                      className="sr-only"
                    />
                    <span>건너뛰기</span>
                    <span className="text-[10px] text-[#86868b] font-normal mt-0.5">
                      기존 연락처 유지
                    </span>
                  </label>

                  <label
                    className={`flex flex-col p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                      duplicateAction === 'OVERWRITE'
                        ? 'border-[#0071e3] bg-[#0071e3]/[0.06] text-[#1d1d1f] font-semibold ring-1 ring-[#0071e3]'
                        : 'border-black/[0.10] bg-white text-[#1d1d1f] hover:bg-black/[0.02]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dupAction"
                      value="OVERWRITE"
                      checked={duplicateAction === 'OVERWRITE'}
                      onChange={() => setDuplicateAction('OVERWRITE')}
                      className="sr-only"
                    />
                    <span>덮어쓰기</span>
                    <span className="text-[10px] text-[#86868b] font-normal mt-0.5">
                      새 정보로 갱신
                    </span>
                  </label>

                  <label
                    className={`flex flex-col p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                      duplicateAction === 'KEEP_BOTH'
                        ? 'border-[#0071e3] bg-[#0071e3]/[0.06] text-[#1d1d1f] font-semibold ring-1 ring-[#0071e3]'
                        : 'border-black/[0.10] bg-white text-[#1d1d1f] hover:bg-black/[0.02]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dupAction"
                      value="KEEP_BOTH"
                      checked={duplicateAction === 'KEEP_BOTH'}
                      onChange={() => setDuplicateAction('KEEP_BOTH')}
                      className="sr-only"
                    />
                    <span>모두 보관</span>
                    <span className="text-[10px] text-[#86868b] font-normal mt-0.5">
                      중복 등록 허용
                    </span>
                  </label>
                </div>
              </div>

              {/* 안내 가이드 */}
              <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-2.5 bg-black/[0.02] border-b border-black/[0.06] text-[11px] font-semibold text-[#6e6e73]">
                  <HelpCircle className="h-3.5 w-3.5 text-[#86868b]" />
                  <span>지원 파일 안내</span>
                </div>
                <div className="px-4 py-3 text-[11px] text-[#6e6e73] space-y-1 leading-relaxed">
                  <div>
                    • <strong className="text-[#1d1d1f]">Excel (.xlsx, .xls)</strong>: 주소록 엑셀 양식 파일 (이름, 회사, 전화번호, 메일 등)
                  </div>
                  <div>
                    • <strong className="text-[#1d1d1f]">CSV (.csv)</strong>: Outlook, Google 연락처 등에서 내보낸 CSV 파일
                  </div>
                  <div>
                    • <strong className="text-[#1d1d1f]">vCard (.vcf)</strong>: 스마트폰 및 표준 연락처 카드 파일
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2 border-t border-black/[0.08] bg-[#f5f5f7]/70 px-6 py-3.5">
          <button
            type="button"
            onClick={resetAll}
            className="rounded-lg px-3.5 py-2 text-xs font-medium text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition-colors"
          >
            {result ? '닫기' : '취소'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={!selectedFile || loading}
              className="rounded-lg bg-[#0071e3] px-5 py-2 text-xs font-medium text-white hover:bg-[#0077ed] shadow-xs transition-colors active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>{loading ? '가져오는 중...' : '가져오기 시작'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
