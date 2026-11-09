'use client';

import React from 'react';
import { Copy, FileSpreadsheet, Printer, Check } from 'lucide-react';

export interface TableUtilityButtonsProps {
  onCopy?: () => void;
  onExcel?: () => void;
  onPrint?: () => void;
  copied?: boolean;
  disabled?: boolean;
  copyDisabled?: boolean;
  excelDisabled?: boolean;
  printDisabled?: boolean;
  copyTitle?: string;
  excelTitle?: string;
  printTitle?: string;
  extraActions?: React.ReactNode;
  className?: string;
}

/**
 * 테이블/목록 우측 표준 3종 유틸리티 버튼 컴포넌트 (ams 표준 규격)
 * Copy(클립보드 복사), Excel(CSV 다운로드), Print(인쇄) 버튼을 일관된 크기/폰트로 제공합니다.
 */
export const TableUtilityButtons: React.FC<TableUtilityButtonsProps> = ({
  onCopy,
  onExcel,
  onPrint,
  copied = false,
  disabled = false,
  copyDisabled,
  excelDisabled,
  printDisabled,
  copyTitle = '테이블 데이터를 클립보드에 복사',
  excelTitle = 'CSV 엑셀 파일로 내보내기',
  printTitle = '화면 인쇄',
  extraActions,
  className = '',
}) => {
  const isCopyDisabled = copyDisabled ?? disabled;
  const isExcelDisabled = excelDisabled ?? disabled;
  const isPrintDisabled = printDisabled ?? disabled;

  const handleDefaultPrint = () => {
    if (onPrint) {
      onPrint();
    } else if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className={`flex items-center gap-2 shrink-0 ${className}`}>
      {extraActions}

      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          disabled={isCopyDisabled}
          className="btn btn-sm btn-secondary flex items-center gap-1.5 text-sm font-medium text-gray-800 border-gray-300 hover:border-gray-400 disabled:opacity-50 active:scale-95 transition"
          title={copyTitle}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700 font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-gray-500" />
              <span>Copy</span>
            </>
          )}
        </button>
      )}

      {onExcel && (
        <button
          type="button"
          onClick={onExcel}
          disabled={isExcelDisabled}
          className="btn btn-sm btn-secondary flex items-center gap-1.5 text-sm font-medium text-gray-800 border-gray-300 hover:border-gray-400 disabled:opacity-50 active:scale-95 transition"
          title={excelTitle}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>Excel</span>
        </button>
      )}

      <button
        type="button"
        onClick={handleDefaultPrint}
        disabled={isPrintDisabled}
        className="btn btn-sm btn-secondary flex items-center gap-1.5 text-sm font-medium text-gray-800 border-gray-300 hover:border-gray-400 disabled:opacity-50 active:scale-95 transition"
        title={printTitle}
      >
        <Printer className="w-3.5 h-3.5 text-blue-600" />
        <span>Print</span>
      </button>
    </div>
  );
};

export default TableUtilityButtons;
