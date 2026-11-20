// AES-GCM-256 encryption & SHA-256 integrity verification using Web Crypto API
// Encryption keys are NEVER stored inside encrypted Drive payloads.

export interface EncryptedEnvelope {
  format: 'khtc_enc_v1';
  alg: 'AES-GCM-256';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  saltB64: string;
  ivB64: string;
  integritySha256: string;
  requiresPassphrase: boolean;
  ciphertextB64: string;
  createdAt: string;
}

const APP_KEY_PEPPER = 'khtc:drive:appdata:v1:2885e07d';
const PBKDF2_ITERATIONS = 120_000;

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function getWebCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('Trình duyệt hoặc môi trường hiện tại không hỗ trợ Web Crypto API (AES-GCM).');
  }
  return c;
}

export async function sha256Hex(text: string): Promise<string> {
  const c = getWebCrypto();
  const data = new TextEncoder().encode(text);
  const digest = await c.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

async function deriveAesKey(params: {
  googleUid: string;
  passphrase?: string;
  salt: Uint8Array;
}): Promise<CryptoKey> {
  const c = getWebCrypto();
  const secretMaterial = `${params.googleUid}:${APP_KEY_PEPPER}:${params.passphrase?.trim() || ''}`;
  const rawKey = await c.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretMaterial),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return c.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: params.salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSyncPayload<T>(params: {
  payload: T;
  googleUid: string;
  passphrase?: string;
}): Promise<EncryptedEnvelope> {
  const c = getWebCrypto();
  const json = JSON.stringify(params.payload);
  const plaintext = new TextEncoder().encode(json);
  const integritySha256 = await sha256Hex(json);

  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey({
    googleUid: params.googleUid,
    passphrase: params.passphrase,
    salt,
  });

  const cipherBuffer = await c.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext
  );

  return {
    format: 'khtc_enc_v1',
    alg: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    saltB64: toBase64(salt),
    ivB64: toBase64(iv),
    integritySha256,
    requiresPassphrase: Boolean(params.passphrase && params.passphrase.trim().length > 0),
    ciphertextB64: toBase64(new Uint8Array(cipherBuffer)),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptSyncPayload<T>(params: {
  envelope: EncryptedEnvelope;
  googleUid: string;
  passphrase?: string;
}): Promise<T> {
  const { envelope, googleUid, passphrase } = params;
  if (!envelope || envelope.format !== 'khtc_enc_v1') {
    throw new Error('Định dạng dữ liệu mã hóa trên Google Drive không hợp lệ.');
  }
  if (envelope.requiresPassphrase && (!passphrase || !passphrase.trim())) {
    const err = new Error('Dữ liệu đồng bộ được bảo vệ bằng Khẩu lệnh mã hóa cá nhân.');
    (err as Error & { code?: string }).code = 'PASSPHRASE_REQUIRED';
    throw err;
  }

  const c = getWebCrypto();
  const salt = fromBase64(envelope.saltB64);
  const iv = fromBase64(envelope.ivB64);
  const ciphertext = fromBase64(envelope.ciphertextB64);

  const key = await deriveAesKey({ googleUid, passphrase, salt });

  let plainBuffer: ArrayBuffer;
  try {
    plainBuffer = await c.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
  } catch {
    const err = new Error(
      envelope.requiresPassphrase
        ? 'Giải mã thất bại: Khẩu lệnh mã hóa không đúng hoặc dữ liệu bị hỏng.'
        : 'Giải mã thất bại: Tài khoản Google không khớp hoặc dữ liệu bị thay đổi.'
    );
    (err as Error & { code?: string }).code = 'DECRYPT_FAILED';
    throw err;
  }

  const json = new TextDecoder().decode(plainBuffer);
  const actualSha = await sha256Hex(json);
  if (actualSha !== envelope.integritySha256) {
    throw new Error('Kiểm tra toàn vẹn SHA-256 thất bại: dữ liệu có dấu hiệu không nguyên vẹn.');
  }

  return JSON.parse(json) as T;
}
