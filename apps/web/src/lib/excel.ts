import ExcelJS from 'exceljs';

export interface ExportToExcelOptions {
  filename: string;
  sheetName?: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}

/**
 * 2차원 헤더/데이터 배열을 Microsoft Excel(.xlsx) 파일로 변환하여 다운로드합니다.
 * (exceljs 기반 - SheetJS 프로토타입 오염 취약점 제거)
 */
export async function exportTableToExcel({
  filename,
  sheetName = 'Sheet1',
  headers,
  rows,
}: ExportToExcelOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));

  // 1. 헤더 행 추가
  worksheet.addRow(headers);

  // 헤더 스타일링 (굵은 글씨 및 배경색)
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };

  // 2. 데이터 행 추가
  for (const row of rows) {
    const sanitizedRow = row.map((cell) =>
      cell === null || cell === undefined ? '' : cell,
    );
    worksheet.addRow(sanitizedRow);
  }

  // 3. 열 너비 자동 계산
  worksheet.columns.forEach((column, colIdx) => {
    const header = headers[colIdx];
    let maxLen = header ? String(header).length * 2 : 10;

    rows.forEach((row) => {
      const val = row[colIdx];
      if (val !== undefined && val !== null) {
        const str = String(val);
        const len = Array.from(str).reduce((acc, char) => {
          return acc + (char.charCodeAt(0) > 127 ? 2 : 1);
        }, 0);
        if (len > maxLen) {
          maxLen = len;
        }
      }
    });

    column.width = Math.min(Math.max(maxLen + 3, 12), 50);
  });

  // 4. 버퍼 생성 및 브라우저 다운로드 트리거
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', safeFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
