import { get, set, del } from 'idb-keyval';

const PENDING_OPS_KEY = 'wise_pending_ops';

export interface PendingOp {
  id: string;
  type: 'assign_item' | 'edit_item' | 'add_item' | 'delete_item' | 'update_split';
  splitId: string;
  ownerToken: string;
  payload: unknown;
  createdAt: number;
}

export async function getPendingOps(): Promise<PendingOp[]> {
  try {
    return (await get<PendingOp[]>(PENDING_OPS_KEY)) || [];
  } catch { return []; }
}

export async function addPendingOp(op: Omit<PendingOp, 'id' | 'createdAt'>): Promise<void> {
  const ops = await getPendingOps();
  ops.push({ ...op, id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() });
  await set(PENDING_OPS_KEY, ops);
}

export async function removePendingOp(id: string): Promise<void> {
  const ops = await getPendingOps();
  await set(PENDING_OPS_KEY, ops.filter(op => op.id !== id));
}

export async function clearPendingOps(): Promise<void> {
  await del(PENDING_OPS_KEY);
}

export async function replayPendingOps(
  apiBase: string,
  onProgress?: (replayed: number, total: number) => void,
): Promise<number> {
  const ops = await getPendingOps();
  if (ops.length === 0) return 0;

  let replayed = 0;
  const failed: PendingOp[] = [];

  for (const op of ops) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${op.ownerToken}`,
      };

      let url = `${apiBase}/splits/${op.splitId}`;
      let method = 'PUT';
      let body: string | undefined;

      switch (op.type) {
        case 'assign_item': {
          const p = op.payload as { itemId: string; participantIds: string[] };
          url += `/items/${p.itemId}/assign`;
          method = 'PUT';
          body = JSON.stringify({ participant_ids: p.participantIds });
          break;
        }
        case 'edit_item': {
          const p = op.payload as { itemId: string; name: string; price: number };
          url += `/items/${p.itemId}`;
          method = 'PUT';
          body = JSON.stringify({ name: p.name, price: p.price });
          break;
        }
        case 'add_item': {
          const p = op.payload as { name: string; price: number; quantity: number; emoji: string };
          url += `/items`;
          method = 'POST';
          body = JSON.stringify(p);
          break;
        }
        case 'delete_item': {
          const p = op.payload as { itemId: string };
          url += `/items/${p.itemId}`;
          method = 'DELETE';
          break;
        }
        case 'update_split': {
          const p = op.payload as Record<string, unknown>;
          url += `/update`;
          method = 'PUT';
          body = JSON.stringify(p);
          break;
        }
      }

      const resp = await fetch(url, { method, headers, body });
      if (resp.ok) {
        replayed++;
      } else {
        failed.push(op);
      }
    } catch {
      failed.push(op);
    }

    onProgress?.(replayed, ops.length);
  }

  await set(PENDING_OPS_KEY, failed);
  return replayed;
}
