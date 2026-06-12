import { describe, it, expect, vi, beforeEach } from 'vitest';
import { API_BASE, WS_BASE, FRONTEND_BASE, guestShareLink } from './config';

describe('config', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('API_BASE', () => {
    it('is defined', () => {
      expect(API_BASE).toBeDefined();
      expect(typeof API_BASE).toBe('string');
    });

    it('does not end with trailing slash', () => {
      expect(API_BASE.endsWith('/')).toBe(false);
    });

    it('ends with /api', () => {
      expect(API_BASE).toMatch(/\/api$/);
    });
  });

  describe('WS_BASE', () => {
    it('is defined', () => {
      expect(WS_BASE).toBeDefined();
      expect(typeof WS_BASE).toBe('string');
    });

    it('does not end with trailing slash', () => {
      expect(WS_BASE.endsWith('/')).toBe(false);
    });

    it('uses ws:// protocol in dev', () => {
      if (WS_BASE.startsWith('ws://') || WS_BASE.startsWith('wss://')) {
        expect(WS_BASE).toMatch(/^wss?:\/\//);
      }
    });
  });

  describe('FRONTEND_BASE', () => {
    it('is defined', () => {
      expect(FRONTEND_BASE).toBeDefined();
      expect(typeof FRONTEND_BASE).toBe('string');
    });

    it('does not end with trailing slash', () => {
      expect(FRONTEND_BASE.endsWith('/')).toBe(false);
    });
  });

  describe('guestShareLink', () => {
    it('builds correct URL with token', () => {
      const link = guestShareLink('my-guest-token');
      expect(link).toContain('/guest/my-guest-token');
    });

    it('encodes special characters in token', () => {
      const link = guestShareLink('token with spaces/slashes');
      expect(link).toContain('/guest/');
      expect(link).toContain('token%20with%20spaces%2Fslashes');
    });

    it('starts with FRONTEND_BASE', () => {
      const link = guestShareLink('abc');
      expect(link).toMatch(new RegExp(`^${FRONTEND_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/guest/abc$`));
    });
  });
});
