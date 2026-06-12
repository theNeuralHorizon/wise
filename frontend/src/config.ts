import { Capacitor } from '@capacitor/core';

const WEB_API_BASE = 'http://localhost:8081/api';
const ANDROID_EMULATOR_API_BASE = 'http://10.0.2.2:8081/api';

function detectLanIp(): string {
  if (typeof window === 'undefined') return 'localhost';
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '10.0.2.2') return hostname;
  return hostname;
}

function getDeviceApiBase(): string {
  if (Capacitor.isNativePlatform()) {
    const lanIp = detectLanIp();
    if (lanIp !== 'localhost' && lanIp !== '127.0.0.1' && lanIp !== '10.0.2.2') {
      return `http://${lanIp}:8081/api`;
    }
    return ANDROID_EMULATOR_API_BASE;
  }
  return WEB_API_BASE;
}

const DEFAULT_API_BASE = getDeviceApiBase();

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

export const FRONTEND_BASE = trimTrailingSlash(
  import.meta.env.VITE_FRONTEND_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'http://localhost:5173'),
);

export function guestShareLink(token: string) {
  return `${FRONTEND_BASE}/guest/${encodeURIComponent(token)}`;
}
