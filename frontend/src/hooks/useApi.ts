import { useCallback } from 'react';
import { API_BASE } from '../config';
import {
  SplitDetailResponseSchema,
  SplitCreatedResponseSchema,
  AddItemResponseSchema,
  ReceiptUploadResponseSchema,
  GuestViewResponseSchema,
  HealthResponseSchema,
  PaymentsResponseSchema,
  type SplitDetailResponse,
  type SplitCreatedResponse,
  type AddItemResponse,
  type ReceiptUploadResponse,
  type GuestViewResponse,
  type PaymentRecord,
} from '../schemas';

function parseOrThrow<T>(schema: { parse: (data: unknown) => T }, data: unknown, label: string): T {
  try {
    return schema.parse(data);
  } catch (e) {
    throw new Error(`Invalid ${label} response from server: ${e}`);
  }
}

export function useApi() {
  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return false;
      const data = parseOrThrow(HealthResponseSchema, await r.json(), 'health');
      return data.status === 'ok';
    } catch {
      return false;
    }
  }, []);

  const createSplit = useCallback(async (payload: {
    name: string;
    restaurant: string;
    participants: { name: string; emoji: string; upi_id: string | null }[];
  }): Promise<SplitCreatedResponse> => {
    const resp = await fetch(`${API_BASE}/splits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`Create split failed: ${resp.status}`);
    return parseOrThrow(SplitCreatedResponseSchema, await resp.json(), 'create_split');
  }, []);

  const getSplitDetail = useCallback(async (splitId: string): Promise<SplitDetailResponse> => {
    const resp = await fetch(`${API_BASE}/splits/${splitId}`);
    if (!resp.ok) throw new Error(`Get split failed: ${resp.status}`);
    return parseOrThrow(SplitDetailResponseSchema, await resp.json(), 'split_detail');
  }, []);

  const uploadReceipt = useCallback(async (
    splitId: string,
    ownerToken: string,
    file: File,
  ): Promise<ReceiptUploadResponse> => {
    const formData = new FormData();
    formData.append('receipt', file);
    const resp = await fetch(`${API_BASE}/splits/${splitId}/receipt?force=true`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: formData,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Server error' }));
      throw new Error(err.error || `Upload failed: ${resp.status}`);
    }
    return parseOrThrow(ReceiptUploadResponseSchema, await resp.json(), 'receipt_upload');
  }, []);

  const addItem = useCallback(async (
    splitId: string,
    ownerToken: string,
    payload: { name: string; price: number; quantity: number; emoji: string },
  ): Promise<AddItemResponse> => {
    const resp = await fetch(`${API_BASE}/splits/${splitId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`Add item failed: ${resp.status}`);
    return parseOrThrow(AddItemResponseSchema, await resp.json(), 'add_item');
  }, []);

  const editItem = useCallback(async (
    splitId: string,
    itemId: string,
    ownerToken: string,
    payload: { name: string; price: number },
  ): Promise<void> => {
    await fetch(`${API_BASE}/splits/${splitId}/items/${itemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(payload),
    });
  }, []);

  const deleteItem = useCallback(async (
    splitId: string,
    itemId: string,
    ownerToken: string,
  ): Promise<void> => {
    await fetch(`${API_BASE}/splits/${splitId}/items/${itemId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
    });
  }, []);

  const assignItem = useCallback(async (
    splitId: string,
    itemId: string,
    ownerToken: string,
    participantIds: string[],
  ): Promise<void> => {
    await fetch(`${API_BASE}/splits/${splitId}/items/${itemId}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ participant_ids: participantIds }),
    });
  }, []);

  const updateSplit = useCallback(async (
    splitId: string,
    ownerToken: string,
    payload: { name?: string; restaurant: string; tax?: number; tip?: number },
  ): Promise<void> => {
    await fetch(`${API_BASE}/splits/${splitId}/update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`,
      },
      body: JSON.stringify(payload),
    });
  }, []);

  const getGuestView = useCallback(async (token: string): Promise<GuestViewResponse> => {
    const resp = await fetch(`${API_BASE}/guest/${token}`);
    if (!resp.ok) throw new Error(`Guest view failed: ${resp.status}`);
    return parseOrThrow(GuestViewResponseSchema, await resp.json(), 'guest_view');
  }, []);

  const guestPay = useCallback(async (
    token: string,
    payload: { name: string; amount: number; item_ids: string[] },
  ): Promise<{ upi_deeplink: string; upi_id: string; payment_id: string }> => {
    const resp = await fetch(`${API_BASE}/guest/${token}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`Guest pay failed: ${resp.status}`);
    return resp.json();
  }, []);

  const getPayments = useCallback(async (splitId: string): Promise<PaymentRecord[]> => {
    const resp = await fetch(`${API_BASE}/splits/${splitId}/payments`);
    if (!resp.ok) throw new Error(`Get payments failed: ${resp.status}`);
    return parseOrThrow(PaymentsResponseSchema, await resp.json(), 'payments').payments;
  }, []);

  const confirmPayment = useCallback(async (
    splitId: string,
    paymentId: string,
    guestToken: string,
  ): Promise<void> => {
    const resp = await fetch(`${API_BASE}/splits/${splitId}/payments/${paymentId}/confirm`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${guestToken}` },
    });
    if (!resp.ok) throw new Error(`Confirm payment failed: ${resp.status}`);
  }, []);

  return {
    checkHealth,
    createSplit,
    getSplitDetail,
    uploadReceipt,
    addItem,
    editItem,
    deleteItem,
    assignItem,
    updateSplit,
    getGuestView,
    guestPay,
    getPayments,
    confirmPayment,
  };
}
