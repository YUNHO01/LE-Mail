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
  { label: string; defaultModel: string; hint: string; keyUrl?: string; keyLabel?: string }
> = {
  [AiProvider.OPENAI]: {
    label: 'OpenAI (ChatGPT)',
    defaultModel: 'gpt-4o-mini',
    hint: 'gpt-4o-mini, gpt-4o 등',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyLabel: 'OpenAI API Key 발급 페이지',
  },
  [AiProvider.GEMINI]: {
    label: 'Google Gemini',
    defaultModel: 'gemini-3.5-flash-lite',
    hint: 'gemini-3.5-flash-lite, gemini-3.1-flash-lite (무료 일 500회)',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyLabel: 'Google AI Studio API Key 발급',
  },
  [AiProvider.ANTHROPIC]: {
    label: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-latest',
    hint: 'claude-3-5-sonnet-latest, claude-3-5-haiku-latest 등',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyLabel: 'Anthropic Console API Key 발급',
  },
  [AiProvider.CUSTOM]: {
    label: 'Custom (OpenAI 호환 URL)',
    defaultModel: 'llama3.1',
    hint: '사내 Ollama, vLLM 등 OpenAI 호환 엔드포인트',
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
  const [responseTone, setResponseTone] = useState<AiResponseTone>(
    AiResponseTone.PROFESSIONAL,
  );
  const [preferredLanguage, setPreferredLanguage] = useState('ko');
  const [autoSummarizeOnRead, setAutoSummarizeOnRead] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

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
        setFeedback({
          type: 'error',
          message: `AI 설정을 불러오지 못했습니다: ${e.message}`,
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleProviderChange = (nextProvider: AiProvider) => {
    setProvider(nextProvider);
    if (!model || Object.values(PROVIDER_META).some((m) => m.defaultModel === model)) {
      setModel(PROVIDER_META[nextProvider].defaultModel);
    }
  };

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
        message: res.success
          ? `${res.message}${res.latencyMs ? ` (${res.latencyMs}ms)` : ''}`
          : res.message,
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
        message: clearKey
          ? '저장된 API Key를 삭제하고 AI 기능을 비활성화했습니다.'
          : '개인 AI 설정이 안전하게 암호화되어 저장되었습니다.',
      });
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-xs text-slate-400">
        AI 설정을 불러오는 중입니다...
      </div>
    );
  }

  if (policy && !policy.personalExternalAiEnabled) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">관리자 정책에 의해 개인 외부 AI 사용이 비활성화되어 있습니다.</p>
          <p className="mt-1 text-xs text-amber-700">
            시스템 관리자가 관리자 환경설정(Step 6: AI 지원)에서 허용하면 개인 API Key를 연동할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  const allowedProviders = policy?.allowedProviders || Object.values(AiProvider);

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">개인용 외부 AI 연동</h3>
            <p className="text-xs text-slate-500">
              입력한 API Key는 서버에서 AES-256-GCM으로 암호화되어 저장되며, 메일·주소록·일정 보조 기능에 활용됩니다.
            </p>
          </div>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-violet-600 relative transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          <span className="text-xs font-semibold text-slate-700">
            {isEnabled ? '사용 중' : '비활성'}
          </span>
        </label>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
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

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            AI 제공자 (Provider)
          </label>
          <SelectDropdown
            fullWidth
            size="md"
            value={provider}
            onChange={(val) => handleProviderChange(val as AiProvider)}
            options={allowedProviders.map((p) => ({
              value: p,
              label: PROVIDER_META[p]?.label || p,
            }))}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            모델명 (Model)
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={PROVIDER_META[provider]?.defaultModel}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            예: {PROVIDER_META[provider]?.hint}
          </p>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-violet-600" />
              API Key
            </span>
            <div className="flex items-center gap-3">
              {PROVIDER_META[provider]?.keyUrl && (
                <a
                  href={PROVIDER_META[provider].keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 hover:underline"
                >
                  <span>{PROVIDER_META[provider].keyLabel}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {hasApiKey && maskedApiKey && (
                <span className="font-mono text-[11px] text-emerald-600">
                  등록됨 ({maskedApiKey})
                </span>
              )}
            </div>
          </label>
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  hasApiKey
                    ? '변경할 경우에만 새 API Key를 입력하세요'
                    : '발급받은 API Key를 입력하세요'
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-10 text-sm text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
              연결 테스트
            </button>
          </div>
        </div>

        {provider === AiProvider.CUSTOM && (
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              Custom Base URL (OpenAI 호환 엔드포인트)
            </label>
            <input
              type="url"
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:bg-white focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            기본 메일 작성 어조
          </label>
          <SelectDropdown
            fullWidth
            size="md"
            value={responseTone}
            onChange={(val) => setResponseTone(val as AiResponseTone)}
            options={[
              { value: AiResponseTone.PROFESSIONAL, label: '비즈니스 / 정중한 어조' },
              { value: AiResponseTone.FRIENDLY, label: '친근하고 부드러운 어조' },
              { value: AiResponseTone.CONCISE, label: '핵심 위주 간결한 어조' },
            ]}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            기본 AI 응답 언어
          </label>
          <SelectDropdown
            fullWidth
            size="md"
            value={preferredLanguage}
            onChange={(val) => setPreferredLanguage(val)}
            options={[
              { value: 'ko', label: '한국어 (ko)' },
              { value: 'en', label: 'English (en)' },
              { value: 'ja', label: '日本語 (ja)' },
            ]}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
        <div>
          <p className="text-xs font-semibold text-slate-800">
            메일 읽기 시 AI 자동 요약
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            메일을 열면 상단에 핵심 요약과 할 일을 자동으로 표시합니다. (답신/이전 원본 인용 내용은 제외되며, 한 번 요약된 메일은 DB에 저장되어 재요청하지 않습니다.)
          </p>
        </div>

        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoSummarizeOnRead}
            disabled={!isEnabled}
            onChange={(e) => setAutoSummarizeOnRead(e.target.checked)}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-slate-200 peer-disabled:opacity-50 peer-checked:bg-violet-600 relative transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          <span className="text-xs font-semibold text-slate-700 w-9">
            {autoSummarizeOnRead ? 'ON' : 'OFF'}
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
        안내: 메일 요약, 답장 초안, 서명 연락처 추출, 일정 등록 등 AI 기능을 사용할 때(자동 요약 활성화 시 메일 열람 시점 포함) 해당 본문 텍스트가 선택한 외부 AI 서버로 전송됩니다. (첨부파일은 전송되지 않습니다.)
      </div>

      <div className="flex items-center justify-between pt-2">
        {hasApiKey ? (
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            저장된 API Key 삭제
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? '저장 중...' : 'AI 설정 저장'}</span>
        </button>
      </div>
    </div>
  );
}
