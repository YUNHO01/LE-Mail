'use client';

import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  KeyRound,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  Trash2,
  ShieldAlert,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { SelectDropdown } from '@/components/common';
import {
  AiPolicyDto,
  AiProvider,
  AiResponseTone,
  TestAiConnectionResultDto,
  UserAiSettingsDto,
} from '@lemail/shared-types';

const PROVIDER_META: Record<
  AiProvider,
  { label: string; defaultModel: string; keyUrl?: string; keyLabel?: string }
> = {
  [AiProvider.OPENAI]: {
    label: 'OpenAI (ChatGPT)',
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyLabel: 'OpenAI 키 발급',
  },
  [AiProvider.GEMINI]: {
    label: 'Google Gemini',
    defaultModel: 'gemini-3.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyLabel: 'Google AI Studio 키 발급',
  },
  [AiProvider.ANTHROPIC]: {
    label: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-latest',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyLabel: 'Anthropic 키 발급',
  },
  [AiProvider.CUSTOM]: {
    label: 'Custom (OpenAI 호환)',
    defaultModel: 'llama3.1',
  },
};

export function AiSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [policy, setPolicy] = useState<AiPolicyDto | null>(null);

  const [isEnabled, setIsEnabled] = useState(false);
  const [provider, setProvider] = useState<AiProvider>(AiProvider.OPENAI);
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [responseTone, setResponseTone] = useState<AiResponseTone>(AiResponseTone.PROFESSIONAL);
  const [preferredLanguage, setPreferredLanguage] = useState('ko');
  const [autoSummarizeOnRead, setAutoSummarizeOnRead] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [pol, userSet] = await Promise.all([
          fetchApi<AiPolicyDto>('/ai/policy'),
          fetchApi<UserAiSettingsDto>('/ai/settings'),
        ]);
        setPolicy(pol);
        setIsEnabled(userSet.isEnabled);
        const effectiveProvider =
          pol.allowedProviders.length > 0 && !pol.allowedProviders.includes(userSet.provider)
            ? pol.allowedProviders[0]
            : userSet.provider;
        setProvider(effectiveProvider);
        setModel(
          effectiveProvider !== userSet.provider
            ? PROVIDER_META[effectiveProvider].defaultModel
            : userSet.model || PROVIDER_META[effectiveProvider].defaultModel,
        );
        setHasApiKey(userSet.hasApiKey);
        setMaskedApiKey(userSet.maskedApiKey);
        setCustomBaseUrl(userSet.customBaseUrl || '');
        setResponseTone(userSet.responseTone || AiResponseTone.PROFESSIONAL);
        setPreferredLanguage(userSet.preferredLanguage || 'ko');
        setAutoSummarizeOnRead(Boolean(userSet.autoSummarizeOnRead));
      } catch (e: any) {
        setFeedback({ type: 'error', message: e.message });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleTest = async () => {
    try {
      setTesting(true);
      setFeedback(null);
      const res = await fetchApi<TestAiConnectionResultDto>('/ai/settings/test', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          model,
          apiKey: apiKeyInput || undefined,
          customBaseUrl: provider === AiProvider.CUSTOM ? customBaseUrl : undefined,
        }),
      });
      setFeedback({
        type: res.success ? 'success' : 'error',
        message: res.message,
      });
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (clearKey = false) => {
    try {
      setSaving(true);
      setFeedback(null);
      const updated = await fetchApi<UserAiSettingsDto>('/ai/settings', {
        method: 'PUT',
        body: JSON.stringify({
          isEnabled: clearKey ? false : isEnabled,
          provider,
          model,
          apiKey: apiKeyInput.trim() || undefined,
          clearApiKey: clearKey,
          customBaseUrl: provider === AiProvider.CUSTOM ? customBaseUrl.trim() || null : null,
          responseTone,
          preferredLanguage,
          autoSummarizeOnRead: clearKey ? false : autoSummarizeOnRead,
        }),
      });
      setIsEnabled(updated.isEnabled);
      setHasApiKey(updated.hasApiKey);
      setMaskedApiKey(updated.maskedApiKey);
      setAutoSummarizeOnRead(Boolean(updated.autoSummarizeOnRead));
      setApiKeyInput('');
      setFeedback({
        type: 'success',
        message: clearKey ? 'API Key가 삭제되었습니다.' : 'AI 설정이 저장되었습니다.',
      });
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="py-8 text-center text-xs text-slate-400">불러오는 중...</p>;
  }

  if (policy && !policy.personalExternalAiEnabled) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-4 text-xs text-amber-800">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <span>관리자 정책에 의해 개인 외부 AI 사용이 비활성화되어 있습니다.</span>
      </div>
    );
  }

  const allowedProviders = policy?.allowedProviders || Object.values(AiProvider);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-bold text-slate-900">개인 AI 활성화</span>
        </div>
        <label className="relative inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-violet-600 relative transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          <span className="text-xs font-semibold text-slate-700">
            {isEnabled ? '사용 중' : '비활성'}
          </span>
        </label>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">제공자</label>
          <SelectDropdown
            fullWidth
            size="md"
            value={provider}
            onChange={(val) => {
              const p = val as AiProvider;
              setProvider(p);
              setModel(PROVIDER_META[p].defaultModel);
            }}
            options={allowedProviders.map((p) => ({
              value: p,
              label: PROVIDER_META[p]?.label || p,
            }))}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">모델명</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 flex flex-wrap items-center justify-between gap-1 text-xs font-semibold text-slate-600">
            <span className="flex items-center gap-1">
              <KeyRound className="h-3.5 w-3.5 text-violet-600" />
              API Key
            </span>
            <div className="flex items-center gap-2">
              {PROVIDER_META[provider]?.keyUrl && (
                <a
                  href={PROVIDER_META[provider].keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:underline"
                >
                  <span>{PROVIDER_META[provider].keyLabel}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {hasApiKey && maskedApiKey && (
                <span className="font-mono text-[11px] text-emerald-600">{maskedApiKey}</span>
              )}
            </div>
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={hasApiKey ? '변경 시에만 새 키 입력' : 'API Key 입력'}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-3 top-2.5 text-slate-400"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {provider === AiProvider.CUSTOM && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Custom Base URL
            </label>
            <input
              type="url"
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">어조</label>
            <SelectDropdown
              fullWidth
              size="sm"
              value={responseTone}
              onChange={(val) => setResponseTone(val as AiResponseTone)}
              options={[
                { value: AiResponseTone.PROFESSIONAL, label: '비즈니스' },
                { value: AiResponseTone.FRIENDLY, label: '친근함' },
                { value: AiResponseTone.CONCISE, label: '간결함' },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">언어</label>
            <SelectDropdown
              fullWidth
              size="sm"
              value={preferredLanguage}
              onChange={(val) => setPreferredLanguage(val)}
              options={[
                { value: 'ko', label: '한국어' },
                { value: 'en', label: 'English' },
                { value: 'ja', label: '日本語' },
              ]}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
          <div>
            <p className="text-xs font-semibold text-slate-800">
              메일 읽기 시 AI 자동 요약
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              메일 열람 시 상단에 요약을 자동 표시합니다. (답신/이전 원본 제외, DB 캐시 재사용)
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={autoSummarizeOnRead}
              disabled={!isEnabled}
              onChange={(e) => setAutoSummarizeOnRead(e.target.checked)}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-slate-200 peer-disabled:opacity-50 peer-checked:bg-violet-600 relative transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
            <span className="text-xs font-semibold text-slate-700 w-8">
              {autoSummarizeOnRead ? 'ON' : 'OFF'}
            </span>
          </label>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
          연결 테스트
        </button>
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2.5 text-xs font-semibold text-white"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {hasApiKey && (
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2 text-xs font-semibold text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
          저장된 API Key 삭제
        </button>
      )}
    </div>
  );
}
