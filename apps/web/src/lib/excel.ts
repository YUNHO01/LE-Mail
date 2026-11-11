import * as XLSX from 'xlsx';

export interface ExportToExcelOptions {
  filename: string;
  sheetName?: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}

/**
 * 2차원 헤더/데이터 배열을 Microsoft Excel(.xlsx) 파일로 변환하여 다운로드합니다.
 */
export function exportTableToExcel({
  filename,
  sheetName = 'Sheet1',
  headers,
  rows,
}: ExportToExcelOptions): void {
  // 1. AOA (Array of Arrays) 데이터 구성
  const sanitizedRows = rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : cell))
  );
  const data = [headers, ...sanitizedRows];

  // 2. 워크시트 생성
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // 3. 열 너비 자동 계산 (한글/영문 글자 길이에 따른 자동 맞춤)
  const colWidths = headers.map((header, colIdx) => {
    let maxLen = header ? String(header).length * 2 : 10;
    sanitizedRows.forEach((row) => {
      const val = row[colIdx];
      if (val !== undefined && val !== null) {
        const str = String(val);
        // 한글 등 멀티바이트 문자는 너비를 더 넉넉하게 계산
        const len = Array.from(str).reduce((acc, char) => {
          return acc + (char.charCodeAt(0) > 127 ? 2 : 1);
        }, 0);
        if (len > maxLen) {
          maxLen = len;
        }
      }
    });
    // 최소 10, 최대 50으로 제한
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });

  worksheet['!cols'] = colWidths;

  // 4. 워크북 생성 및 시트 추가
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31)); // 엑셀 시트명 최대 31자 제한

  // 5. 바이너리 버퍼 생성 및 브라우저 다운로드 트리거
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  link.href = url;
  link.setAttribute('download', safeFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
