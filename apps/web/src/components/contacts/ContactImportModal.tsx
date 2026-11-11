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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">외부 주소록 가져오기</h3>
              <p className="text-xs text-slate-400">
                Excel (.xlsx, .xls), Outlook CSV, Google 연락처, vCard (.vcf) 파일을 가져옵니다.
              </p>
            </div>
          </div>
          <button
            onClick={resetAll}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-600 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 결과 안내창 (완료 시) */}
          {result ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 space-y-3">
              <div className="flex items-center gap-2.5 text-emerald-600 font-semibold text-sm">
                <CheckCircle2 className="h-5 w-5" />
                <span>주소록 가져오기가 완료되었습니다.</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                  <div className="text-slate-400 text-[11px]">전체 데이터</div>
                  <div className="text-base font-bold text-slate-700">{result.total}건</div>
                </div>
                <div className="rounded-lg bg-white p-2.5 border border-emerald-200">
                  <div className="text-emerald-500 text-[11px]">가져오기 성공</div>
                  <div className="text-base font-bold text-emerald-600">{result.imported}건</div>
                </div>
                <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                  <div className="text-slate-400 text-[11px]">건너뜀</div>
                  <div className="text-base font-bold text-slate-500">{result.skipped}건</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="text-[11px] text-rose-500 bg-rose-50 p-2.5 rounded-lg border border-rose-200 max-h-24 overflow-y-auto">
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
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 cursor-pointer transition text-center ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/40'
                    : selectedFile
                    ? 'border-emerald-300 bg-emerald-50/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/40 hover:bg-slate-50'
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
                    <div className="flex items-center justify-center text-emerald-600">
                      <FileText className="h-8 w-8" />
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{selectedFile.name}</div>
                    <div className="text-xs text-slate-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB • 다시 선택하려면 클릭하세요
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-center text-slate-400">
                      <Upload className="h-8 w-8" />
                    </div>
                    <div className="text-xs font-semibold text-slate-700">
                      Excel(.xlsx, .xls), CSV 또는 vCard(.vcf) 파일을 이곳에 끌어다 놓으세요
                    </div>
                    <div className="text-[11px] text-slate-400">
                      또는 <span className="text-sky-600 underline">내 컴퓨터에서 파일 찾기</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 중복 처리 옵션 */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-semibold text-slate-700">
                  기존 이메일과 중복될 때 처리 방법
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label
                    className={`flex flex-col p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                      duplicateAction === 'SKIP'
                        ? 'border-sky-500 bg-sky-50/40 text-sky-900 font-semibold ring-1 ring-sky-500'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                    <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                      기존 연락처 유지
                    </span>
                  </label>

                  <label
                    className={`flex flex-col p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                      duplicateAction === 'OVERWRITE'
                        ? 'border-sky-500 bg-sky-50/40 text-sky-900 font-semibold ring-1 ring-sky-500'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                    <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                      새 정보로 갱신
                    </span>
                  </label>

                  <label
                    className={`flex flex-col p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                      duplicateAction === 'KEEP_BOTH'
                        ? 'border-sky-500 bg-sky-50/40 text-sky-900 font-semibold ring-1 ring-sky-500'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                    <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                      중복 등록 허용
                    </span>
                  </label>
                </div>
              </div>

              {/* 안내 가이드 */}
              <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 flex items-start gap-2">
                <HelpCircle className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                <div>
                  <strong>지원 파일 안내:</strong>
                  <br />
                  • <strong>Excel (.xlsx, .xls)</strong>: 주소록 엑셀 양식 파일 (이름, 회사, 전화번호, 메일 등)
                  <br />
                  • <strong>CSV (.csv)</strong>: Outlook, Google 연락처 등에서 내보낸 CSV 파일
                  <br />
                  • <strong>vCard (.vcf)</strong>: 스마트폰 및 표준 연락처 카드 파일
                </div>
              </div>
            </>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={resetAll}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              {result ? '닫기' : '취소'}
            </button>
            {!result && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={!selectedFile || loading}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/20 transition active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>{loading ? '가져오는 중...' : '가져오기 시작'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
