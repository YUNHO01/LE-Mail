'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Tag,
  FileText,
  Star,
  ChevronDown,
  ChevronUp,
  Globe,
  MapPin,
  Calendar,
  Printer,
  Plus,
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

  // 추가 항목 아코디언 펼침 여부
  const [showAdditionalFields, setShowAdditionalFields] = useState(false);

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
      setBirthday(contact.birthday || '');
      setPostalCode(contact.postalCode || '');
      setAddress(contact.address || '');
      setAddressDetail(contact.addressDetail || '');
      setWebsiteUrl(contact.websiteUrl || '');

      // 추가 항목 데이터가 있으면 자동으로 펼침
      if (
        contact.companyPhone ||
        contact.companyFax ||
        contact.birthday ||
        contact.postalCode ||
        contact.address ||
        contact.addressDetail ||
        contact.websiteUrl ||
        (contact.mobileCountryCode && contact.mobileCountryCode !== '+82')
      ) {
        setShowAdditionalFields(true);
      } else {
        setShowAdditionalFields(false);
      }
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
      setShowAdditionalFields(false);
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
    'w-full rounded-lg border border-black/[0.12] bg-white px-3 py-1.5 text-[13px] text-[#1d1d1f] placeholder-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 focus:outline-none transition';

  const avatarInitial = name ? name.trim().slice(0, 1).toUpperCase() : 'C';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px] p-4">
        <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-black/[0.08] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-3.5 bg-[#f5f5f7]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0071e3]/12 text-[#0071e3]">
                <User className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-[#1d1d1f]">
                  {isEditing ? '연락처 수정' : '새 연락처 추가'}
                </h3>
                <p className="text-[11px] text-[#86868b]">
                  {isEditing ? '기존 연락처 정보를 변경합니다.' : '새로운 주소록 연락처를 등록합니다.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#86868b] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="max-h-[calc(88vh-4rem)] flex flex-col">
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {error && (
                <div className="rounded-xl bg-[#ff3b30]/10 border border-[#ff3b30]/20 p-3 text-xs text-[#ff3b30]">
                  {error}
                </div>
              )}

              {/* 상단 프로필 헤더 (아바타 + 이름 + 중요 연락처 토글) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
                <div className="flex items-center gap-3.5 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-[#0071e3]/12 text-[#0071e3] text-base font-bold flex items-center justify-center shrink-0">
                    {avatarInitial}
                  </div>
                  <div className="flex-1 max-w-sm">
                    <label className="block text-[11px] font-semibold text-[#6e6e73] mb-1">
                      이름 <span className="text-[#ff3b30]">*</span>
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
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition self-start sm:self-end ${
                    isStarred
                      ? 'bg-[#ff9500]/12 border-[#ff9500]/30 text-[#b25000]'
                      : 'bg-[#f5f5f7] border-black/[0.06] text-[#6e6e73] hover:bg-black/[0.05]'
                  }`}
                >
                  <Star
                    className={`h-3.5 w-3.5 ${
                      isStarred ? 'text-[#ff9500] fill-[#ff9500]' : 'text-[#86868b]'
                    }`}
                  />
                  <span>중요 연락처</span>
                </button>
              </div>

              {/* 2-Column Grouped Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: 연락처 정보 */}
                <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
                  <div className="px-4 py-2.5 bg-black/[0.02] border-b border-black/[0.06] text-[11px] font-semibold text-[#6e6e73]">
                    연락처 정보
                  </div>
                  <div className="divide-y divide-black/[0.05] text-[13px]">
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[#86868b] text-xs w-20 shrink-0">이메일</span>
                      <input
                        type="email"
                        placeholder="hong@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[#86868b] text-xs w-20 shrink-0">휴대전화</span>
                      <div className="flex gap-1.5 flex-1 min-w-0">
                        <input
                          type="text"
                          placeholder="+82"
                          value={mobileCountryCode}
                          onChange={(e) => setMobileCountryCode(e.target.value)}
                          className="w-14 rounded-lg border border-black/[0.12] bg-white px-2 py-1.5 text-[13px] text-center text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 focus:outline-none transition shrink-0"
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
                      <span className="text-[#86868b] text-xs w-20 shrink-0">회사전화</span>
                      <input
                        type="tel"
                        placeholder="예: 02-1234-5678"
                        value={companyPhone}
                        onChange={(e) => setCompanyPhone(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[#86868b] text-xs w-20 shrink-0">팩스</span>
                      <input
                        type="tel"
                        placeholder="예: 02-1234-5679"
                        value={companyFax}
                        onChange={(e) => setCompanyFax(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[#86868b] text-xs w-20 shrink-0">웹사이트</span>
                      <input
                        type="text"
                        placeholder="https://example.com"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                  </div>
                </div>

                {/* Card 2: 소속 및 기타 정보 */}
                <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
                  <div className="px-4 py-2.5 bg-black/[0.02] border-b border-black/[0.06] text-[11px] font-semibold text-[#6e6e73]">
                    소속 및 기타 정보
                  </div>
                  <div className="divide-y divide-black/[0.05] text-[13px]">
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[#86868b] text-xs w-20 shrink-0">회사명</span>
                      <input
                        type="text"
                        placeholder="예: 라인에지"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[#86868b] text-xs w-20 shrink-0">부서명</span>
                      <input
                        type="text"
                        placeholder="개발팀"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[#86868b] text-xs w-20 shrink-0">직책</span>
                      <input
                        type="text"
                        placeholder="책임연구원"
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[#86868b] text-xs w-20 shrink-0">그룹</span>
                      <div className="flex-1 min-w-0">
                        <SelectDropdown
                          options={[
                            { value: '', label: '(그룹 없음 - 미분류)' },
                            ...groups.map((g) => ({ value: g.id, label: g.name })),
                          ]}
                          value={groupId}
                          onChange={setGroupId}
                          size="sm"
                          fullWidth
                        />
                      </div>
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[#86868b] text-xs w-20 shrink-0">생일</span>
                      <input
                        type="text"
                        placeholder="예: 1990-05-20"
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        className={inlineInputClass}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: 주소 */}
              <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
                <div className="px-4 py-2.5 bg-black/[0.02] border-b border-black/[0.06] text-[11px] font-semibold text-[#6e6e73]">
                  주소
                </div>
                <div className="divide-y divide-black/[0.05] text-[13px]">
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-[#86868b] text-xs w-20 shrink-0">우편번호</span>
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        placeholder="12345"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="w-32 rounded-lg border border-black/[0.12] bg-white px-3 py-1.5 text-[13px] text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 focus:outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setIsPostcodeModalOpen(true)}
                        className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[#007aff]/10 px-3 py-1.5 text-xs font-medium text-[#0071e3] hover:bg-[#007aff]/15 transition-colors"
                      >
                        <Search className="h-3.5 w-3.5" />
                        <span>주소 검색</span>
                      </button>
                    </div>
                  </div>
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-[#86868b] text-xs w-20 shrink-0">기본 주소</span>
                    <input
                      type="text"
                      placeholder="주소 검색으로 입력하거나 도로명 주소를 직접 입력하세요"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className={inlineInputClass}
                    />
                  </div>
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-[#86868b] text-xs w-20 shrink-0">상세 주소</span>
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
              <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
                <div className="px-4 py-2.5 bg-black/[0.02] border-b border-black/[0.06] text-[11px] font-semibold text-[#6e6e73]">
                  메모
                </div>
                <div className="p-3">
                  <textarea
                    rows={2}
                    placeholder="특이사항이나 비고를 입력하세요."
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="w-full rounded-lg border border-black/[0.12] bg-white p-3 text-[13px] text-[#1d1d1f] placeholder-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 focus:outline-none resize-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2 px-6 py-3.5 bg-[#f5f5f7]/70 border-t border-black/[0.08]">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-lg px-3.5 py-2 text-xs font-medium text-[#6e6e73] hover:bg-black/[0.05] hover:text-[#1d1d1f] transition"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-[#0071e3] px-5 py-2 text-xs font-medium text-white hover:bg-[#0077ed] shadow-xs transition active:scale-[0.98] disabled:opacity-60"
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
