'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface LightboxImageItem {
  src: string;
  alt?: string;
}

interface ImageLightboxModalProps {
  isOpen: boolean;
  images: LightboxImageItem[];
  initialIndex?: number;
  onClose: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

/**
 * 메일 본문 이미지를 전체 화면 오버레이로 확대/축소 및 탐색할 수 있는 라이트박스 모달입니다.
 */
export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const safeIndex = Math.max(
      0,
      Math.min(initialIndex, Math.max(0, images.length - 1)),
    );
    setCurrentIndex(safeIndex);
    setZoom(null);
    setNaturalSize(null);
  }, [isOpen, initialIndex, images.length]);

  const hasMultiple = images.length > 1;

  const handlePrev = useCallback(() => {
    if (!hasMultiple) return;
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    setZoom(null);
    setNaturalSize(null);
  }, [hasMultiple, images.length]);

  const handleNext = useCallback(() => {
    if (!hasMultiple) return;
    setCurrentIndex((prev) => (prev + 1) % images.length);
    setZoom(null);
    setNaturalSize(null);
  }, [hasMultiple, images.length]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      const base = prev ?? 1;
      return Math.min(MAX_ZOOM, Number((base + ZOOM_STEP).toFixed(2)));
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const base = prev ?? 1;
      return Math.max(MIN_ZOOM, Number((base - ZOOM_STEP).toFixed(2)));
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(null);
  }, []);

  const handleToggleDoubleClick = useCallback(() => {
    setZoom((prev) => {
      if (prev !== null) return null;
      if (
        naturalSize &&
        typeof window !== 'undefined' &&
        naturalSize.width > window.innerWidth * 0.9
      ) {
        return 1;
      }
      return 2;
    });
  }, [naturalSize]);

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isOpen,
    onClose,
    handlePrev,
    handleNext,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
  ]);

  if (!mounted || !isOpen || images.length === 0) {
    return null;
  }

  const currentImage = images[currentIndex] || images[0];
  const zoomLabel = zoom === null ? '맞춤' : `${Math.round(zoom * 100)}%`;

  const zoomedStyle: React.CSSProperties | undefined =
    zoom === null
      ? undefined
      : naturalSize
        ? {
            width: `${Math.max(40, Math.round(naturalSize.width * zoom))}px`,
            height: 'auto',
          }
        : { transform: `scale(${zoom})`, transformOrigin: 'center center' };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={currentImage.alt || '이미지 크게 보기'}
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* 상단 툴바 */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-white bg-gradient-to-b from-black/60 to-transparent shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasMultiple && (
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium tabular-nums">
              {currentIndex + 1} / {images.length}
            </span>
          )}
          {currentImage.alt && (
            <span className="truncate text-xs text-white/80 max-w-[40vw]">
              {currentImage.alt}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-full bg-white/15 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom !== null && zoom <= MIN_ZOOM}
              aria-label="축소"
              title="축소 (-)"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15 disabled:opacity-40 disabled:pointer-events-none transition"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              aria-label="화면 맞춤"
              title="화면 맞춤 (0)"
              className="inline-flex h-8 min-w-[3.25rem] items-center justify-center rounded-full px-2 text-xs font-medium text-white/95 hover:bg-white/15 tabular-nums transition"
            >
              {zoomLabel}
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom !== null && zoom >= MAX_ZOOM}
              aria-label="확대"
              title="확대 (+)"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15 disabled:opacity-40 disabled:pointer-events-none transition"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            {zoom !== null && (
              <button
                type="button"
                onClick={handleResetZoom}
                aria-label="배율 초기화"
                title="배율 초기화"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            title="닫기 (ESC)"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 중앙 이미지 영역 */}
      <div className="relative flex-1 min-h-0 overflow-auto">
        <div
          className="min-h-full min-w-full flex items-center justify-center p-4 sm:p-8"
          onClick={onClose}
        >
          <img
            src={currentImage.src}
            alt={currentImage.alt || '메일 본문 이미지'}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleToggleDoubleClick();
            }}
            onLoad={(e) => {
              const target = e.currentTarget;
              if (target.naturalWidth > 0 && target.naturalHeight > 0) {
                setNaturalSize({
                  width: target.naturalWidth,
                  height: target.naturalHeight,
                });
              }
            }}
            style={zoomedStyle}
            className={
              zoom === null
                ? 'max-w-[92vw] max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl select-none cursor-zoom-in'
                : 'max-w-none max-h-none rounded-lg shadow-2xl select-none cursor-zoom-out'
            }
          />
        </div>

        {/* 다중 이미지 좌/우 탐색 버튼 */}
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              aria-label="이전 이미지"
              title="이전 이미지 (←)"
              className="fixed left-3 sm:left-5 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/75 border border-white/15 backdrop-blur-md transition"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              aria-label="다음 이미지"
              title="다음 이미지 (→)"
              className="fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/75 border border-white/15 backdrop-blur-md transition"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
