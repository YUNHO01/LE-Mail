import {
  LoginResponseDto,
  PasskeyCredentialDto,
  WebAuthnLoginOptionsResponseDto,
  WebAuthnRegisterOptionsResponseDto,
} from '@lemail/shared-types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const BIOMETRIC_HINT_EMAIL_KEY = 'lemail_biometric_email';

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext || typeof window.PublicKeyCredential === 'undefined') {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function getDefaultDeviceName(): string {
  if (typeof navigator === 'undefined') return '모바일 기기';
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone (Face ID / Touch ID)';
  if (/iPad/i.test(ua)) return 'iPad (Face ID / Touch ID)';
  if (/Android/i.test(ua)) return 'Android 기기 (생체인식)';
  if (/Macintosh/i.test(ua)) return 'Mac (Touch ID)';
  if (/Windows/i.test(ua)) return 'Windows Hello';
  return '모바일 기기';
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('lemail_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function listBiometricCredentials(): Promise<PasskeyCredentialDto[]> {
  const res = await fetch(`${API_BASE_URL}/api/auth/webauthn/credentials`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(data?.message || '생체인식 목록을 불러오지 못했습니다.');
  }
  return data;
}

export async function deleteBiometricCredential(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/webauthn/credentials/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || '생체인식 등록 해제에 실패했습니다.');
  }
}

export async function registerBiometricCredential(
  deviceName?: string,
  userEmail?: string,
): Promise<PasskeyCredentialDto> {
  const optionsRes = await fetch(`${API_BASE_URL}/api/auth/webauthn/register/options`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  const options: WebAuthnRegisterOptionsResponseDto & { message?: string } = await optionsRes.json();
  if (!optionsRes.ok) {
    throw new Error(options?.message || '생체인식 등록 옵션을 가져오지 못했습니다.');
  }

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToUint8Array(options.challenge) as unknown as BufferSource,
    rp: options.rp,
    user: {
      id: base64UrlToUint8Array(options.user.id) as unknown as BufferSource,
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams as PublicKeyCredentialParameters[],
    timeout: options.timeout,
    attestation: options.attestation,
    authenticatorSelection: options.authenticatorSelection,
    excludeCredentials: options.excludeCredentials.map((cred) => ({
      id: base64UrlToUint8Array(cred.id) as unknown as BufferSource,
      type: cred.type,
    })),
  };

  let credential: Credential | null = null;
  try {
    credential = await navigator.credentials.create({ publicKey });
  } catch (err: any) {
    if (err?.name === 'InvalidStateError') {
      throw new Error('이 기기에는 이미 생체인식 정보가 등록되어 있습니다.');
    }
    if (err?.name === 'NotAllowedError') {
      throw new Error('생체인식 등록이 취소되었거나 시간이 초과되었습니다.');
    }
    throw new Error(err?.message || '기기 생체인식 등록 중 오류가 발생했습니다.');
  }

  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error('생체인식 자격증명을 생성하지 못했습니다.');
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports =
    typeof response.getTransports === 'function' ? response.getTransports() : undefined;

  const verifyRes = await fetch(`${API_BASE_URL}/api/auth/webauthn/register/verify`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      id: credential.id,
      rawId: arrayBufferToBase64Url(credential.rawId),
      deviceName: deviceName || getDefaultDeviceName(),
      response: {
        clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
        attestationObject: arrayBufferToBase64Url(response.attestationObject),
        transports,
      },
    }),
  });

  const saved = await verifyRes.json();
  if (!verifyRes.ok) {
    throw new Error(saved?.message || '생체인식 등록 검증에 실패했습니다.');
  }

  if (typeof window !== 'undefined' && userEmail) {
    localStorage.setItem(BIOMETRIC_HINT_EMAIL_KEY, userEmail);
  }
  return saved;
}

export async function authenticateWithBiometric(email?: string): Promise<LoginResponseDto> {
  const optionsRes = await fetch(`${API_BASE_URL}/api/auth/webauthn/login/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email?.trim() || undefined }),
  });
  const options: WebAuthnLoginOptionsResponseDto & { message?: string } = await optionsRes.json();
  if (!optionsRes.ok) {
    throw new Error(options?.message || '생체인식 로그인 옵션을 가져오지 못했습니다.');
  }

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToUint8Array(options.challenge) as unknown as BufferSource,
    rpId: options.rpId,
    timeout: options.timeout,
    userVerification: options.userVerification,
    allowCredentials: options.allowCredentials.map((cred) => ({
      id: base64UrlToUint8Array(cred.id) as unknown as BufferSource,
      type: cred.type,
      transports: cred.transports as AuthenticatorTransport[] | undefined,
    })),
  };

  let credential: Credential | null = null;
  try {
    credential = await navigator.credentials.get({ publicKey });
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      throw new Error('생체인식 인증이 취소되었거나 등록된 기기 정보가 없습니다.');
    }
    throw new Error(err?.message || '생체인식 인증 중 오류가 발생했습니다.');
  }

  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error('생체인식 인증 응답을 받지 못했습니다.');
  }

  const response = credential.response as AuthenticatorAssertionResponse;
  const verifyRes = await fetch(`${API_BASE_URL}/api/auth/webauthn/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeToken: options.challengeToken,
      id: credential.id,
      rawId: arrayBufferToBase64Url(credential.rawId),
      response: {
        clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
        authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
        signature: arrayBufferToBase64Url(response.signature),
        userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : null,
      },
    }),
  });

  const data = await verifyRes.json();
  if (!verifyRes.ok) {
    throw new Error(data?.message || '생체인식 로그인에 실패했습니다.');
  }
  return data;
}
