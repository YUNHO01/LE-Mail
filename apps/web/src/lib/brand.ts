import { DEFAULT_BRAND_NAME, formatBrandName, SystemLicenseInfo } from '@lemail/shared-types';

/**
 * SSR(generateMetadata, manifest)에서 현재 활성 라이선스 기반 브랜드명을 조회합니다.
 * API 서버 미응답 또는 라이선스 미등록 시 기본값('가장자리 LEMail')을 반환합니다.
 */
export async function getServerBrandName(): Promise<string> {
  const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:9200';
  try {
    const res = await fetch(`${apiUrl}/api/admin/license/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return DEFAULT_BRAND_NAME;
    const data: SystemLicenseInfo = await res.json();
    return formatBrandName(data);
  } catch {
    return DEFAULT_BRAND_NAME;
  }
}
