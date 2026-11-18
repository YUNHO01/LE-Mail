import { MailFolderDto } from '@lemail/shared-types';
import { fetchApi } from '@/lib/api';

const CACHE_TTL_MS = 5000;

let cachedFolders: MailFolderDto[] | null = null;
let cachedAt = 0;
let inFlight: Promise<MailFolderDto[]> | null = null;
let listenerAttached = false;

export function invalidateMailFoldersCache() {
  cachedFolders = null;
  cachedAt = 0;
}

function ensureRefreshListener() {
  if (listenerAttached || typeof window === 'undefined') return;
  window.addEventListener('mail:refresh-folders', invalidateMailFoldersCache);
  listenerAttached = true;
}

/**
 * 여러 컴포넌트에서 동시에 /mail-folders를 호출할 때 요청을 1회로 병합(deduplication)하고
 * 짧은 TTL 캐시를 제공합니다.
 */
export async function fetchMailFoldersCached(forceRefresh = false): Promise<MailFolderDto[]> {
  ensureRefreshListener();

  const now = Date.now();
  if (!forceRefresh && cachedFolders && now - cachedAt < CACHE_TTL_MS) {
    return cachedFolders;
  }

  if (!forceRefresh && inFlight) {
    return inFlight;
  }

  inFlight = fetchApi<MailFolderDto[]>('/mail-folders')
    .then((res) => {
      const list = res || [];
      cachedFolders = list;
      cachedAt = Date.now();
      return list;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
