import { useState, useEffect, useCallback, useRef } from 'react';
import { replayPendingOps } from './pendingOps';
import { API_BASE } from '../config';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const replayTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerReplay = useCallback(async () => {
    if (isReplaying) return;
    setIsReplaying(true);
    try {
      await replayPendingOps(API_BASE);
    } catch { /* ignore */ }
    setIsReplaying(false);
  }, [isReplaying]);

  useEffect(() => {
    if (!isOffline && pendingCount > 0 && !isReplaying) {
      if (replayTimerRef.current) window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = window.setTimeout(() => {
        triggerReplay();
      }, 2000);
    }
    return () => { if (replayTimerRef.current) window.clearTimeout(replayTimerRef.current); };
  }, [isOffline, pendingCount, isReplaying, triggerReplay]);

  return { isOffline, pendingCount, setPendingCount, isReplaying, triggerReplay };
}
