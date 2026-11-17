import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const refreshKey = 'ledgerly.refresh-token';
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
const sessionListeners = new Set<(authenticated: boolean) => void>();

// --- Web & Mobile Compatible Storage Helpers ---
async function setStoredToken(token: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(refreshKey, token);
  } else {
    await SecureStore.setItemAsync(refreshKey, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  }
}

async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(refreshKey);
  }
  return SecureStore.getItemAsync(refreshKey);
}

async function deleteStoredToken() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(refreshKey);
  } else {
    await SecureStore.deleteItemAsync(refreshKey);
  }
}
// -----------------------------------------------

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of sessionListeners) listener(Boolean(token));
}

export function onSessionChange(
  listener: (authenticated: boolean) => void
): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export async function storeRefreshToken(token: string): Promise<void> {
  await setStoredToken(token);
}

export async function getRefreshToken(): Promise<string | null> {
  return await getStoredToken();
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  await deleteStoredToken();
  for (const listener of sessionListeners) listener(false);
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getStoredToken();
    if (!refreshToken) return null;

    const response = await fetch(`${apiBaseUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshToken}` },
    });

    if (!response.ok) {
      await clearTokens();
      return null;
    }

    const body = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    await storeRefreshToken(body.refreshToken);
    setAccessToken(body.accessToken);
    return body.accessToken;
  })()
    .catch(async () => {
      await clearTokens();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export function apiBaseUrl(): string {
  // @ts-ignore - TypeScript sometimes complains about process.env in React Native web
  const value = process.env.EXPO_PUBLIC_API_URL;
  if (!value) throw new Error('EXPO_PUBLIC_API_URL is not configured.');
  return value.replace(/\/$/, '');
}
