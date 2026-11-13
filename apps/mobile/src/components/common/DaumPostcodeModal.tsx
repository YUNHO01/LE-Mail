'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, X, Loader2, AlertCircle } from 'lucide-react';
import type { DaumPostcodeData } from '@/types/daum-postcode';

export interface DaumPostcodeResult {
  address: string;
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName: string;
  bname: string;
  raw: DaumPostcodeData;
}

export interface DaumPostcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (result: DaumPostcodeResult) => void;
}

const DAUM_POSTCODE_SCRIPT_URL =
  'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

let scriptPromise: Promise<void> | null = null;

function loadDaumPostcodeScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window not defined'));
  }

  if (window.daum?.Postcode) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('daum-postcode-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Daum Postcode script load failed')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'daum-postcode-script';
    script.src = DAUM_POSTCODE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Daum 우편번호 서비스 스크립트 로드에 실패했습니다.'));
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export function DaumPostcodeModal({
  isOpen,
  onClose,
  onComplete,
}: DaumPostcodeModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const initPostcode = useCallback(() => {
    if (!containerRef.current || !window.daum?.Postcode) return;

    containerRef.current.innerHTML = '';

    new window.daum.Postcode({
      oncomplete: (data: DaumPostcodeData) => {
        let fullAddress = data.roadAddress || data.address;
        let extraAddress = '';

        if (data.bname !== '') {
          extraAddress += data.bname;
        }
        if (data.buildingName !== '') {
          extraAddress += extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName;
        }
        if (extraAddress !== '') {
          fullAddress += ` (${extraAddress})`;
        }

        onComplete({
          address: fullAddress,
          zonecode: data.zonecode,
          roadAddress: data.roadAddress,
          jibunAddress: data.jibunAddress,
          buildingName: data.buildingName,
          bname: data.bname,
          raw: data,
        });
        onClose();
      },
      width: '100%',
      height: '100%',
      animation: true,
      focusInput: true,
      autoMapping: true,
    }).embed(containerRef.current, {
      autoClose: false,
    });
  }, [onComplete, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setHasError(false);

    loadDaumPostcodeScript()
      .then(() => {
        if (isMounted) {
          setIsLoading(false);
          setTimeout(() => {
            if (isMounted) {
              initPostcode();
            }
          }, 50);
        }
      })
      .catch((err) => {
        console.error('Daum Postcode 로드 에러:', err);
        if (isMounted) {
          setIsLoading(false);
          setHasError(true);
        }
      });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, initPostcode, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 text-sm">주소 검색</h3>
              <span className="text-[11px] font-medium text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">
                Daum 우편번호 서비스
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="relative w-full h-[470px] bg-white">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white z-10 text-slate-500">
              <Loader2 className="w-7 h-7 text-sky-600 animate-spin" />
              <p className="text-xs">우편번호 서비스를 불러오는 중입니다...</p>
            </div>
          )}

          {hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-white z-10">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 mb-1">
                  우편번호 서비스를 불러올 수 없습니다
                </p>
                <p className="text-xs text-slate-500">
                  인터넷 연결 상태를 확인하시거나 잠시 후 다시 시도해 주세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHasError(false);
                  setIsLoading(true);
                  loadDaumPostcodeScript()
                    .then(() => {
                      setIsLoading(false);
                      setTimeout(initPostcode, 50);
                    })
                    .catch(() => {
                      setIsLoading(false);
                      setHasError(true);
                    });
                }}
                className="rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 px-3 py-1.5 mt-2 transition"
              >
                다시 시도
              </button>
            </div>
          )}

          {/* Daum Postcode Iframe Container */}
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
