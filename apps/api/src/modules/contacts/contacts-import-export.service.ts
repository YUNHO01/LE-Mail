import { Injectable, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactsImportExportService {
  /**
   * 파일 버퍼를 분석하여 연락처 목록(CreateContactDto)으로 파싱
   * Excel(.xlsx, .xls), CSV(.csv), vCard(.vcf) 모두 지원
   */
  async parseImportFile(buffer: Buffer, originalFilename: string): Promise<CreateContactDto[]> {
    const ext = originalFilename.split('.').pop()?.toLowerCase();

    // 1. vCard 포맷
    if (ext === 'vcf') {
      const content = buffer.toString('utf-8');
      return this.parseVCard(content);
    }

    // 2. Excel 포맷 (.xlsx, .xls)
    if (ext === 'xlsx' || ext === 'xls') {
      return this.parseExcelBuffer(buffer);
    }

    // 3. CSV 포맷 또는 텍스트
    const content = buffer.toString('utf-8');
    if (content.includes('BEGIN:VCARD')) {
      return this.parseVCard(content);
    }
    return this.parseCsvText(content);
  }

  /**
   * Excel 바이너리 버퍼 파싱 (ExcelJS 기반 - Prototype Pollution 방어)
   */
  private async parseExcelBuffer(buffer: Buffer): Promise<CreateContactDto[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const stringRows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rowValues: string[] = [];
      const values = row.values;
      if (Array.isArray(values)) {
        // exceljs의 row.values는 1-based index (index 0은 빈 값)
        for (let i = 1; i < values.length; i++) {
          const cell = values[i];
          if (cell !== undefined && cell !== null) {
            if (typeof cell === 'object' && 'text' in cell) {
              rowValues.push(String((cell as any).text).trim());
            } else if (typeof cell === 'object' && 'result' in cell) {
              rowValues.push(String((cell as any).result).trim());
            } else {
              rowValues.push(String(cell).trim());
            }
          } else {
            rowValues.push('');
          }
        }
      }
      stringRows.push(rowValues);
    });

    return this.parseStandardRows(stringRows);
  }

  /**
   * CSV 텍스트 파싱
   */
  private parseCsvText(csvContent: string): CreateContactDto[] {
    const rawRows = this.parseCsvRows(csvContent);
    return this.parseStandardRows(rawRows);
  }

  /**
   * 공통 2차원 행 배열 파서 (첨부 엑셀 양식, Google Contacts, Outlook 등 유연 매핑)
   */
  private parseStandardRows(rawRows: string[][]): CreateContactDto[] {
    if (rawRows.length < 2) return [];

    // 헤더 정제
    const header = rawRows[0].map((h) =>
      h.trim().toLowerCase().replace(/[\ufeff"]/g, '').replace(/\s+/g, ' '),
    );
    const rows = rawRows.slice(1);

    const findExact = (names: string[]) =>
      header.findIndex((h) => names.includes(h));

    const findWithPattern = (
      includePatterns: string[],
      excludePatterns: string[] = ['label', 'type'],
    ) => {
      for (const p of includePatterns) {
        const exact = header.findIndex((h) => h === p);
        if (exact !== -1) return exact;
      }
      return header.findIndex(
        (h) =>
          includePatterns.some((p) => h.includes(p)) &&
          !excludePatterns.some((ep) => h.includes(ep)),
      );
    };

    // 1. 이름
    const nameIdx = findExact(['이름', 'name', '성명', 'display name', '표시 이름', 'full name', 'file as']);
    const firstNameIdx = findExact(['first name', '이름(first)', 'given name']);
    const lastNameIdx = findExact(['last name', '성', '성(last)', 'family name']);

    // 2. 회사, 부서, 직급
    const companyIdx = findExact(['회사', 'company', 'organization name', 'organization 1 - name', '직장']);
    const deptIdx = findExact(['부서', 'department', 'organization department', 'organization 1 - department']);
    const positionIdx = findExact(['직급', '직책', '직함', 'job title', 'title', 'position', 'organization title']);

    // 3. 회사전화번호 & 회사팩스번호
    const companyPhoneIdx = findExact(['회사전화번호', '회사 전화', '회사전화', '직장전화', '직장 전화', 'business phone', 'company phone', 'office phone']);
    const companyFaxIdx = findExact(['회사팩스번호', '회사 팩스', '팩스', '팩스번호', 'fax', 'business fax', 'company fax']);

    // 4. 휴대전화 국가번호 & 휴대전화번호
    const countryCodeIdx = findExact(['휴대전화 국가번호', '국가번호', 'country code', 'mobile country code']);
    const mobilePhoneIdx = findWithPattern(
      ['휴대전화번호', '휴대전화', '휴대폰', '모바일', 'phone 1 - value', 'mobile phone', 'mobile', 'phone', 'tel', '전화번호'],
      ['회사', '직장', '팩스', 'label', 'type'],
    );

    // 5. 메일
    const emailIdx = findWithPattern(
      ['메일', '이메일', '전자 메일 주소', '전자 메일', 'e-mail 1 - value', 'e-mail - value', 'email 1 - value', 'email', 'e-mail'],
      ['label', 'type', 'pref'],
    );

    // 6. 생일, 우편번호, 주소, URL, 메모
    const birthdayIdx = findExact(['생일', '생년월일', 'birthday']);
    const postalCodeIdx = findExact(['우편번호', 'postal code', 'zip code', 'zip']);
    const addressIdx = findExact(['주소', 'address', 'address 1 - formatted', 'address 1 - street']);
    const addressDetailIdx = findExact(['상세주소', '상세 주소', 'address detail', 'address 2', 'address2']);
    const urlIdx = findExact(['url', 'website', '홈페이지', '웹사이트', 'website 1 - value']);
    const memoIdx = findWithPattern(['메모', 'notes', 'note', '설명', '비고'], []);

    const contacts: CreateContactDto[] = [];

    for (const row of rows) {
      // 1. 이름 조립
      let name = '';
      if (nameIdx !== -1 && row[nameIdx]) {
        name = row[nameIdx].trim();
      } else {
        const first = firstNameIdx !== -1 && row[firstNameIdx] ? row[firstNameIdx].trim() : '';
        const last = lastNameIdx !== -1 && row[lastNameIdx] ? row[lastNameIdx].trim() : '';
        if (last && first) {
          const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(last + first);
          name = isKorean ? `${last}${first}` : `${last} ${first}`;
        } else {
          name = last || first;
        }
      }

      // 2. 이메일 정제 (&nbsp; 및 HTML 엔티티 제거)
      let email: string | null = null;
      if (emailIdx !== -1 && row[emailIdx]) {
        let cleanEmail = row[emailIdx].replace(/&nbsp;/gi, '').trim();
        if (cleanEmail && cleanEmail.includes('@')) {
          email = cleanEmail;
        }
      }

      // 3. 전화번호
      let phone: string | null = null;
      if (mobilePhoneIdx !== -1 && row[mobilePhoneIdx]) {
        phone = row[mobilePhoneIdx].trim() || null;
      }

      // 4. 회사 / 부서 / 직급
      const company = companyIdx !== -1 && row[companyIdx] ? row[companyIdx].trim() || null : null;
      const department = deptIdx !== -1 && row[deptIdx] ? row[deptIdx].trim() || null : null;
      const position = positionIdx !== -1 && row[positionIdx] ? row[positionIdx].trim() || null : null;

      // 5. 회사전화 / 회사팩스 / 국가번호
      const companyPhone = companyPhoneIdx !== -1 && row[companyPhoneIdx] ? row[companyPhoneIdx].trim() || null : null;
      const companyFax = companyFaxIdx !== -1 && row[companyFaxIdx] ? row[companyFaxIdx].trim() || null : null;
      const mobileCountryCode = countryCodeIdx !== -1 && row[countryCodeIdx] ? row[countryCodeIdx].trim() || '+82' : '+82';

      // 6. 생일 / 우편번호 / 주소 / URL
      const birthday = birthdayIdx !== -1 && row[birthdayIdx] ? row[birthdayIdx].trim() || null : null;
      const postalCode = postalCodeIdx !== -1 && row[postalCodeIdx] ? row[postalCodeIdx].trim() || null : null;
      const address = addressIdx !== -1 && row[addressIdx] ? row[addressIdx].trim() || null : null;
      const addressDetail = addressDetailIdx !== -1 && row[addressDetailIdx] ? row[addressDetailIdx].trim() || null : null;
      const websiteUrl = urlIdx !== -1 && row[urlIdx] ? row[urlIdx].trim() || null : null;

      // 7. 메모
      const memo = memoIdx !== -1 && row[memoIdx] ? row[memoIdx].trim() || null : null;

      if (!name && !email && !phone && !company) {
        continue;
      }

      if (!name) {
        name = email ? email.split('@')[0] : phone || company || '연락처';
      }

      contacts.push({
        name,
        email,
        phone,
        company,
        department,
        position,
        companyPhone,
        companyFax,
        mobileCountryCode,
        birthday,
        postalCode,
        address,
        addressDetail,
        websiteUrl,
        memo,
      });
    }

    return contacts;
  }

  /**
   * vCard (.vcf) 파서
   */
  private parseVCard(vcfContent: string): CreateContactDto[] {
    const contacts: CreateContactDto[] = [];
    const vcards = vcfContent.split(/BEGIN:VCARD/i).filter((block) => block.trim().length > 0);

    for (const rawBlock of vcards) {
      const lines = rawBlock.split(/\r?\n/);
      let name = '';
      let email = '';
      let phone = '';
      let company = '';
      let department = '';
      let position = '';
      let memo = '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('END:VCARD')) continue;

        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const rawKey = line.substring(0, colonIdx).toUpperCase();
        const value = line.substring(colonIdx + 1).trim();

        if (rawKey.startsWith('FN')) {
          name = value;
        } else if (!name && rawKey.startsWith('N')) {
          const parts = value.split(';').filter(Boolean);
          name = parts.reverse().join(' ');
        } else if (rawKey.startsWith('EMAIL')) {
          if (!email) email = value.replace(/&nbsp;/gi, '').trim();
        } else if (rawKey.startsWith('TEL')) {
          if (!phone) phone = value;
        } else if (rawKey.startsWith('ORG')) {
          const parts = value.split(';');
          company = parts[0]?.trim() || '';
          if (parts.length > 1) {
            department = parts.slice(1).join(' / ').trim();
          }
        } else if (rawKey.startsWith('TITLE')) {
          position = value;
        } else if (rawKey.startsWith('NOTE')) {
          memo = value;
        }
      }

      if (name || email || phone) {
        contacts.push({
          name: name.trim() || email.split('@')[0] || phone || '연락처',
          email: email.trim() || null,
          phone: phone.trim() || null,
          company: company.trim() || null,
          department: department.trim() || null,
          position: position.trim() || null,
          memo: memo.trim() || null,
          mobileCountryCode: '+82',
        });
      }
    }

    return contacts;
  }

  /**
   * 실제 엑셀 파일(.xlsx) 바이너리 버퍼 생성 (첨부 엑셀 양식과 100% 동일한 헤더 순서 및 데이터)
   */
  async exportToExcel(contacts: any[]): Promise<Buffer> {
    const headers = [
      '이름',
      '회사',
      '부서',
      '직급',
      '회사전화번호',
      '회사팩스번호',
      '휴대전화 국가번호',
      '휴대전화번호',
      '메일',
      '생일',
      '우편번호',
      '주소',
      '상세주소',
      'URL',
      '메모',
    ];

    const dataRows = contacts.map((c) => [
      c.name || '',
      c.company || '',
      c.department || '',
      c.position || '',
      c.companyPhone || '',
      c.companyFax || '',
      c.mobileCountryCode || '+82',
      c.phone || '',
      c.email || '',
      c.birthday || '',
      c.postalCode || '',
      c.address || '',
      c.addressDetail || '',
      c.websiteUrl || '',
      c.memo || '',
    ]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('주소록');

    worksheet.addRow(headers);
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };

    worksheet.columns = [
      { width: 16 }, // 이름
      { width: 20 }, // 회사
      { width: 16 }, // 부서
      { width: 14 }, // 직급
      { width: 16 }, // 회사전화번호
      { width: 16 }, // 회사팩스번호
      { width: 12 }, // 휴대전화 국가번호
      { width: 16 }, // 휴대전화번호
      { width: 28 }, // 메일
      { width: 12 }, // 생일
      { width: 10 }, // 우편번호
      { width: 35 }, // 주소
      { width: 25 }, // 상세주소
      { width: 22 }, // URL
      { width: 30 }, // 메모
    ];

    for (const row of dataRows) {
      worksheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * 14개 표준 컬럼 CSV 내보내기 (Excel 및 Outlook 호환 UTF-8 BOM 포함)
   */
  exportToCsv(contacts: any[]): string {
    const headers = [
      '이름',
      '회사',
      '부서',
      '직급',
      '회사전화번호',
      '회사팩스번호',
      '휴대전화 국가번호',
      '휴대전화번호',
      '메일',
      '생일',
      '우편번호',
      '주소',
      '상세주소',
      'URL',
      '메모',
    ];

    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines = [headers.map(escapeCsv).join(',')];

    for (const c of contacts) {
      const row = [
        c.name || '',
        c.company || '',
        c.department || '',
        c.position || '',
        c.companyPhone || '',
        c.companyFax || '',
        c.mobileCountryCode || '+82',
        c.phone || '',
        c.email || '',
        c.birthday || '',
        c.postalCode || '',
        c.address || '',
        c.addressDetail || '',
        c.websiteUrl || '',
        c.memo || '',
      ];
      lines.push(row.map(escapeCsv).join(','));
    }

    return '\ufeff' + lines.join('\r\n');
  }

  /**
   * RFC 4180 준수 따옴표 및 줄바꿈 지원 CSV 파서
   */
  private parseCsvRows(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentField);
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField);
        if (currentRow.some((field) => field.trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }

    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some((field) => field.trim().length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * vCard 3.0 포맷 내보내기
   */
  exportToVCard(contacts: any[]): string {
    const blocks: string[] = [];

    for (const c of contacts) {
      const card: string[] = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${c.name || c.email || c.phone || '연락처'}`,
        `N:;${c.name || c.email || c.phone || '연락처'};;;`,
      ];

      if (c.email) {
        card.push(`EMAIL;TYPE=INTERNET:${c.email}`);
      }
      if (c.phone) {
        card.push(`TEL;TYPE=CELL:${c.phone}`);
      }
      if (c.companyPhone) {
        card.push(`TEL;TYPE=WORK:${c.companyPhone}`);
      }
      if (c.companyFax) {
        card.push(`TEL;TYPE=FAX:${c.companyFax}`);
      }
      if (c.company || c.department) {
        card.push(`ORG:${c.company || ''};${c.department || ''}`);
      }
      if (c.position) {
        card.push(`TITLE:${c.position}`);
      }
      if (c.address || c.addressDetail) {
        const fullAddr = [c.address, c.addressDetail].filter(Boolean).join(' ');
        card.push(`ADR;TYPE=WORK:;;${fullAddr};;;;`);
      }
      if (c.websiteUrl) {
        card.push(`URL:${c.websiteUrl}`);
      }
      if (c.memo) {
        card.push(`NOTE:${c.memo.replace(/\r?\n/g, '\\n')}`);
      }

      card.push('END:VCARD');
      blocks.push(card.join('\r\n'));
    }

    return blocks.join('\r\n\r\n');
  }
}
