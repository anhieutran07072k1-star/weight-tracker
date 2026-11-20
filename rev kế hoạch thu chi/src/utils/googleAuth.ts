import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Strict minimal scope: only appDataFolder on Google Drive
export const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

// Strictly in-memory OAuth access token cache (never stored in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let tokenObtainedAt = 0;
let isSigningIn = false;

// OAuth access tokens typically last ~3600s; treat older than 55 minutes as expired
const TOKEN_TTL_MS = 55 * 60 * 1000;

export interface GoogleAuthInfo {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

function buildProvider(forceConsent = false, loginHint?: string): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_DRIVE_SCOPES) {
    provider.addScope(scope);
  }
  const params: Record<string, string> = {
    prompt: forceConsent ? 'consent select_account' : 'select_account',
  };
  if (loginHint) {
    params.login_hint = loginHint;
  }
  provider.setCustomParameters(params);
  return provider;
}

export function getCachedGoogleAccessToken(): string | null {
  if (!cachedAccessToken) return null;
  if (Date.now() - tokenObtainedAt > TOKEN_TTL_MS) {
    cachedAccessToken = null;
    return null;
  }
  return cachedAccessToken;
}

export function clearCachedGoogleAccessToken(): void {
  cachedAccessToken = null;
  tokenObtainedAt = 0;
}

export function getCurrentFirebaseGoogleUser(): GoogleAuthInfo | null {
  const u = firebaseAuth.currentUser;
  if (!u || !u.email) return null;
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName || u.email.split('@')[0],
    photoURL: u.photoURL || undefined,
  };
}

export function initGoogleAuthListener(
  onUserChange: (user: GoogleAuthInfo | null, hasAccessToken: boolean) => void
): () => void {
  return onAuthStateChanged(firebaseAuth, (user: User | null) => {
    if (!user) {
      clearCachedGoogleAccessToken();
      onUserChange(null, false);
      return;
    }
    if (!isSigningIn && !getCachedGoogleAccessToken()) {
      // User session resumed from Firebase Auth persistence, but OAuth Drive access token is not in memory yet
      onUserChange(
        {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email || 'Người dùng Google',
          photoURL: user.photoURL || undefined,
        },
        false
      );
      return;
    }
    onUserChange(
      {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email || 'Người dùng Google',
        photoURL: user.photoURL || undefined,
      },
      Boolean(getCachedGoogleAccessToken())
    );
  });
}

export async function signInWithGoogleDrive(options?: {
  forceConsent?: boolean;
  loginHint?: string;
}): Promise<{ user: GoogleAuthInfo; accessToken: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Thiết bị đang ngoại tuyến. Cần kết nối Internet để đăng nhập Google.');
  }

  try {
    isSigningIn = true;
    const provider = buildProvider(options?.forceConsent ?? false, options?.loginHint);
    const result = await signInWithPopup(firebaseAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('Không nhận được quyền truy cập Google Drive từ phiên đăng nhập.');
    }

    cachedAccessToken = credential.accessToken;
    tokenObtainedAt = Date.now();

    const u = result.user;
    return {
      user: {
        uid: u.uid,
        email: u.email || '',
        displayName: u.displayName || u.email?.split('@')[0] || 'Người dùng Google',
        photoURL: u.photoURL || undefined,
      },
      accessToken: credential.accessToken,
    };
  } catch (err: any) {
    const code = err?.code as string | undefined;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Trình duyệt đã chặn cửa sổ bật lên. Vui lòng cho phép popup cho trang này rồi thử lại.');
    }
    if (code === 'auth/network-request-failed') {
      throw new Error('Không có kết nối mạng để xác thực với Google.');
    }
    throw new Error(err?.message || 'Đăng nhập Google thất bại.');
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleDrive(): Promise<void> {
  clearCachedGoogleAccessToken();
  try {
    await signOut(firebaseAuth);
  } catch {
    // ignore offline signOut errors
  }
}
