import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApi } from '../hooks/useApi';

const API_BASE = 'http://localhost:8081/api';

vi.mock('../config', () => ({
  API_BASE: 'http://localhost:8081/api',
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSuccess(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  }));
}

function mockFetchError(status: number, body?: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => body ?? { error: 'error' },
  }));
}

describe('useApi', () => {
  describe('checkHealth', () => {
    it('returns true on healthy response', async () => {
      mockFetchSuccess({ status: 'ok' });
      const { result } = renderHook(() => useApi());
      let res: boolean = false;
      await act(async () => { res = await result.current.checkHealth(); });
      expect(res).toBe(true);
    });

    it('returns false on unhealthy response', async () => {
      mockFetchSuccess({ status: 'error' });
      const { result } = renderHook(() => useApi());
      let res: boolean = true;
      await act(async () => { res = await result.current.checkHealth(); });
      expect(res).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
      const { result } = renderHook(() => useApi());
      let res: boolean = true;
      await act(async () => { res = await result.current.checkHealth(); });
      expect(res).toBe(false);
    });
  });

  describe('createSplit', () => {
    it('sends POST to /api/splits', async () => {
      mockFetchSuccess({ split_id: 's1', owner_token: 'tok', token_created_at: '2025-01-01T00:00:00Z', guest_token: 'g1', guest_link: '/guest/g1', ws_url: 'ws://...' });
      const { result } = renderHook(() => useApi());
      let data: any;
      await act(async () => {
        data = await result.current.createSplit({ name: 'Test', restaurant: 'Resto', participants: [{ name: 'Host', emoji: '😎', upi_id: null }] });
      });
      expect(data.split_id).toBe('s1');
      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/splits`, expect.objectContaining({ method: 'POST' }));
    });

    it('throws on error response', async () => {
      mockFetchError(400);
      const { result } = renderHook(() => useApi());
      await act(async () => {
        await expect(result.current.createSplit({ name: 'Test', restaurant: 'Resto', participants: [] })).rejects.toThrow();
      });
    });
  });

  describe('getSplitDetail', () => {
    it('sends GET to /api/splits/:id', async () => {
      mockFetchSuccess({ split: { name: 'Test', restaurant: 'R', total_amount: 100, tax: 0, tip: 0 }, participants: [], items: [], assignments: [] });
      const { result } = renderHook(() => useApi());
      let data: any;
      await act(async () => { data = await result.current.getSplitDetail('s1'); });
      expect(data.split.name).toBe('Test');
      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/splits/s1`);
    });
  });

  describe('uploadReceipt', () => {
    it('sends POST with Authorization header', async () => {
      mockFetchSuccess({ status: 'parsed', items: [], totals: { subtotal: 0, tax: 0, tip: 0, total: 0 }, restaurant: null, confidence: 0.9, is_mock: false });
      const { result } = renderHook(() => useApi());
      const file = new File(['test'], 'receipt.png', { type: 'image/png' });
      await act(async () => { await result.current.uploadReceipt('s1', 'owner-token', file); });
      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/splits/s1/receipt?force=true`,
        expect.objectContaining({
          method: 'POST',
          headers: { Authorization: 'Bearer owner-token' },
        }),
      );
    });
  });

  describe('addItem', () => {
    it('sends POST with auth header and body', async () => {
      mockFetchSuccess({ status: 'created', item_id: 'i1' });
      const { result } = renderHook(() => useApi());
      let data: any;
      await act(async () => { data = await result.current.addItem('s1', 'tok', { name: 'Burger', price: 500, quantity: 1, emoji: '🍔' }); });
      expect(data.item_id).toBe('i1');
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe(`${API_BASE}/splits/s1/items`);
      expect(call[1].headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' });
    });
  });

  describe('editItem', () => {
    it('sends PUT with auth header', async () => {
      mockFetchSuccess(null);
      const { result } = renderHook(() => useApi());
      await act(async () => { await result.current.editItem('s1', 'i1', 'tok', { name: 'Pizza', price: 600 }); });
      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/splits/s1/items/i1`, expect.objectContaining({ method: 'PUT' }));
    });
  });

  describe('deleteItem', () => {
    it('sends DELETE with auth header', async () => {
      mockFetchSuccess(null);
      const { result } = renderHook(() => useApi());
      await act(async () => { await result.current.deleteItem('s1', 'i1', 'tok'); });
      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/splits/s1/items/i1`, expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('assignItem', () => {
    it('sends PUT with participant_ids body', async () => {
      mockFetchSuccess(null);
      const { result } = renderHook(() => useApi());
      await act(async () => { await result.current.assignItem('s1', 'i1', 'tok', ['p1', 'p2']); });
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].method).toBe('PUT');
      expect(JSON.parse(call[1].body)).toEqual({ participant_ids: ['p1', 'p2'] });
    });
  });

  describe('updateSplit', () => {
    it('sends PUT with payload', async () => {
      mockFetchSuccess(null);
      const { result } = renderHook(() => useApi());
      await act(async () => { await result.current.updateSplit('s1', 'tok', { restaurant: 'New Name', tax: 100, tip: 200 }); });
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(call[1].body)).toEqual({ restaurant: 'New Name', tax: 100, tip: 200 });
    });
  });

  describe('getGuestView', () => {
    it('sends GET to /api/guest/:token', async () => {
      mockFetchSuccess({ split_id: 's1', name: 'Dinner', restaurant: 'R', total: 100, tax: 0, tip: 0, host: { name: 'H', emoji: '😎', upi_id: null }, items: [] });
      const { result } = renderHook(() => useApi());
      let data: any;
      await act(async () => { data = await result.current.getGuestView('guest-tok'); });
      expect(data.name).toBe('Dinner');
      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/guest/guest-tok`);
    });
  });

  describe('guestPay', () => {
    it('sends POST with body', async () => {
      mockFetchSuccess({ upi_deeplink: 'upi://...', upi_id: 'host@upi', payment_id: 'pay1' });
      const { result } = renderHook(() => useApi());
      let data: any;
      await act(async () => { data = await result.current.guestPay('guest-tok', { name: 'Alice', amount: 500, item_ids: ['i1'] }); });
      expect(data.payment_id).toBe('pay1');
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(call[1].body)).toEqual({ name: 'Alice', amount: 500, item_ids: ['i1'] });
    });
  });

  describe('getPayments', () => {
    it('sends GET and returns payments array', async () => {
      mockFetchSuccess({ payments: [{ id: 'pay1', split_id: 's1', from_participant: 'p1', from_name: 'A', from_emoji: '😎', to_participant: 'p2', amount: 100, status: 'pending', created_at: '2025-01-01', confirmed_at: null }] });
      const { result } = renderHook(() => useApi());
      let data: any;
      await act(async () => { data = await result.current.getPayments('s1'); });
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('pay1');
    });
  });

  describe('confirmPayment', () => {
    it('sends POST with guest token auth', async () => {
      mockFetchSuccess(null);
      const { result } = renderHook(() => useApi());
      await act(async () => { await result.current.confirmPayment('s1', 'pay1', 'guest-tok'); });
      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/splits/s1/payments/pay1/confirm`,
        expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer guest-tok' } }),
      );
    });
  });

  describe('error handling', () => {
    it('throws on 404', async () => {
      mockFetchError(404);
      const { result } = renderHook(() => useApi());
      await act(async () => {
        await expect(result.current.getSplitDetail('nonexistent')).rejects.toThrow();
      });
    });

    it('throws on 500', async () => {
      mockFetchError(500);
      const { result } = renderHook(() => useApi());
      await act(async () => {
        await expect(result.current.createSplit({ name: 'T', restaurant: 'R', participants: [] })).rejects.toThrow();
      });
    });

    it('throws on 401', async () => {
      mockFetchError(401);
      const { result } = renderHook(() => useApi());
      await act(async () => {
        await expect(result.current.uploadReceipt('s1', 'bad-token', new File([], 'f.png'))).rejects.toThrow();
      });
    });
  });
});
