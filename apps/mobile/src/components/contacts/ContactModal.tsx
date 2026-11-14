'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Star,
  Search,
} from 'lucide-react';
import { contactsApi } from '@/lib/api';
import { ContactDto, ContactGroupDto, CreateContactDto } from '@lemail/shared-types';
import { SelectDropdown, DaumPostcodeModal, DaumPostcodeResult } from '@/components/common';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact?: ContactDto | null;
  groups: ContactGroupDto[];
  onSaved: () => void;
}

const normalizeBirthdayForDateInput = (value?: string | null): string => {
  if (!value) return '';
  const trimmed = value.trim();
  const sepMatch = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (sepMatch) {
    const [, y, m, d] = sepMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, y, m, d] = compactMatch;
    return `${y}-${m}-${d}`;
  }
  return '';
};

export const ContactModal: React.FC<ContactModalProps> = ({
  isOpen,
  onClose,
  contact,
  groups,
  onSaved,
}) => {
  const isEditing = Boolean(contact);

  // 기본 항목
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [memo, setMemo] = useState('');
  const [isStarred, setIsStarred] = useState(false);

  // 엑셀 양식 추가 항목
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyFax, setCompanyFax] = useState('');
  const [mobileCountryCode, setMobileCountryCode] = useState('+82');
  const [birthday, setBirthday] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  // Daum 우편번호 검색 모달
  const [isPostcodeModalOpen, setIsPostcodeModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contact) {
      setName(contact.name || '');
      setEmail(contact.email || '');
      setPhone(contact.phone || '');
      setCompany(contact.company || '');
      setDepartment(contact.department || '');
      setPosition(contact.position || '');
      setGroupId(contact.groupId || '');
      setMemo(contact.memo || '');
      setIsStarred(Boolean(contact.isStarred));

      setCompanyPhone(contact.companyPhone || '');
      setCompanyFax(contact.companyFax || '');
      setMobileCountryCode(contact.mobileCountryCode || '+82');
      setBirthday(normalizeBirthdayForDateInput(contact.birthday));
      setPostalCode(contact.postalCode || '');
      setAddress(contact.address || '');
      setAddressDetail(contact.addressDetail || '');
      setWebsiteUrl(contact.websiteUrl || '');
    } else {
      setName('');
      setEmail('');
      setPhone('');
      setCompany('');
      setDepartment('');
      setPosition('');
      setGroupId('');
      setMemo('');
      setIsStarred(false);

      setCompanyPhone('');
      setCompanyFax('');
      setMobileCountryCode('+82');
      setBirthday('');
      setPostalCode('');
      setAddress('');
      setAddressDetail('');
      setWebsiteUrl('');
    }
    setIsPostcodeModalOpen(false);
    setError(null);
  }, [contact, isOpen]);

  if (!isOpen) return null;

  const handleAddressSelect = (result: DaumPostcodeResult) => {
    setPostalCode(result.zonecode);
    setAddress(result.address);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }
    if (email.trim() && !email.includes('@')) {
      setError('올바른 이메일 주소를 입력해 주세요.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload: CreateContactDto = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        department: department.trim() || null,
        position: position.trim() || null,
        groupId: groupId || null,
        memo: memo.trim() || null,
        isStarred,
        companyPhone: companyPhone.trim() || null,
        companyFax: companyFax.trim() || null,
        mobileCountryCode: mobileCountryCode.trim() || '+82',
        birthday: birthday.trim() || null,
        postalCode: postalCode.trim() || null,
        address: address.trim() || null,
        addressDetail: addressDetail.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
      };

      if (isEditing && contact) {
        await contactsApi.updateContact(contact.id, payload);
      } else {
        await contactsApi.createContact(payload);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const inlineInputClass =
    'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 focus:outline-none transition';

  const avatarInitial = name.trim() ? name.trim().charAt(0).toUpperCase() : '?';

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[1px] sm:p-4"
        onClick={onClose}
      >
        <div
          className="relative flex w-full max-w-2xl h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[88dvh] flex-col rounded-none sm:rounded-2xl bg-white shadow-2xl border-0 sm:border sm:border-slate-200/80 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header (Fixed) */}
          <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4 sm:px-6 bg-white shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
                <User className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900 truncate">
                {isEditing ? '연락처 수정' : '새 연락처 추가'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Body + Fixed Footer */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto bg-slate-50/70 px-4 py-4 sm:px-6 space-y-4">
              {error && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-medium text-rose-600">
                  {error}
                </div>
              )}

              {/* 상단 프로필 헤더 (아바타 + 이름 + 중요 연락처 토글) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-4 border-b border-slate-200/80">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-[#007AFF]/12 text-[#007AFF] text-base font-bold flex items-center justify-center shrink-0">
                    {avatarInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      이름 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="예: 홍길동"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inlineInputClass}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsStarred(!isStarred)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition self-start sm:self-end ${
                    isStarred
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'bg-white border-slate-200 text-slate-600 active:bg-slate-100'
                  }`}
                >
                  <Star
                    className={`h-3.5 w-3.5 ${
                      isStarred ? 'text-amber-500 fill-amber-500' : 'text-slate-400'
                    }`}
                  />
                  <span>중요 연락처</span>
                </button>
              </div>

              {/* Grouped Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: 연락처 정보 */}
                <div className="rounded-2xl bg-white border border-slate-200/80 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                    연락처 정보
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">이메일</span>
                      <input
                        type="email"
                        placeholder="hong@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">휴대전화</span>
                      <div className="flex gap-1.5 flex-1 min-w-0">
                        <input
                          type="text"
                          placeholder="+82"
                          value={mobileCountryCode}
                          onChange={(e) => setMobileCountryCode(e.target.value)}
                          className="w-14 rounded-xl border border-slate-200 bg-white px-2 py-2 text-base sm:text-sm text-center text-slate-800 focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 focus:outline-none transition shrink-0"
                          title="국가번호"
                        />
                        <input
                          type="tel"
                          placeholder="010-0000-0000"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={inlineInputClass}
                        />
                      </div>
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">회사전화</span>
                      <input
                        type="tel"
                        placeholder="예: 02-1234-5678"
                        value={companyPhone}
                        onChange={(e) => setCompanyPhone(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">팩스</span>
                      <input
                        type="tel"
                        placeholder="예: 02-1234-5679"
                        value={companyFax}
                        onChange={(e) => setCompanyFax(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">웹사이트</span>
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                  </div>
                </div>

                {/* Card 2: 소속 및 기타 정보 */}
                <div className="rounded-2xl bg-white border border-slate-200/80 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                    소속 및 기타 정보
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">회사명</span>
                      <input
                        type="text"
                        placeholder="예: 라인에지"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">부서명</span>
                      <input
                        type="text"
                        placeholder="개발팀"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">직책</span>
                      <input
                        type="text"
                        placeholder="책임연구원"
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">그룹</span>
                      <div className="flex-1 min-w-0">
                        <SelectDropdown
                          options={[
                            { value: '', label: '(그룹 없음 - 미분류)' },
                            ...groups.map((g) => ({ value: g.id, label: g.name })),
                          ]}
                          value={groupId}
                          onChange={setGroupId}
                          size="md"
                          fullWidth
                        />
                      </div>
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-16 shrink-0">생일</span>
                      <input
                        type="date"
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        aria-label="생일"
                        className={`${inlineInputClass} min-h-[42px] sm:min-h-[38px]`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: 주소 */}
              <div className="rounded-2xl bg-white border border-slate-200/80 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                  주소
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-slate-500 text-xs w-16 shrink-0">우편번호</span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="12345"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="w-28 sm:w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 focus:outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setIsPostcodeModalOpen(true)}
                        className="shrink-0 flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-[#007AFF] active:bg-sky-100 transition-colors whitespace-nowrap"
                      >
                        <Search className="h-3.5 w-3.5" />
                        <span>주소 검색</span>
                      </button>
                    </div>
                  </div>
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-slate-500 text-xs w-16 shrink-0">기본 주소</span>
                    <input
                      type="text"
                      placeholder="주소 검색 또는 도로명 주소 입력"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className={inlineInputClass}
                    />
                  </div>
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-slate-500 text-xs w-16 shrink-0">상세 주소</span>
                    <input
                      type="text"
                      placeholder="상세 주소 입력 (동, 호수, 층수 등)"
                      value={addressDetail}
                      onChange={(e) => setAddressDetail(e.target.value)}
                      className={inlineInputClass}
                    />
                  </div>
                </div>
              </div>

              {/* Card 4: 메모 */}
              <div className="rounded-2xl bg-white border border-slate-200/80 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                  메모
                </div>
                <div className="p-3">
                  <textarea
                    rows={2}
                    placeholder="특이사항이나 비고를 입력하세요."
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className={`${inlineInputClass} resize-none`}
                  />
                </div>
              </div>
            </div>

            {/* Footer Actions (Fixed) */}
            <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-700 active:bg-slate-100 transition disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 active:scale-[0.98] transition disabled:opacity-60"
              >
                {loading ? '저장 중...' : isEditing ? '수정 완료' : '등록'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Daum 우편번호 서비스 팝업 모달 */}
      <DaumPostcodeModal
        isOpen={isPostcodeModalOpen}
        onClose={() => setIsPostcodeModalOpen(false)}
        onComplete={handleAddressSelect}
      />
    </>
  );
};
