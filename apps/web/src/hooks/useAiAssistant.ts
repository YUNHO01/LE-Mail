'use client';

import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { AiPolicyDto, UserAiSettingsDto } from '@lemail/shared-types';

export interface AiAvailability {
  loaded: boolean;
  canUseAi: boolean;
  canAnalyzeImage: boolean;
  autoSummarizeOnRead: boolean;
}

export function useAiAssistant(): AiAvailability {
  const [state, setState] = useState<AiAvailability>({
    loaded: false,
    canUseAi: false,
    canAnalyzeImage: false,
    autoSummarizeOnRead: false,
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchApi<AiPolicyDto>('/ai/policy'),
      fetchApi<UserAiSettingsDto>('/ai/settings'),
    ])
      .then(([policy, settings]) => {
        if (!active) return;
        const allowed = Boolean(policy?.personalExternalAiEnabled);
        const enabled = Boolean(settings?.isEnabled);
        setState({
          loaded: true,
          canUseAi: allowed && enabled,
          canAnalyzeImage:
            allowed && enabled && Boolean(policy?.imageAnalysisEnabled),
          autoSummarizeOnRead:
            allowed && enabled && Boolean(settings?.autoSummarizeOnRead),
        });
      })
      .catch(() => {
        if (!active) return;
        setState({
          loaded: true,
          canUseAi: false,
          canAnalyzeImage: false,
          autoSummarizeOnRead: false,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
