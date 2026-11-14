import * as crypto from 'crypto';

export function base64UrlToBuffer(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function sha256(data: Buffer | string): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

/**
 * Minimal RFC 8949 CBOR decoder for WebAuthn attestationObject and COSE_Key maps.
 */
export function decodeCbor(buffer: Buffer): any {
  let offset = 0;

  function readUint(additionalInfo: number): number {
    if (additionalInfo < 24) return additionalInfo;
    if (additionalInfo === 24) {
      const v = buffer.readUInt8(offset);
      offset += 1;
      return v;
    }
    if (additionalInfo === 25) {
      const v = buffer.readUInt16BE(offset);
      offset += 2;
      return v;
    }
    if (additionalInfo === 26) {
      const v = buffer.readUInt32BE(offset);
      offset += 4;
      return v;
    }
    if (additionalInfo === 27) {
      const v = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
      return v;
    }
    throw new Error(`Unsupported CBOR integer info: ${additionalInfo}`);
  }

  function decodeItem(): any {
    if (offset >= buffer.length) {
      throw new Error('Unexpected end of CBOR buffer');
    }
    const initialByte = buffer.readUInt8(offset);
    offset += 1;
    const majorType = initialByte >> 5;
    const additionalInfo = initialByte & 0x1f;

    switch (majorType) {
      case 0: // unsigned integer
        return readUint(additionalInfo);
      case 1: // negative integer
        return -1 - readUint(additionalInfo);
      case 2: { // byte string
        const len = readUint(additionalInfo);
        const slice = buffer.subarray(offset, offset + len);
        offset += len;
        return slice;
      }
      case 3: { // text string
        const len = readUint(additionalInfo);
        const text = buffer.subarray(offset, offset + len).toString('utf8');
        offset += len;
        return text;
      }
      case 4: { // array
        const len = readUint(additionalInfo);
        const arr: any[] = [];
        for (let i = 0; i < len; i += 1) {
          arr.push(decodeItem());
        }
        return arr;
      }
      case 5: { // map
        const len = readUint(additionalInfo);
        const map = new Map<any, any>();
        for (let i = 0; i < len; i += 1) {
          const key = decodeItem();
          const val = decodeItem();
          map.set(key, val);
        }
        return map;
      }
      case 7: { // simple values
        if (additionalInfo === 20) return false;
        if (additionalInfo === 21) return true;
        if (additionalInfo === 22) return null;
        if (additionalInfo === 23) return undefined;
        throw new Error(`Unsupported CBOR simple value: ${additionalInfo}`);
      }
      default:
        throw new Error(`Unsupported CBOR major type: ${majorType}`);
    }
  }

  return decodeItem();
}

export interface ParsedAttestation {
  rpIdHash: Buffer;
  flags: number;
  signCount: number;
  credentialId: string;
  publicKeyPem: string;
  algorithm: number;
}

/**
 * Parses WebAuthn attestationObject and converts the embedded COSE public key into SPKI PEM.
 */
export function parseAttestationObject(attestationObjectB64Url: string): ParsedAttestation {
  const attBuf = base64UrlToBuffer(attestationObjectB64Url);
  const attMap = decodeCbor(attBuf);
  if (!(attMap instanceof Map)) {
    throw new Error('Invalid attestationObject CBOR map');
  }

  const authData: Buffer | undefined = attMap.get('authData');
  if (!Buffer.isBuffer(authData) || authData.length < 55) {
    throw new Error('Invalid authenticatorData in attestationObject');
  }

  const rpIdHash = authData.subarray(0, 32);
  const flags = authData.readUInt8(32);
  const signCount = authData.readUInt32BE(33);

  const hasAttestedCredData = Boolean(flags & 0x40);
  if (!hasAttestedCredData) {
    throw new Error('Attested credential data missing in authenticatorData');
  }

  // Bytes 37..52 are AAGUID (16 bytes)
  const credIdLen = authData.readUInt16BE(53);
  const credIdEnd = 55 + credIdLen;
  if (authData.length <= credIdEnd) {
    throw new Error('Truncated credentialId in authenticatorData');
  }

  const credentialIdBuf = authData.subarray(55, credIdEnd);
  const coseKeyBuf = authData.subarray(credIdEnd);
  const coseMap = decodeCbor(coseKeyBuf);
  if (!(coseMap instanceof Map)) {
    throw new Error('Invalid COSE_Key CBOR map');
  }

  const kty = coseMap.get(1);
  const alg = coseMap.get(3);

  let publicKeyPem: string;
  if (kty === 2 && alg === -7) {
    // EC2 P-256 (ES256)
    const crv = coseMap.get(-1);
    const x: Buffer | undefined = coseMap.get(-2);
    const y: Buffer | undefined = coseMap.get(-3);
    if (crv !== 1 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y)) {
      throw new Error('Invalid EC2 COSE_Key parameters');
    }
    const keyObj = crypto.createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: bufferToBase64Url(x),
        y: bufferToBase64Url(y),
      },
      format: 'jwk',
    });
    publicKeyPem = keyObj.export({ type: 'spki', format: 'pem' }).toString();
  } else if (kty === 3 && alg === -257) {
    // RSA RS256
    const n: Buffer | undefined = coseMap.get(-1);
    const e: Buffer | undefined = coseMap.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e)) {
      throw new Error('Invalid RSA COSE_Key parameters');
    }
    const keyObj = crypto.createPublicKey({
      key: {
        kty: 'RSA',
        n: bufferToBase64Url(n),
        e: bufferToBase64Url(e),
      },
      format: 'jwk',
    });
    publicKeyPem = keyObj.export({ type: 'spki', format: 'pem' }).toString();
  } else {
    throw new Error(`Unsupported COSE key type/algorithm: kty=${kty}, alg=${alg}`);
  }

  return {
    rpIdHash,
    flags,
    signCount,
    credentialId: bufferToBase64Url(credentialIdBuf),
    publicKeyPem,
    algorithm: alg,
  };
}
