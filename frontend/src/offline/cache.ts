import { get, set, del, keys } from 'idb-keyval';

const SPLIT_PREFIX = 'wise_cache_split_';
const GUEST_PREFIX = 'wise_cache_guest_';

export interface CachedSplitData {
  splitId: string;
  split: { id: string; name: string; restaurant: string | null; total_amount: number; tax: number; tip: number };
  participants: { id: string; name: string; emoji: string; upi_id: string | null }[];
  items: { id: string; name: string; price: number; quantity: number; emoji: string }[];
  assignments: { item_id: string; participant_id: string }[];
  cachedAt: number;
}

export interface CachedGuestData {
  token: string;
  splitId: string;
  name: string;
  restaurant: string | null;
  total: number;
  tax: number;
  tip: number;
  host: { name: string; emoji: string; upi_id: string | null };
  items: { id: string; name: string; price: number; quantity: number; emoji: string }[];
  cachedAt: number;
}

export async function cacheSplitData(data: CachedSplitData): Promise<void> {
  try {
    await set(SPLIT_PREFIX + data.splitId, data);
  } catch { /* storage full or unavailable */ }
}

export async function getCachedSplitData(splitId: string): Promise<CachedSplitData | null> {
  try {
    return (await get<SplitCacheKey>(SPLIT_PREFIX + splitId)) || null;
  } catch { return null; }
}

type SplitCacheKey = CachedSplitData;

export async function cacheGuestData(data: CachedGuestData): Promise<void> {
  try {
    await set(GUEST_PREFIX + data.token, data);
  } catch { /* storage full or unavailable */ }
}

export async function getCachedGuestData(token: string): Promise<CachedGuestData | null> {
  try {
    return (await get<CachedGuestData>(GUEST_PREFIX + token)) || null;
  } catch { return null; }
}

export async function clearStaleCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const allKeys = await keys();
    const now = Date.now();
    for (const key of allKeys) {
      if (typeof key === 'string' && (key.startsWith(SPLIT_PREFIX) || key.startsWith(GUEST_PREFIX))) {
        const data = await get<CachedSplitData | CachedGuestData>(key);
        if (data && 'cachedAt' in data && now - data.cachedAt > maxAgeMs) {
          await del(key);
        }
      }
    }
  } catch { /* ignore */ }
}
