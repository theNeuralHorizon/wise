import { Capacitor } from '@capacitor/core';

const WEB_API_BASE = 'http://localhost:8081/api';
const ANDROID_EMULATOR_API_BASE = 'http://10.0.2.2:8081/api';

const DEFAULT_API_BASE = Capacitor.isNativePlatform()
  ? ANDROID_EMULATOR_API_BASE
  : WEB_API_BASE;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function apiToWsBase(apiBase: string) {
  return apiBase.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
}

export const API_BASE = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE,
);

export const WS_BASE = trimTrailingSlash(
  import.meta.env.VITE_WS_BASE_URL || apiToWsBase(API_BASE),
);

/** Base URL for guest share links (?guest=token). Defaults to current page origin. */
export const FRONTEND_BASE = trimTrailingSlash(
  import.meta.env.VITE_FRONTEND_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'http://localhost:5173'),
);

export function guestShareLink(token: string) {
  return `${FRONTEND_BASE}?guest=${encodeURIComponent(token)}`;
}
