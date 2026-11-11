import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactsImportExportService {
  /**
   * 파일 버퍼를 분석하여 연락처 목록(CreateContactDto)으로 파싱
   * Excel(.xlsx, .xls), CSV(.csv), vCard(.vcf) 모두 지원
   */
  parseImportFile(buffer: Buffer, originalFilename: string): CreateContactDto[] {
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
   * Excel 바이너리 버퍼 파싱
   */
  private parseExcelBuffer(buffer: Buffer): CreateContactDto[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];

    const worksheet = workbook.Sheets[firstSheetName];
    // 2차원 배열(string[][])로 추출
    const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    const stringRows: string[][] = rawRows.map((row) =>
      row.map((cell) => (cell !== undefined && cell !== null ? String(cell).trim() : '')),
    );

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

    // 6. 생일, 우편번호, 주소, URL, 공개여부, 메모
    const birthdayIdx = findExact(['생일', '생년월일', 'birthday']);
    const postalCodeIdx = findExact(['우편번호', 'postal code', 'zip code', 'zip']);
    const addressIdx = findExact(['주소', 'address', 'address 1 - formatted', 'address 1 - street']);
    const urlIdx = findExact(['url', 'website', '홈페이지', '웹사이트', 'website 1 - value']);
    const isPublicIdx = findExact(['공개여부', '공개', 'is public', 'public']);
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
      const websiteUrl = urlIdx !== -1 && row[urlIdx] ? row[urlIdx].trim() || null : null;

      // 7. 공개여부 (1, '1', '공개', 'true' -> true)
      let isPublic = false;
      if (isPublicIdx !== -1 && row[isPublicIdx]) {
        const val = row[isPublicIdx].trim().toLowerCase();
        isPublic = val === '1' || val === '공개' || val === 'true' || val === 'y';
      }

      // 8. 메모
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
        websiteUrl,
        isPublic,
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
  exportToExcel(contacts: any[]): Buffer {
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
      'URL',
      '공개여부',
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
      c.websiteUrl || '',
      c.isPublic ? 1 : 0,
      c.memo || '',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

    // 컬럼 너비 설정
    worksheet['!cols'] = [
      { wch: 16 }, // 이름
      { wch: 20 }, // 회사
      { wch: 16 }, // 부서
      { wch: 14 }, // 직급
      { wch: 16 }, // 회사전화번호
      { wch: 16 }, // 회사팩스번호
      { wch: 12 }, // 휴대전화 국가번호
      { wch: 16 }, // 휴대전화번호
      { wch: 28 }, // 메일
      { wch: 12 }, // 생일
      { wch: 10 }, // 우편번호
      { wch: 35 }, // 주소
      { wch: 22 }, // URL
      { wch: 10 }, // 공개여부
      { wch: 30 }, // 메모
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '주소록');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return buffer as Buffer;
  }

  /**
   * 15개 표준 컬럼 CSV 내보내기 (Excel 및 Outlook 호환 UTF-8 BOM 포함)
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
      'URL',
      '공개여부',
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
        c.websiteUrl || '',
        c.isPublic ? 1 : 0,
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
      if (c.address) {
        card.push(`ADR;TYPE=WORK:;;${c.address};;;;`);
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
