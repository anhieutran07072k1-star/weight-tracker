// Local-first Web Crypto API hashing utilities (no plaintext secrets stored)

export function generateSalt(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashSecret(secret: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${secret}:kehoachthuchi`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback deterministic FNV-1a if crypto.subtle unavailable on insecure local origin
  let h1 = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h1 ^= data[i];
    h1 = Math.imul(h1, 0x01000193);
  }
  return `fnv_${(h1 >>> 0).toString(16)}`;
}

export async function verifySecret(secret: string, salt: string, expectedHash: string): Promise<boolean> {
  const computed = await hashSecret(secret, salt);
  return computed === expectedHash;
}
