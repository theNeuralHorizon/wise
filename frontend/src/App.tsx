import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { WS_BASE, FRONTEND_BASE } from './config';
import { useApi } from './hooks/useApi';
import type { Item, Person, SplitHistoryItem, SettlementTransaction, PaymentRecord } from './schemas';
import { Toast } from './components/Toast';
import { CreateSplit, colors } from './components/CreateSplit';
import { ReceiptUpload } from './components/ReceiptUpload';
import { ItemAssignment } from './components/ItemAssignment';
import { SplitSummary } from './components/SplitSummary';
import { HistoryScreen } from './components/HistoryScreen';
import { ProcessingScreen } from './components/ProcessingScreen';
import { TaxTipModal } from './components/TaxTipModal';
import { HomeScreen } from './components/HomeScreen';
import { GuestWrapper } from './components/GuestWrapper';
import { OnboardingScreen } from './components/OnboardingScreen';
import { cacheSplitData, getCachedSplitData } from './offline/cache';
import { addPendingOp } from './offline/pendingOps';
import { useOffline } from './offline/useOffline';
import { openUpiDeeplink } from './upi';

function extractSplitId(pathname: string): string | null {
  const match = pathname.match(/\/split\/([^/]+)/);
  return match ? match[1] : null;
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const api = useApi();
  const [hasLaunched, setHasLaunched] = useState(() => localStorage.getItem('wise_hasLaunched') === '1');
  const [backendOnline, setBackendOnline] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastMsg(null), 2800);
  }, []);
  const [items, setItems] = useState<Item[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number[]>>({});
  const [selectedPerson, setSelectedPerson] = useState(0);
  const [activeSplitName, setActiveSplitName] = useState('');
  const [taxRate, setTaxRate] = useState(0.08);
  const [tipRate, setTipRate] = useState(0.10);
  const [activeSplitId, setActiveSplitId] = useState<string | null>(null);
  const [activeGuestToken, setActiveGuestToken] = useState<string | null>(null);
  const [activeOwnerToken, setActiveOwnerToken] = useState<string | null>(null);
  const [splitHistory, setSplitHistory] = useState<SplitHistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('wise_splits') || '[]'); } catch { return []; }
  });
  const [settlements, setSettlements] = useState<SettlementTransaction[] | null>(null);
  const [settlementsLoading, setSettlementsLoading] = useState(false);
  const [taxTipModalOpen, setTaxTipModalOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<'all' | 'you' | 'unassigned'>('all');
  const [pStep, setPStep] = useState(1);
  const [foundItemsCount, setFoundItemsCount] = useState(0);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isUsingCache, setIsUsingCache] = useState(false);
  const [isDark, setIsDark] = useState(() => !localStorage.getItem('wise_theme') || localStorage.getItem('wise_theme') === 'dark');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const { isOffline, pendingCount, setPendingCount } = useOffline();
  useEffect(() => {
    document.body.classList.toggle('light-mode', !isDark);
    localStorage.setItem('wise_theme', isDark ? 'dark' : 'light');
  }, [isDark]);
  const peopleRef = useRef<Person[]>(people);
  peopleRef.current = people;
  const billSubtotal = useMemo(() => items.reduce((s, i) => s + i.price, 0), [items]);
  const mySubtotal = useMemo(() => {
    let total = 0;
    items.forEach(item => {
      const assigned = assignments[item.id] || [];
      if (assigned.includes(0)) total += item.price / Math.max(1, assigned.length);
    });
    return total;
  }, [items, assignments]);
  const saveSplitToHistory = useCallback((id: string, restaurant: string, count: number, link: string) => {
    setSplitHistory(prev => {
      const next = prev.filter(s => s.id !== id);
      next.unshift({ id, restaurant, date: 'Today', count, link, amount: 0 });
      if (next.length > 10) next.pop();
      localStorage.setItem('wise_splits', JSON.stringify(next));
      return next;
    });
  }, []);
  const syncSplitDetails = useCallback(async (splitId: string) => {
    try {
      const data = await api.getSplitDetail(splitId);
      setActiveSplitName(data.split.restaurant || data.split.name);
      const subtotal = data.split.total_amount - data.split.tax - data.split.tip;
      setTaxRate(data.split.tax / Math.max(1, subtotal) || 0.08);
      setTipRate(data.split.tip / Math.max(1, subtotal) || 0.10);
      const mappedPeople = data.participants.map((p, idx) => ({
        id: idx, apiId: p.id, name: p.name, emoji: p.emoji, color: colors[idx % colors.length], upi: p.upi_id,
      }));
      setPeople(mappedPeople);
      setItems(data.items.map(item => ({ id: item.id, name: item.name, price: item.price, qty: item.quantity, emoji: item.emoji })));
      const mappedAssignments: Record<string, number[]> = {};
      data.assignments.forEach(asg => {
        if (!mappedAssignments[asg.item_id]) mappedAssignments[asg.item_id] = [];
        const personIdx = mappedPeople.findIndex(p => p.apiId === asg.participant_id);
        if (personIdx !== -1) mappedAssignments[asg.item_id].push(personIdx);
      });
      setAssignments(mappedAssignments);
      setIsUsingCache(false);
      cacheSplitData({
        splitId,
        split: { id: splitId, name: data.split.name, restaurant: data.split.restaurant, total_amount: data.split.total_amount, tax: data.split.tax, tip: data.split.tip },
        participants: data.participants,
        items: data.items,
        assignments: data.assignments,
        cachedAt: Date.now(),
      });
    } catch (e) {
      console.warn('Sync failed:', e);
      const cached = await getCachedSplitData(splitId);
      if (cached) {
        setIsUsingCache(true);
        setActiveSplitName(cached.split.restaurant || cached.split.name);
        const subtotal = cached.split.total_amount - cached.split.tax - cached.split.tip;
        setTaxRate(cached.split.tax / Math.max(1, subtotal) || 0.08);
        setTipRate(cached.split.tip / Math.max(1, subtotal) || 0.10);
        const mappedPeople = cached.participants.map((p, idx) => ({
          id: idx, apiId: p.id, name: p.name, emoji: p.emoji, color: colors[idx % colors.length], upi: p.upi_id,
        }));
        setPeople(mappedPeople);
        setItems(cached.items.map(item => ({ id: item.id, name: item.name, price: item.price, qty: item.quantity, emoji: item.emoji })));
        const mappedAssignments: Record<string, number[]> = {};
        cached.assignments.forEach(asg => {
          if (!mappedAssignments[asg.item_id]) mappedAssignments[asg.item_id] = [];
          const personIdx = mappedPeople.findIndex(p => p.apiId === asg.participant_id);
          if (personIdx !== -1) mappedAssignments[asg.item_id].push(personIdx);
        });
        setAssignments(mappedAssignments);
      }
    }
  }, [api]);
  useEffect(() => { api.checkHealth().then(setBackendOnline); }, [api]);
  const [tokenRevealShown, setTokenRevealShown] = useState(false);
  const [tokenRevealData, setTokenRevealData] = useState<{ token: string; splitId: string; guestLink: string } | null>(null);

  useLayoutEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#owner=')) {
      const token = hash.slice(7);
      if (token) {
        setActiveOwnerToken(token);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, []);

  useEffect(() => {
    const pathId = extractSplitId(location.pathname);
    if (pathId && pathId !== 'new' && pathId !== activeSplitId && backendOnline) {
      setActiveSplitId(pathId);
      const stored = localStorage.getItem(`wise_owner_${pathId}`);
      if (stored) {
        try {
          const { token, created_at } = JSON.parse(stored);
          const age = Date.now() - new Date(created_at).getTime();
          if (age < 7 * 24 * 60 * 60 * 1000) {
            setActiveOwnerToken(token);
          } else {
            localStorage.removeItem(`wise_owner_${pathId}`);
          }
        } catch { /* ignore */ }
      }
      syncSplitDetails(pathId);
    }
  }, [location.pathname, backendOnline]);
  useEffect(() => {
    if (!backendOnline || !activeSplitId) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      return;
    }
    let reconnectDelay = 1000;
    let reconnectTimer: number | null = null;
    let disposed = false;

    function connect() {
      if (disposed || !activeSplitId) return;
      const splitId = activeSplitId;
      setWsStatus('connecting');
      const ws = new WebSocket(`${WS_BASE}/ws/${splitId}`);
      wsRef.current = ws;

      ws.onopen = () => { reconnectDelay = 1000; setWsStatus('connected'); };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'receipt_parsed') {
            showToast('AI parsed receipt items!');
            if (data.restaurant) setActiveSplitName(data.restaurant);
            await syncSplitDetails(splitId);
            navigate(`/split/${splitId}/assign`);
          } else if (data.type === 'item_assigned') {
            setAssignments(prev => {
              const next = { ...prev };
              next[data.item_id] = (data.participant_ids as string[]).map(pid => peopleRef.current.findIndex(p => p.apiId === pid)).filter(i => i !== -1);
              return next;
            });
          } else if (data.type === 'item_added') {
            const item = data.item;
            setItems(prev => prev.some(it => it.id === item.id) ? prev : [...prev, { id: item.id, name: item.name, price: item.price, qty: item.quantity, emoji: item.emoji }]);
            showToast(`New item added: ${item.name}`);
          } else if (data.type === 'item_edited') {
            setItems(prev => prev.map(it => it.id === data.item_id ? { ...it, name: data.name, price: data.price } : it));
          } else if (data.type === 'item_deleted') {
            setItems(prev => prev.filter(it => it.id !== data.item_id));
            setAssignments(prev => { const next = { ...prev }; delete next[data.item_id]; return next; });
          } else if (data.type === 'split_updated') {
            if (data.restaurant) setActiveSplitName(data.restaurant);
            await syncSplitDetails(splitId);
          } else if (data.type === 'guest_paying') {
            showToast(`${data.guest_name} paid ₹${(data.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
            try {
              const pmts = await api.getPayments(splitId);
              setPayments(pmts);
            } catch { /* ignore */ }
          } else if (data.type === 'payment_confirmed') {
            showToast('Payment confirmed!');
            try {
              const pmts = await api.getPayments(splitId);
              setPayments(pmts);
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (disposed) return;
        setWsStatus('disconnected');
        const delay = Math.min(reconnectDelay, 30000);
        console.log(`WS closed, reconnecting in ${delay}ms`);
        reconnectTimer = window.setTimeout(() => { reconnectDelay *= 2; connect(); }, delay);
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [backendOnline, activeSplitId, syncSplitDetails, navigate, showToast]);
  const runMockScanner = useCallback(() => {
    showToast('Demo Mode: Simulating receipt parsing...');
    setPStep(1);
    navigate(`/split/${activeSplitId || 'demo'}/processing`);
    const mockItems = ((): { name: string; price: number; emoji: string }[] => {
      const rest = (activeSplitName || '').toLowerCase();
      if (rest.includes('pizza')) return [{ name: 'Pepperoni Pizza', price: 90000, emoji: '' }, { name: 'Garlic Bread', price: 30000, emoji: '' }, { name: 'Salad', price: 45000, emoji: '' }, { name: 'Cola', price: 20000, emoji: '' }];
      if (rest.includes('coffee') || rest.includes('cafe')) return [{ name: 'Latte', price: 28000, emoji: '' }, { name: 'Croissant', price: 18000, emoji: '' }, { name: 'Avocado Toast', price: 42000, emoji: '' }];
      return [{ name: 'Chef Special', price: 140000, emoji: '' }, { name: 'Appetizer', price: 80000, emoji: '' }, { name: 'Salad', price: 40000, emoji: '' }, { name: 'Wine', price: 65000, emoji: '' }, { name: 'Soda', price: 15000, emoji: '' }];
    })();
    setTaxRate(0.08); setTipRate(0.10);
    const mapped = mockItems.map((item, idx) => ({ id: 'mock_' + idx, ...item, qty: 1 }));
    setItems(mapped);
    const a: Record<string, number[]> = {};
    mapped.forEach(it => { a[it.id] = [0]; });
    setAssignments(a);
    setTimeout(() => { setPStep(2); setFoundItemsCount(mapped.length); }, 1000);
    setTimeout(() => setPStep(3), 2000);
    setTimeout(() => { setPStep(4); setTimeout(() => navigate(`/split/${activeSplitId || 'demo'}/assign`), 800); }, 3000);
  }, [activeSplitName, activeSplitId, navigate, showToast]);
  const handleCreateSplit = useCallback(async (method: 'scan' | 'manual') => {
    const hostName = (localStorage.getItem('wise_host_name') || 'You').trim();
    const hostUpi = (localStorage.getItem('wise_host_upi') || '').trim();
    const restName = activeSplitName || 'Custom Split';
    const initialPeople: Person[] = [{ id: 0, name: hostName, emoji: '', color: colors[0], upi: hostUpi || null }];
    setPeople(initialPeople); setActiveSplitName(restName); setItems([]); setAssignments({}); setSelectedPerson(0);
    if (backendOnline) {
      try {
        const data = await api.createSplit({ name: restName, restaurant: restName, participants: initialPeople.map(p => ({ name: p.name, emoji: p.emoji, upi_id: p.upi })) });
        setActiveSplitId(data.split_id); setActiveGuestToken(data.guest_token); setActiveOwnerToken(data.owner_token);
        localStorage.setItem(`wise_owner_${data.split_id}`, JSON.stringify({ token: data.owner_token, created_at: data.token_created_at }));
        window.location.hash = `owner=${data.owner_token}`;
        saveSplitToHistory(data.split_id, restName, initialPeople.length, data.guest_link);
        setTokenRevealData({ token: data.owner_token, splitId: data.split_id, guestLink: `${FRONTEND_BASE}/guest/${data.guest_token}` });
        setTokenRevealShown(true);
        await syncSplitDetails(data.split_id);
        navigate(method === 'scan' ? `/split/${data.split_id}/receipt` : `/split/${data.split_id}/assign`);
        return;
      } catch (e) { console.warn('Backend create failed:', e); }
    }
    const demoId = 'demo_' + Date.now();
    setActiveSplitId(demoId);
    navigate(method === 'scan' ? `/split/${demoId}/receipt` : `/split/${demoId}/assign`);
  }, [backendOnline, activeSplitName, api, saveSplitToHistory, syncSplitDetails, navigate]);
  const handleUploadReceipt = useCallback(async (file: File) => {
    if (!backendOnline || !activeSplitId || !activeOwnerToken) { runMockScanner(); return; }
    setPStep(1); navigate(`/split/${activeSplitId}/processing`);
    try {
      const data = await api.uploadReceipt(activeSplitId, activeOwnerToken, file);
      setPStep(2); setFoundItemsCount(data.items.length);
      setTimeout(() => setPStep(3), 600); setTimeout(() => setPStep(4), 1200);
      await syncSplitDetails(activeSplitId);
      setTimeout(() => navigate(`/split/${activeSplitId}/assign`), 1800);
    } catch (e: any) { showToast(`Upload failed: ${e.message}`); runMockScanner(); }
  }, [backendOnline, activeSplitId, activeOwnerToken, api, syncSplitDetails, navigate, showToast, runMockScanner]);
  const handleToggleAssignment = useCallback(async (itemId: string) => {
    let nextAssigned: number[] = [];
    setAssignments(prev => {
      const next = { ...prev }; const arr = next[itemId] || []; const idx = arr.indexOf(selectedPerson);
      next[itemId] = idx > -1 ? arr.filter(x => x !== selectedPerson) : [...arr, selectedPerson];
      nextAssigned = next[itemId]; return next;
    });
    if (backendOnline && activeSplitId && activeOwnerToken) {
      const backendIds = nextAssigned.map(i => people[i]?.apiId).filter(Boolean) as string[];
      try { await api.assignItem(activeSplitId, itemId, activeOwnerToken, backendIds); } catch {
        if (isOffline) {
          addPendingOp({ type: 'assign_item', splitId: activeSplitId, ownerToken: activeOwnerToken, payload: { itemId, participantIds: backendIds } });
          setPendingCount(p => p + 1);
        }
      }
    } else if (isOffline && activeSplitId && activeOwnerToken) {
      const backendIds = nextAssigned.map(i => people[i]?.apiId).filter(Boolean) as string[];
      addPendingOp({ type: 'assign_item', splitId: activeSplitId, ownerToken: activeOwnerToken, payload: { itemId, participantIds: backendIds } });
      setPendingCount(p => p + 1);
    }
  }, [selectedPerson, backendOnline, activeSplitId, activeOwnerToken, people, api, isOffline, setPendingCount]);
  const handleAddItem = useCallback(async (name: string, price: number) => {
    const itemId = 'item_' + Date.now();
    setItems(prev => [...prev, { id: itemId, name, price: price * 100, qty: 1, emoji: '' }]);
    setAssignments(prev => ({ ...prev, [itemId]: [0] }));
    showToast(`Added ${name}`);
    if (backendOnline && activeSplitId && activeOwnerToken) {
      try {
        const data = await api.addItem(activeSplitId, activeOwnerToken, { name, price: price * 100, quantity: 1, emoji: '' });
        setItems(prev => prev.map(it => it.id === itemId ? { ...it, id: data.item_id } : it));
        setAssignments(prev => { const next = { ...prev }; next[data.item_id] = [0]; delete next[itemId]; return next; });
        if (people[0]?.apiId) await api.assignItem(activeSplitId, data.item_id, activeOwnerToken, [people[0].apiId]);
      } catch { /* ignore */ }
    }
  }, [backendOnline, activeSplitId, activeOwnerToken, people, api, showToast]);
  const handleEditItem = useCallback(async (itemId: string, name: string, price: number) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, name, price: price * 100 } : it));
    showToast('Item updated');
    if (backendOnline && activeSplitId && activeOwnerToken) {
      try { await api.editItem(activeSplitId, itemId, activeOwnerToken, { name, price: price * 100 }); } catch {
        if (isOffline) {
          addPendingOp({ type: 'edit_item', splitId: activeSplitId, ownerToken: activeOwnerToken, payload: { itemId, name, price: price * 100 } });
          setPendingCount(p => p + 1);
        }
      }
    } else if (isOffline && activeSplitId && activeOwnerToken) {
      addPendingOp({ type: 'edit_item', splitId: activeSplitId, ownerToken: activeOwnerToken, payload: { itemId, name, price: price * 100 } });
      setPendingCount(p => p + 1);
    }
  }, [backendOnline, activeSplitId, activeOwnerToken, api, showToast, isOffline, setPendingCount]);
  const handleDeleteItem = useCallback(async (itemId: string) => {
    const item = items.find(it => it.id === itemId);
    setItems(prev => prev.filter(it => it.id !== itemId));
    setAssignments(prev => { const next = { ...prev }; delete next[itemId]; return next; });
    if (item) showToast(`Deleted ${item.name}`);
    if (backendOnline && activeSplitId && activeOwnerToken) {
      try { await api.deleteItem(activeSplitId, itemId, activeOwnerToken); } catch { /* ignore */ }
    }
  }, [items, backendOnline, activeSplitId, activeOwnerToken, api, showToast]);
  const handleEditRestaurant = useCallback(async (newName: string) => {
    if (!newName.trim()) return;
    setActiveSplitName(newName.trim());
    showToast(`Title updated to ${newName.trim()}`);
    if (backendOnline && activeSplitId && activeOwnerToken) {
      try { await api.updateSplit(activeSplitId, activeOwnerToken, { restaurant: newName.trim() }); } catch { /* ignore */ }
    }
  }, [backendOnline, activeSplitId, activeOwnerToken, api, showToast]);
  const handleConfirmTaxTip = useCallback(async (tax: number, tip: number) => {
    if (!isNaN(tax)) setTaxRate(tax);
    if (!isNaN(tip)) setTipRate(tip);
    setTaxTipModalOpen(false);
    showToast('Tax & tip updated');
    if (backendOnline && activeSplitId && activeOwnerToken) {
      try { await api.updateSplit(activeSplitId, activeOwnerToken, { restaurant: activeSplitName, tax: Math.round(billSubtotal * tax), tip: Math.round(billSubtotal * tip) }); } catch { /* ignore */ }
    }
  }, [billSubtotal, activeSplitName, backendOnline, activeSplitId, activeOwnerToken, api, showToast]);
  const handleTriggerUPI = useCallback((personId: number, amount: number) => {
    const person = people[personId]; if (!person) return;
    const host = people[0]; const hostUpiId = host?.upi || '';
    if (hostUpiId) {
      openUpiDeeplink(`upi://pay?pa=${encodeURIComponent(hostUpiId)}&pn=${encodeURIComponent(host.name)}&am=${(amount / 100).toFixed(2)}&tn=${encodeURIComponent(activeSplitName)}&cu=INR`);
      showToast(`Opening UPI for ${person.name}`);
    } else showToast('No UPI ID set for host');
  }, [people, activeSplitName, showToast]);
  const fetchSettlements = useCallback(async () => {
    if (!backendOnline || !activeSplitId) return;
    setSettlementsLoading(true);
    try { const r = await fetch(`/api/splits/${activeSplitId}/settle`); if (r.ok) { const d = await r.json(); setSettlements(d.transactions); } } catch { /* ignore */ }
    finally { setSettlementsLoading(false); }
  }, [backendOnline, activeSplitId]);
  const loadHistorySplit = useCallback(async (id: string) => {
    setActiveSplitId(id);
    try {
      const stored = localStorage.getItem(`wise_owner_${id}`);
      if (stored) {
        const { token, created_at } = JSON.parse(stored);
        const age = Date.now() - new Date(created_at).getTime();
        if (age < 7 * 24 * 60 * 60 * 1000) {
          setActiveOwnerToken(token);
        } else {
          localStorage.removeItem(`wise_owner_${id}`);
          showToast('Owner token expired (7 days). Enter token to regain access.');
        }
      }
    } catch { /* ignore */ }
    if (backendOnline) { showToast('Loading split...'); await syncSplitDetails(id); navigate(`/split/${id}/assign`); }
    else showToast('Offline: Cannot load split.');
  }, [backendOnline, syncSplitDetails, navigate, showToast]);
  const handleRecoverToken = useCallback((token: string) => {
    setActiveOwnerToken(token);
    if (activeSplitId) {
      localStorage.setItem(`wise_owner_${activeSplitId}`, JSON.stringify({ token, created_at: new Date().toISOString() }));
    }
    showToast('Owner token restored');
  }, [activeSplitId, showToast]);
  const handleBack = useCallback(() => navigate(-1), [navigate]);
  const handleConfirmPayment = useCallback(async (paymentId: string) => {
    if (activeGuestToken && activeSplitId) {
      try { await api.confirmPayment(activeSplitId, paymentId, activeGuestToken); showToast('Payment confirmed!'); } catch { showToast('Failed to confirm payment'); }
    }
  }, [activeGuestToken, activeSplitId, api, showToast]);
  if (!hasLaunched) {
    return (
      <div className="shell">
        <div className="phone" id="phone">
          <div className="island" />
          <OnboardingScreen onDone={() => { localStorage.setItem('wise_hasLaunched', '1'); setHasLaunched(true); }} />
          <Toast message={toastMsg} />
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="phone" id="phone">
        <div className="island" />
        <div className="status">
          <span className="status-time">{new Date().getHours().toString().padStart(2, '0')}:{new Date().getMinutes().toString().padStart(2, '0')}</span>
          <div className="status-icons">
            <div className={`ws-badge ${wsStatus}`} title={wsStatus === 'connected' ? 'WebSocket connected' : wsStatus === 'connecting' ? 'Reconnecting...' : 'WebSocket disconnected'}>
              <span className={`ws-badge-dot ${wsStatus}`} />
            </div>
            <svg width="25" height="12" viewBox="0 0 25 12" fill="white"><rect x="0" y="1" width="22" height="10" rx="3" stroke="white" strokeWidth="1" fill="none" opacity=".35" /><rect x="23" y="4" width="2" height="4" rx="1" opacity=".35" /><rect x="1" y="2" width="18" height="8" rx="2" fill="white" /></svg>
            <button
              className="theme-toggle"
              onClick={() => setIsDark(prev => !prev)}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? '☀' : '☾'}
            </button>
          </div>
        </div>
        <div id="backend-indicator" className={backendOnline ? 'backend-badge online' : 'backend-badge offline'}>
          <span className={backendOnline ? 'backend-badge-dot online' : 'backend-badge-dot offline'} />
          {backendOnline ? 'Live API' : 'Demo Mode'}
        </div>
        {(isOffline || isUsingCache) && (
          <div className="offline-banner" role="alert">
            Offline — showing cached data{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
          </div>
        )}
        <div className="screens">
          <Routes>
            <Route path="/" element={<HomeScreen splitHistory={splitHistory} onNewSplit={() => navigate('/split/new')} onLoadSplit={loadHistorySplit} onHistory={() => navigate('/history')} showToast={showToast} />} />
            <Route path="/split/new" element={<CreateSplit onConfirm={handleCreateSplit} onBack={handleBack} />} />
            <Route path="/split/:id/receipt" element={<ReceiptUpload activeSplitName={activeSplitName} onBack={handleBack} onFileSelect={handleUploadReceipt} onMockScan={runMockScanner} />} />
            <Route path="/split/:id/processing" element={<ProcessingScreen step={pStep} foundItemsCount={foundItemsCount} totalItems={items.length} />} />
            <Route path="/split/:id/assign" element={<ItemAssignment items={items} people={people} assignments={assignments} selectedPerson={selectedPerson} activeSplitName={activeSplitName} currentTab={currentTab} hasOwnerToken={!!activeOwnerToken} onSelectPerson={setSelectedPerson} onSetTab={setCurrentTab} onToggleAssignment={handleToggleAssignment} onEditItem={handleEditItem} onDeleteItem={handleDeleteItem} onAddItem={handleAddItem} onEditRestaurant={handleEditRestaurant} onRecoverToken={handleRecoverToken} onDone={() => navigate(`/split/${activeSplitId}/summary`)} onBack={handleBack} onGoToSetup={() => navigate('/split/new')} mySubtotal={mySubtotal} billSubtotal={billSubtotal} />} />
            <Route path="/split/:id/summary" element={<SplitSummary people={people} items={items} assignments={assignments} activeSplitName={activeSplitName} taxRate={taxRate} tipRate={tipRate} activeGuestToken={activeGuestToken} hasOwnerToken={!!activeOwnerToken} backendOnline={backendOnline} settlements={settlements} settlementsLoading={settlementsLoading} payments={payments} onBack={handleBack} onTriggerUPI={handleTriggerUPI} onFetchSettlements={fetchSettlements} onEditTaxTip={() => setTaxTipModalOpen(true)} onRecoverToken={handleRecoverToken} onConfirmPayment={handleConfirmPayment} showToast={showToast} billSubtotal={billSubtotal} />} />
            <Route path="/history" element={<HistoryScreen history={splitHistory} onBack={handleBack} onLoadSplit={loadHistorySplit} />} />
            <Route path="/guest/:token" element={<GuestWrapper showToast={showToast} onBack={() => navigate('/')} />} />
          </Routes>
        </div>
        <Toast message={toastMsg} />
        <TaxTipModal open={taxTipModalOpen} taxRate={taxRate} tipRate={tipRate} onClose={() => setTaxTipModalOpen(false)} onConfirm={handleConfirmTaxTip} />

        {tokenRevealShown && tokenRevealData && (
          <div className="modal-backdrop open" onClick={e => { if (e.target === e.currentTarget) { setTokenRevealShown(false); navigate(`/split/${tokenRevealData.splitId}/receipt`); } }}>
            <div className="token-reveal-sheet">
              <div className="modal-handle" />
              <div className="token-reveal-body">
                <div className="token-reveal-title">Split Created!</div>
                <div className="token-reveal-desc">Save this owner token to manage your split. It won't be shown again.</div>

                <div className="token-reveal-token-box">
                  {tokenRevealData.token}
                </div>

                <button className="btn btn-primary token-reveal-copy-btn" onClick={() => {
                  navigator.clipboard.writeText(tokenRevealData.token).catch(() => {});
                  showToast('Owner token copied!');
                }}>Copy Owner Token</button>

                <div className="token-reveal-link-hint">Or share this link (encodes token in URL):</div>

                <div className="token-reveal-link-box">
                  <span className="token-reveal-link-text">
                    {`${tokenRevealData.guestLink}#owner=${tokenRevealData.token}`}
                  </span>
                  <button className="token-reveal-link-copy" onClick={() => {
                    navigator.clipboard.writeText(`${tokenRevealData.guestLink}#owner=${tokenRevealData.token}`).catch(() => {});
                    showToast('Link with token copied!');
                  }}>Copy Link</button>
                </div>

                <button className="btn btn-green token-reveal-continue-btn" onClick={() => {
                  setTokenRevealShown(false);
                  navigate(`/split/${tokenRevealData.splitId}/receipt`);
                }}>Continue to Upload</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}
