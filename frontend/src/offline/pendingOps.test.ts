import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPendingOps, addPendingOp, removePendingOp, clearPendingOps, replayPendingOps, PendingOp } from './pendingOps';

const mockStore = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mockStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { mockStore.set(key, value); }),
  del: vi.fn(async (key: string) => { mockStore.delete(key); }),
}));

beforeEach(() => {
  mockStore.clear();
});

describe('pendingOps', () => {
  describe('getPendingOps', () => {
    it('returns empty array when no ops stored', async () => {
      const ops = await getPendingOps();
      expect(ops).toEqual([]);
    });

    it('returns stored ops', async () => {
      const testOps: PendingOp[] = [
        { id: 'op_1', type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: {}, createdAt: 100 },
      ];
      mockStore.set('wise_pending_ops', testOps);
      const ops = await getPendingOps();
      expect(ops).toHaveLength(1);
      expect(ops[0].id).toBe('op_1');
    });
  });

  describe('addPendingOp', () => {
    it('adds operation with generated id and createdAt', async () => {
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: { itemId: 'i1' } });
      const ops = await getPendingOps();
      expect(ops).toHaveLength(1);
      expect(ops[0].id).toMatch(/^op_/);
      expect(ops[0].createdAt).toBeGreaterThan(0);
      expect(ops[0].type).toBe('assign_item');
      expect(ops[0].splitId).toBe('s1');
    });

    it('appends to existing ops', async () => {
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: {} });
      await addPendingOp({ type: 'edit_item', splitId: 's2', ownerToken: 'tok', payload: {} });
      const ops = await getPendingOps();
      expect(ops).toHaveLength(2);
    });

    it('generates unique ids', async () => {
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: {} });
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: {} });
      const ops = await getPendingOps();
      expect(ops[0].id).not.toBe(ops[1].id);
    });
  });

  describe('removePendingOp', () => {
    it('removes a single op by id', async () => {
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: {} });
      await addPendingOp({ type: 'edit_item', splitId: 's1', ownerToken: 'tok', payload: {} });
      const ops = await getPendingOps();
      await removePendingOp(ops[0].id);
      const remaining = await getPendingOps();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe('edit_item');
    });

    it('does nothing if id not found', async () => {
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: {} });
      await removePendingOp('nonexistent');
      const ops = await getPendingOps();
      expect(ops).toHaveLength(1);
    });
  });

  describe('clearPendingOps', () => {
    it('removes all ops', async () => {
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: {} });
      await addPendingOp({ type: 'edit_item', splitId: 's1', ownerToken: 'tok', payload: {} });
      await clearPendingOps();
      const ops = await getPendingOps();
      expect(ops).toEqual([]);
    });
  });

  describe('replayPendingOps', () => {
    it('returns 0 when no ops', async () => {
      const count = await replayPendingOps('http://localhost:8081/api');
      expect(count).toBe(0);
    });

    it('replays successful ops and removes them', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: { itemId: 'i1', participantIds: ['p1'] } });
      const count = await replayPendingOps('http://localhost:8081/api');
      expect(count).toBe(1);
      const ops = await getPendingOps();
      expect(ops).toHaveLength(0);
      vi.restoreAllMocks();
    });

    it('keeps failed ops in queue', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: { itemId: 'i1', participantIds: ['p1'] } });
      const count = await replayPendingOps('http://localhost:8081/api');
      expect(count).toBe(0);
      const ops = await getPendingOps();
      expect(ops).toHaveLength(1);
      vi.restoreAllMocks();
    });

    it('keeps ops that throw errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      await addPendingOp({ type: 'edit_item', splitId: 's1', ownerToken: 'tok', payload: { itemId: 'i1', name: 'Burger', price: 500 } });
      const count = await replayPendingOps('http://localhost:8081/api');
      expect(count).toBe(0);
      const ops = await getPendingOps();
      expect(ops).toHaveLength(1);
      vi.restoreAllMocks();
    });

    it('calls onProgress callback', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'tok', payload: {} });
      const progress = vi.fn();
      await replayPendingOps('http://localhost:8081/api', progress);
      expect(progress).toHaveBeenCalledWith(1, 1);
      vi.restoreAllMocks();
    });

    it('builds correct URL for assign_item', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchSpy);
      await addPendingOp({ type: 'assign_item', splitId: 's1', ownerToken: 'mytok', payload: { itemId: 'i1', participantIds: ['p1', 'p2'] } });
      await replayPendingOps('http://localhost:8081/api');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8081/api/splits/s1/items/i1/assign',
        expect.objectContaining({ method: 'PUT' }),
      );
      vi.restoreAllMocks();
    });

    it('builds correct URL for edit_item', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchSpy);
      await addPendingOp({ type: 'edit_item', splitId: 's1', ownerToken: 'mytok', payload: { itemId: 'i1', name: 'Pizza', price: 500 } });
      await replayPendingOps('http://localhost:8081/api');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8081/api/splits/s1/items/i1',
        expect.objectContaining({ method: 'PUT' }),
      );
      vi.restoreAllMocks();
    });

    it('builds correct URL for delete_item', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchSpy);
      await addPendingOp({ type: 'delete_item', splitId: 's1', ownerToken: 'mytok', payload: { itemId: 'i1' } });
      await replayPendingOps('http://localhost:8081/api');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8081/api/splits/s1/items/i1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      vi.restoreAllMocks();
    });
  });
});
