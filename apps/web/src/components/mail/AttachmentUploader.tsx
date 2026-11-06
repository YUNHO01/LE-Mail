'use client';

import React, { useRef, useState, DragEvent } from 'react';
import { Paperclip, X, File, AlertCircle } from 'lucide-react';

export interface LocalAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentBase64: string;
}

interface AttachmentUploaderProps {
  attachments: LocalAttachment[];
  onChange: (attachments: LocalAttachment[]) => void;
  maxSizeBytes?: number; // 기본 25MB
}

export const AttachmentUploader: React.FC<AttachmentUploaderProps> = ({
  attachments,
  onChange,
  maxSizeBytes = 25 * 1024 * 1024,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const processFiles = async (files: FileList | File[]) => {
    setError(null);
    const newAttachments: LocalAttachment[] = [];
    let currentTotalSize = attachments.reduce((acc, a) => acc + a.sizeBytes, 0);

    for (const file of Array.from(files)) {
      if (currentTotalSize + file.size > maxSizeBytes) {
        setError(`총 첨부 용량이 최대 한도(${formatSize(maxSizeBytes)})를 초과했습니다.`);
        break;
      }

      currentTotalSize += file.size;

      try {
        const base64 = await fileToBase64(file);
        newAttachments.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          contentBase64: base64,
        });
      } catch (err) {
        setError(`파일 처리 실패: ${file.name}`);
      }
    }

    if (newAttachments.length > 0) {
      onChange([...attachments, ...newAttachments]);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // data:image/png;base64,.... 에서 앞부분 제외하고 순수 base64만 추출
          const base64Data = reader.result.split(',')[1] || '';
          resolve(base64Data);
        } else {
          reject(new Error('Failed to read file as base64 string'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    onChange(attachments.filter((a) => a.id !== id));
  };

  const totalBytes = attachments.reduce((acc, a) => acc + a.sizeBytes, 0);

  return (
    <div className="space-y-3">
      {/* Upload trigger button & Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center justify-between rounded-xl border border-dashed px-4 py-3 transition-colors ${
          isDragging
            ? 'border-sky-500 bg-sky-50 text-sky-700'
            : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50 text-slate-600'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <Paperclip className="h-3.5 w-3.5 text-slate-500" />
            <span>파일 첨부</span>
          </button>
          <span className="text-xs text-slate-400 hidden sm:inline">
            또는 여기에 파일을 끌어다 놓으세요 (최대 {formatSize(maxSizeBytes)})
          </span>
        </div>

        {attachments.length > 0 && (
          <div className="text-xs text-slate-500 font-medium">
            <span>{attachments.length}개 파일</span>
            <span className="ml-1 text-slate-400">({formatSize(totalBytes)})</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {error && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 bg-rose-50 rounded-lg">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Attachment List */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-2 shadow-xs text-xs text-slate-700 hover:border-slate-300 transition"
            >
              <File className="h-3.5 w-3.5 text-sky-600 shrink-0" />
              <span className="max-w-[180px] truncate font-medium" title={att.filename}>
                {att.filename}
              </span>
              <span className="text-slate-400 text-[11px]">({formatSize(att.sizeBytes)})</span>
              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition"
                title="첨부 취소"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
