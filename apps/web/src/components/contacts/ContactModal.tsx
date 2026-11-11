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
  Eye,
} from 'lucide-react';
import { contactsApi } from '@/lib/api';
import { ContactDto, ContactGroupDto, CreateContactDto } from '@lemail/shared-types';

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
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // 추가 항목 아코디언 펼침 여부
  const [showAdditionalFields, setShowAdditionalFields] = useState(false);

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
      setWebsiteUrl(contact.websiteUrl || '');
      setIsPublic(Boolean(contact.isPublic));

      // 추가 항목 데이터가 있으면 자동으로 펼침
      if (
        contact.companyPhone ||
        contact.companyFax ||
        contact.birthday ||
        contact.postalCode ||
        contact.address ||
        contact.websiteUrl ||
        contact.isPublic ||
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
      setWebsiteUrl('');
      setIsPublic(false);
      setShowAdditionalFields(false);
    }
    setError(null);
  }, [contact, isOpen]);

  if (!isOpen) return null;

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
        websiteUrl: websiteUrl.trim() || null,
        isPublic,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {isEditing ? '연락처 수정' : '새 연락처 추가'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEditing ? '기존 연락처 정보를 변경합니다.' : '새로운 주소록 연락처를 등록합니다.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-8rem)] overflow-y-auto">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-600">
              {error}
            </div>
          )}

          {/* 기본 정보 구역 */}
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* 이름 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 홍길동"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-3 pr-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                />
              </div>

              {/* 이메일 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  이메일
                </label>
                <input
                  type="email"
                  placeholder="hong@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-3 pr-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* 휴대전화번호 (국가번호 포함) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  휴대전화번호
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="+82"
                    value={mobileCountryCode}
                    onChange={(e) => setMobileCountryCode(e.target.value)}
                    className="w-16 rounded-lg border border-slate-200 px-2 py-2 text-sm text-center text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                    title="국가번호"
                  />
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                  />
                </div>
              </div>

              {/* 그룹 선택 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">그룹 분류</label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none bg-white"
                >
                  <option value="">(그룹 없음 - 미분류)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* 회사 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">회사명</label>
                <input
                  type="text"
                  placeholder="예: 라인에지"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                />
              </div>

              {/* 부서 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">부서</label>
                <input
                  type="text"
                  placeholder="개발팀"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                />
              </div>

              {/* 직책 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">직책</label>
                <input
                  type="text"
                  placeholder="책임연구원"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 추가 항목 (엑셀 양식 연동) 토글 아코디언 */}
          <div className="pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAdditionalFields(!showAdditionalFields)}
              className="flex items-center justify-between w-full py-2 text-xs font-bold text-slate-700 hover:text-sky-600 transition group"
            >
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 group-hover:bg-sky-100 text-slate-500 group-hover:text-sky-600 text-[11px]">
                  {showAdditionalFields ? <ChevronUp className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </span>
                <span>추가 항목 등록 (회사 유선/팩스, 주소, 생일, 웹사이트 등)</span>
              </div>
              <span className="text-[11px] text-slate-400 font-normal">
                {showAdditionalFields ? '접기' : '엑셀 양식 항목 펼치기'}
              </span>
            </button>

            {showAdditionalFields && (
              <div className="mt-2.5 p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3.5 animate-in fade-in duration-150">
                {/* 회사 유선 연락처 & 팩스 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span>회사 전화번호</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="예: 02-1234-5678"
                      value={companyPhone}
                      onChange={(e) => setCompanyPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1">
                      <Printer className="h-3.5 w-3.5 text-slate-400" />
                      <span>회사 팩스번호</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="예: 02-1234-5679"
                      value={companyFax}
                      onChange={(e) => setCompanyFax(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 생일 & 웹사이트 URL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>생일 / 생년월일</span>
                    </label>
                    <input
                      type="text"
                      placeholder="예: 1990-05-20"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1">
                      <Globe className="h-3.5 w-3.5 text-slate-400" />
                      <span>웹사이트 / URL</span>
                    </label>
                    <input
                      type="text"
                      placeholder="https://example.com"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 우편번호 & 주소 */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                  <div className="sm:col-span-1">
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1">
                      <span>우편번호</span>
                    </label>
                    <input
                      type="text"
                      placeholder="12345"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>주소</span>
                    </label>
                    <input
                      type="text"
                      placeholder="도로명 주소 또는 상세 주소"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 공개 여부 (1 / 0) */}
                <div className="pt-1 flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-slate-500" />
                    <div>
                      <div className="text-xs font-semibold text-slate-800">공개 여부</div>
                      <div className="text-[11px] text-slate-400">사내 또는 그룹 구성원에게 연락처를 공개합니다.</div>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">메모</label>
            <textarea
              rows={2}
              placeholder="특이사항이나 비고를 입력하세요."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none resize-none"
            />
          </div>

          {/* 중요 연락처 체크 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsStarred(!isStarred)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                isStarred
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Star
                className={`h-4 w-4 ${
                  isStarred ? 'text-amber-500 fill-amber-500' : 'text-slate-400'
                }`}
              />
              <span>중요 연락처로 지정</span>
            </button>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white hover:bg-sky-500 shadow-md shadow-sky-600/20 transition active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? '저장 중...' : isEditing ? '수정 완료' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
