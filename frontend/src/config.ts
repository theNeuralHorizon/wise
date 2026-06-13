import { Capacitor } from '@capacitor/core';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function apiToWsBase(apiBase: string) {
  return apiBase.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
}

function getApiBase(): string {
  const envBase = import.meta.env.VITE_API_BASE_URL;
  if (envBase) return trimTrailingSlash(envBase);

  if (Capacitor.isNativePlatform()) {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '10.0.2.2') {
      return `http://${hostname}:8081/api`;
    }
    return 'http://10.0.2.2:8081/api';
  }

  if (import.meta.env.PROD) {
    throw new Error(
      'VITE_API_BASE_URL is not set. In production builds, you must set this environment variable. ' +
      'Example: VITE_API_BASE_URL=https://your-backend.up.railway.app/api'
    );
  }

  return 'http://localhost:8081/api';
}

function getWsBase(): string {
  const envWs = import.meta.env.VITE_WS_BASE_URL;
  if (envWs) return trimTrailingSlash(envWs);

  if (import.meta.env.PROD) {
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (apiBase) return trimTrailingSlash(apiToWsBase(apiBase));
    throw new Error(
      'VITE_WS_BASE_URL is not set and VITE_API_BASE_URL is missing. ' +
      'Set VITE_WS_BASE_URL or VITE_API_BASE_URL in your environment.'
    );
  }

  return apiToWsBase(getApiBase());
}

function getFrontendBase(): string {
  const envFrontend = import.meta.env.VITE_FRONTEND_URL;
  if (envFrontend) return trimTrailingSlash(envFrontend);

  if (typeof window !== 'undefined') {
    return trimTrailingSlash(`${window.location.origin}${window.location.pathname}`);
  }

  return 'http://localhost:5173';
}

export const API_BASE = getApiBase();
export const WS_BASE = getWsBase();
export const FRONTEND_BASE = getFrontendBase();

export function guestShareLink(token: string) {
  return `${FRONTEND_BASE}/guest/${encodeURIComponent(token)}`;
}
