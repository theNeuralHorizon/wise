import React, { useState, useEffect, useRef, useMemo } from 'react';

// ── TYPES & INTERFACES ────────────────────────────────────────────────────────
interface Item {
  id: string;
  name: string;
  price: number;
  qty: number;
  emoji: string;
}

interface Person {
  id: number;
  apiId?: string;
  name: string;
  emoji: string;
  color: string;
  upi: string | null;
}

interface FriendInput {
  name: string;
  emoji: string;
  upi: string;
}

interface SplitHistoryItem {
  id: string;
  restaurant: string;
  date: string;
  count: number;
  link: string;
  amount: number;
}

const colors = [
  'rgba(124,111,255,0.18)',
  'rgba(255,170,80,0.18)',
  'rgba(96,165,250,0.18)',
  'rgba(248,113,113,0.18)',
  'rgba(34,211,163,0.18)',
  'rgba(245,158,11,0.18)'
];

const API_BASE = 'http://localhost:8081/api';
const WS_BASE  = 'ws://localhost:8081/api';

export default function App() {
  // ── ROUTING & HISTORY ────────────────────────────────────────────────────────
  const [activeScreen, setActiveScreen] = useState<string>('home');
  const [historyStack, setHistoryStack] = useState<string[]>(['home']);

  const goTo = (screenId: string) => {
    setActiveScreen(screenId);
    setHistoryStack(prev => [...prev, screenId]);
  };

  const goBack = () => {
    if (historyStack.length <= 1) return;
    const newStack = historyStack.slice(0, -1);
    setHistoryStack(newStack);
    setActiveScreen(newStack[newStack.length - 1]);
  };

  // ── CORE DATA STATES ──────────────────────────────────────────────────────────
  const [items, setItems] = useState<Item[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number[]>>({});
  const [selectedPerson, setSelectedPerson] = useState<number>(0);
  const [currentTab, setCurrentTab] = useState<'all' | 'you' | 'unassigned'>('all');
  const [guestSelectedItems, setGuestSelectedItems] = useState<Set<string>>(new Set());

  // Dynamic split configuration
  const [activeSplitName, setActiveSplitName] = useState<string>('');
  const [taxRate, setTaxRate] = useState<number>(0.08);
  const [tipRate, setTipRate] = useState<number>(0.10);

  // Setup form states
  const [hostName, setHostName] = useState<string>(() => localStorage.getItem('wise_host_name') || '');
  const [hostUpi, setHostUpi] = useState<string>(() => localStorage.getItem('wise_host_upi') || '');
  const [restaurantName, setRestaurantName] = useState<string>('');
  const [setupFriends, setSetupFriends] = useState<FriendInput[]>([
    { name: 'Loren', emoji: '🧑', upi: 'loren@ybl' },
    { name: 'Anthony', emoji: '👦', upi: 'anthony@okicici' },
    { name: 'Sara', emoji: '👩', upi: 'sara@paytm' }
  ]);

  // Backend Integration States
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [activeSplitId, setActiveSplitId] = useState<string | null>(null);
  const [activeGuestToken, setActiveGuestToken] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  
  // Local History Cache
  const [splitHistory, setSplitHistory] = useState<SplitHistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('wise_splits') || '[]');
    } catch {
      return [];
    }
  });

  // UI state variables
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confettiActive, setConfettiActive] = useState<boolean>(false);
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);
  const [paymentProcessing, setPaymentProcessing] = useState<boolean>(false);
  const [clockTime, setClockTime] = useState<string>('9:41');
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState<string>('');
  const [selectedPayMethod, setSelectedPayMethod] = useState<'upi' | 'card'>('upi');

  // Processing screen indicators
  const [pStep, setPStep] = useState<number>(1); // 1 to 4 steps
  const [foundItemsCount, setFoundItemsCount] = useState<number>(0);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // ── SYNC LOGS & TOAST ─────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastMsg(null), 2800);
  };

  // ── DETECT BACKEND ON LOAD ──────────────────────────────────────────────────
  useEffect(() => {
    async function detect() {
      try {
        const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(1500) });
        if (r.ok) {
          setBackendOnline(true);
        } else {
          setBackendOnline(false);
        }
      } catch {
        setBackendOnline(false);
      }
    }
    detect();
    const interval = setInterval(detect, 8000);
    return () => clearInterval(interval);
  }, []);

  // Update Clock Time
  useEffect(() => {
    function update() {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, '0');
      const m = now.getMinutes().toString().padStart(2, '0');
      setClockTime(`${h}:${m}`);
    }
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── WEBSOCKET CONNECTION MANAGER ──────────────────────────────────────────────
  useEffect(() => {
    if (!backendOnline || !activeSplitId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    const wsUrl = `${WS_BASE.replace('http', 'ws')}/ws/${activeSplitId}`;
    console.log("[WS] Connecting to:", wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connection established!");
      setWsConnected(true);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[WS] Message received:", data);

        if (data.type === 'receipt_parsed') {
          showToast("AI parsed receipt items! ✨");
          if (data.restaurant) {
            setActiveSplitName(data.restaurant);
          }
          await syncSplitDetails(activeSplitId);
          goTo('items');
        } else if (data.type === 'item_assigned') {
          const itemId = data.item_id;
          const participantIds = data.participant_ids as string[];
          
          setAssignments(prev => {
            const next = { ...prev };
            // Find local index for each backend participant ID
            next[itemId] = participantIds
              .map(pid => people.findIndex(p => p.apiId === pid))
              .filter(idx => idx !== -1);
            return next;
          });
        } else if (data.type === 'guest_paying') {
          showToast(`Guest "${data.guest_name}" paid ₹${data.amount.toLocaleString('en-IN')}! 💸`);
          // Trigger dynamic recalculations if active
        }
      } catch (e) {
        console.warn("[WS] Failed to parse websocket message:", e);
      }
    };

    ws.onclose = () => {
      console.log("[WS] Connection closed.");
      setWsConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [backendOnline, activeSplitId, people]);

  // Sync split details helper
  async function syncSplitDetails(splitId: string) {
    if (!backendOnline) return;
    try {
      const r = await fetch(`${API_BASE}/splits/${splitId}`);
      if (r.ok) {
        const data = await r.json();
        
        setActiveSplitName(data.split.restaurant || data.split.name);
        
        const subtotal = data.split.total_amount - data.split.tax - data.split.tip;
        setTaxRate(data.split.tax / Math.max(1, subtotal) || 0.08);
        setTipRate(data.split.tip / Math.max(1, subtotal) || 0.10);

        // Map backend participants to local states
        const mappedPeople = data.participants.map((p: any, idx: number) => ({
          id: idx,
          apiId: p.id,
          name: p.name,
          emoji: p.emoji,
          color: colors[idx % colors.length],
          upi: p.upi_id
        }));
        setPeople(mappedPeople);

        // Map backend items to local states
        const mappedItems = data.items.map((item: any) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          qty: item.quantity,
          emoji: item.emoji
        }));
        setItems(mappedItems);

        // Map backend assignments
        const mappedAssignments: Record<string, number[]> = {};
        data.assignments.forEach((asg: any) => {
          if (!mappedAssignments[asg.item_id]) mappedAssignments[asg.item_id] = [];
          const personIdx = mappedPeople.findIndex((p: any) => p.apiId === asg.participant_id);
          if (personIdx !== -1) {
            mappedAssignments[asg.item_id].push(personIdx);
          }
        });
        setAssignments(mappedAssignments);
      }
    } catch (e) {
      console.warn("Error synchronizing split details:", e);
    }
  }

  // ── ACTIONS ──────────────────────────────────────────────────────────────────
  
  // Create Split Setup
  const handleConfirmSplitSetup = async (method: 'scan' | 'manual') => {
    const trimmedHostName = hostName.trim() || 'You';
    const trimmedHostUpi = hostUpi.trim() || '';
    const trimmedRestName = restaurantName.trim() || 'Custom Split';

    localStorage.setItem('wise_host_name', trimmedHostName);
    localStorage.setItem('wise_host_upi', trimmedHostUpi);

    // Initial people local array
    const initialPeople: Person[] = [
      { id: 0, name: trimmedHostName, emoji: '😎', color: colors[0], upi: trimmedHostUpi || null }
    ];

    setupFriends.forEach((f, idx) => {
      if (f.name.trim()) {
        initialPeople.push({
          id: idx + 1,
          name: f.name.trim(),
          emoji: f.emoji.trim() || '😊',
          color: colors[(idx + 1) % colors.length],
          upi: f.upi.trim() || null
        });
      }
    });

    setPeople(initialPeople);
    setActiveSplitName(trimmedRestName);
    setItems([]);
    setAssignments({});
    setSelectedPerson(0);

    if (backendOnline) {
      showToast("Initializing split on server…");
      const payload = {
        name: trimmedRestName,
        restaurant: trimmedRestName,
        participants: initialPeople.map(p => ({
          name: p.name,
          emoji: p.emoji,
          upi_id: p.upi
        }))
      };

      try {
        const resp = await fetch(`${API_BASE}/splits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const data = await resp.json();
          setActiveSplitId(data.split_id);
          setActiveGuestToken(data.guest_token);

          // Update local history
          saveSplitToHistory(data.split_id, trimmedRestName, initialPeople.length, data.guest_link);

          // Fetch detail to sync database IDs
          await syncSplitDetails(data.split_id);
        }
      } catch (e) {
        console.warn("Backend split initiation failed, falling back to local simulation:", e);
      }
    }

    if (method === 'scan') {
      goTo('scan');
    } else {
      goTo('items');
    }
  };

  const saveSplitToHistory = (id: string, restaurant: string, count: number, link: string) => {
    setSplitHistory(prev => {
      const next = prev.filter(s => s.id !== id);
      next.unshift({
        id,
        restaurant,
        date: 'Today',
        count,
        link,
        amount: 0
      });
      if (next.length > 10) next.pop();
      localStorage.setItem('wise_splits', JSON.stringify(next));
      return next;
    });
  };

  const updateSplitAmountInHistory = (id: string, amount: number) => {
    setSplitHistory(prev => {
      const next = prev.map(s => {
        if (s.id === id) {
          return { ...s, amount: Math.round(amount) };
        }
        return s;
      });
      localStorage.setItem('wise_splits', JSON.stringify(next));
      return next;
    });
  };

  const handleLoadHistorySplit = async (id: string) => {
    setActiveSplitId(id);
    if (backendOnline) {
      showToast("Loading split from backend...");
      await syncSplitDetails(id);
      goTo('items');
    } else {
      showToast("Offline: Cannot load split.");
    }
  };

  // Setup Friends Rows Add/Remove
  const addSetupFriendRow = () => {
    const emojis = ['🧑', '👦', '👩', '👨', '👧', '👵', '👴', '🦊', '🦁', '🐼'];
    setSetupFriends(prev => [
      ...prev,
      {
        name: `Friend ${prev.length + 1}`,
        emoji: emojis[prev.length % emojis.length],
        upi: ''
      }
    ]);
  };

  const removeSetupFriend = (idx: number) => {
    setSetupFriends(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSetupFriend = (idx: number, key: keyof FriendInput, value: string) => {
    setSetupFriends(prev => prev.map((f, i) => {
      if (i === idx) {
        return { ...f, [key]: value };
      }
      return f;
    }));
  };

  // Shutter/Gallery Upload triggers
  const triggerFileSelect = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadReceiptFile(file);
    }
  };

  // Dynamic Mock scan fallback generator
  const runMockScanner = () => {
    showToast("Demo Mode: Simulating receipt parsing...");
    setPStep(1);
    goTo('processing');

    const restName = activeSplitName || "Meal Split";
    
    // Custom simulated items based on restaurant name
    const mockItems = generateMockItems(restName);
    
    setTaxRate(0.08);
    setTipRate(0.10);

    const mappedItems: Item[] = mockItems.map((item, idx) => ({
      id: 'mock_item_' + idx,
      name: item.name,
      price: item.price,
      qty: 1,
      emoji: item.emoji
    }));

    setItems(mappedItems);

    // Default assign to Host (index 0)
    const initialAsg: Record<string, number[]> = {};
    mappedItems.forEach(it => {
      initialAsg[it.id] = [0];
    });
    setAssignments(initialAsg);

    // Mock progress steps
    setTimeout(() => {
      setPStep(2);
      setFoundItemsCount(mappedItems.length);
    }, 1000);

    setTimeout(() => {
      setPStep(3);
    }, 2000);

    setTimeout(() => {
      setPStep(4);
      const sub = mappedItems.reduce((s, i) => s + i.price, 0);
      const total = sub * 1.18;
      updateSplitAmountInHistory(activeSplitId || 'demo', total);
      setTimeout(() => goTo('items'), 800);
    }, 3000);
  };

  const generateMockItems = (restaurant: string) => {
    const rest = (restaurant || '').toLowerCase();
    if (rest.includes('pizza') || rest.includes('hut') || rest.includes('slice')) {
      return [
        { name: 'Pepperoni Supreme Pizza', price: 900, emoji: '🍕' },
        { name: 'Cheesy Garlic Bread', price: 300, emoji: '🥖' },
        { name: 'Garden Veggie Salad', price: 450, emoji: '🥗' },
        { name: 'Coca Cola Pitcher', price: 200, emoji: '🥤' }
      ];
    } else if (rest.includes('coffee') || rest.includes('cafe') || rest.includes('starbucks') || rest.includes('blue')) {
      return [
        { name: 'Espresso Latte', price: 280, emoji: '☕' },
        { name: 'Butter Croissant', price: 180, emoji: '🥐' },
        { name: 'Avocado Toast', price: 420, emoji: '🥑' },
        { name: 'Iced Matcha Tea', price: 320, emoji: '🍵' }
      ];
    } else if (rest.includes('bbq') || rest.includes('grill') || rest.includes('quarters') || rest.includes('korean')) {
      return [
        { name: 'LA Cut Beef Galbi', price: 2800, emoji: '🥩' },
        { name: 'Spicy Garlic Pork Belly', price: 2200, emoji: '🐷' },
        { name: 'Pork Samgyeopsal', price: 2400, emoji: '🍖' },
        { name: 'Soju Bottle', price: 900, emoji: '🍶' },
        { name: 'Sprite Can', price: 150, emoji: '🥤' }
      ];
    } else {
      return [
        { name: 'Chef Special Entree', price: 1400, emoji: '🍲' },
        { name: 'Signature Appetizer Platter', price: 800, emoji: '🍟' },
        { name: 'Organic Green Salad', price: 400, emoji: '🥗' },
        { name: 'House Red Wine', price: 650, emoji: '🍷' },
        { name: 'Sparkling Soda', price: 150, emoji: '🥤' }
      ];
    }
  };

  // Real Upload API call
  const uploadReceiptFile = async (file: File) => {
    if (!backendOnline || !activeSplitId) {
      runMockScanner();
      return;
    }

    setPStep(1);
    goTo('processing');

    const formData = new FormData();
    formData.append('receipt', file);

    try {
      const resp = await fetch(`${API_BASE}/splits/${activeSplitId}/receipt`, {
        method: 'POST',
        body: formData
      });

      if (resp.ok) {
        const data = await resp.json();
        console.log("[API] Scan successfully parsed:", data);
        
        setPStep(2);
        setFoundItemsCount(data.items.length);

        setTimeout(() => setPStep(3), 600);
        setTimeout(() => setPStep(4), 1200);

        await syncSplitDetails(activeSplitId);
        updateSplitAmountInHistory(activeSplitId, data.totals.total);

        setTimeout(() => goTo('items'), 1800);
      } else {
        const err = await resp.json();
        showToast(`AI Failed: ${err.error || 'Server error'}. Falling back to demo mock.`);
        runMockScanner();
      }
    } catch (e) {
      console.warn("Upload failed. Falling back to mock:", e);
      runMockScanner();
    }
  };

  // Add custom manual item
  const handleAddManualItem = async () => {
    const name = newItemName.trim();
    const price = parseFloat(newItemPrice);

    if (!name || isNaN(price) || price <= 0) {
      showToast("Please enter a valid item name and price!");
      return;
    }

    const itemId = 'item_' + Date.now();
    const emojis = ['🍔', '🍕', '🥗', '🍲', '☕', '🍰', '🥤', '🍟', '🍜', '🍝'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];

    const newItem: Item = {
      id: itemId,
      name,
      price,
      qty: 1,
      emoji
    };

    setItems(prev => [...prev, newItem]);
    setAssignments(prev => {
      const next = { ...prev };
      next[itemId] = [0]; // default assigned to host
      return next;
    });

    setNewItemName('');
    setNewItemPrice('');
    showToast(`Added ${name} ✓`);

    if (backendOnline && activeSplitId) {
      try {
        const resp = await fetch(`${API_BASE}/splits/${activeSplitId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, price, quantity: 1, emoji })
        });
        if (resp.ok) {
          const data = await resp.json();
          // Update item key to backend ID
          setItems(prev => prev.map(it => it.id === itemId ? { ...it, id: data.item_id } : it));
          setAssignments(prev => {
            const next = { ...prev };
            next[data.item_id] = [0];
            delete next[itemId];
            return next;
          });

          // Sync assignment to backend
          const hostApiId = people[0]?.apiId;
          if (hostApiId) {
            await fetch(`${API_BASE}/splits/${activeSplitId}/items/${data.item_id}/assign`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ participant_ids: [hostApiId] })
            });
            // WS Broadcast
            if (wsConnected && wsRef.current) {
              wsRef.current.send(JSON.stringify({
                type: 'item_assigned',
                split_id: activeSplitId,
                item_id: data.item_id,
                participant_ids: [hostApiId]
              }));
            }
          }
        }
      } catch (e) {
        console.warn("Manual item sync failed:", e);
      }
    }
  };

  // Edit custom item name/price
  const handleEditItem = async (itemId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const item = items.find(it => it.id === itemId);
    if (!item) return;

    const newName = prompt("Edit item name:", item.name);
    if (!newName || !newName.trim()) return;

    const newPriceStr = prompt("Edit item price (₹):", String(item.price));
    if (!newPriceStr) return;
    const newPrice = parseFloat(newPriceStr);
    if (isNaN(newPrice) || newPrice <= 0) return;

    setItems(prev => prev.map(it => it.id === itemId ? { ...it, name: newName.trim(), price: newPrice } : it));
    showToast("Item updated ✓");

    if (backendOnline && activeSplitId) {
      try {
        await fetch(`${API_BASE}/splits/${activeSplitId}/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim(), price: newPrice })
        });
      } catch (e) {
        console.warn("Item edit failed:", e);
      }
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const item = items.find(it => it.id === itemId);
    if (!item) return;

    setItems(prev => prev.filter(it => it.id !== itemId));
    setAssignments(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    showToast(`Deleted ${item.name} ✓`);

    if (backendOnline && activeSplitId) {
      try {
        await fetch(`${API_BASE}/splits/${activeSplitId}/items/${itemId}`, {
          method: 'DELETE'
        });
      } catch (e) {
        console.warn("Item deletion failed:", e);
      }
    }
  };

  // Toggle item assignment checks (Host screen)
  const handleToggleItemAssignment = async (itemId: string) => {
    let nextAssigned: number[] = [];
    setAssignments(prev => {
      const next = { ...prev };
      const arr = next[itemId] || [];
      const idx = arr.indexOf(selectedPerson);
      if (idx > -1) {
        next[itemId] = arr.filter(x => x !== selectedPerson);
      } else {
        next[itemId] = [...arr, selectedPerson];
      }
      nextAssigned = next[itemId];
      return next;
    });

    if (backendOnline && activeSplitId) {
      const backendIds = nextAssigned
        .map(idx => people[idx]?.apiId)
        .filter(Boolean) as string[];

      try {
        await fetch(`${API_BASE}/splits/${activeSplitId}/items/${itemId}/assign`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participant_ids: backendIds })
        });
        if (wsConnected && wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'item_assigned',
            split_id: activeSplitId,
            item_id: itemId,
            participant_ids: backendIds
          }));
        }
      } catch (e) {
        console.warn("Assign sync failed:", e);
      }
    }
  };

  // Edit restaurant title
  const handleEditRestaurantName = async () => {
    const newName = prompt("Edit split/restaurant title:", activeSplitName);
    if (newName && newName.trim()) {
      const trimmed = newName.trim();
      setActiveSplitName(trimmed);
      showToast(`Title updated to ${trimmed} ✓`);

      if (backendOnline && activeSplitId) {
        try {
          await fetch(`${API_BASE}/splits/${activeSplitId}/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurant: trimmed, tax: null, tip: null })
          });
        } catch (e) {
          console.warn("Rename split failed:", e);
        }
      }
    }
  };

  // Edit Tax / Tip percentages
  const handleEditTaxTip = () => {
    const newTax = prompt("Enter Tax percentage (e.g. 8 for 8%):", String(taxRate * 100));
    if (newTax !== null) {
      setTaxRate(parseFloat(newTax) / 100);
    }
    const newTip = prompt("Enter Tip percentage (e.g. 10 for 10%):", String(tipRate * 100));
    if (newTip !== null) {
      setTipRate(parseFloat(newTip) / 100);
    }
    showToast("Tax & tip rates updated ✓");

    if (backendOnline && activeSplitId) {
      const billSubtotal = items.reduce((s, i) => s + i.price, 0);
      const taxAbs = billSubtotal * taxRate;
      const tipAbs = billSubtotal * tipRate;
      try {
        fetch(`${API_BASE}/splits/${activeSplitId}/update`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurant: activeSplitName, tax: taxAbs, tip: tipAbs })
        });
      } catch (e) {
        console.warn("Update tax/tip failed:", e);
      }
    }
  };

  // Copy share split link
  const handleCopyLink = () => {
    const link = backendOnline && activeSplitId ? `${API_BASE}/guest/${activeGuestToken}` : 'wise.app/s/demo-link';
    navigator.clipboard.writeText(link).catch(() => {});
    showToast("Link copied to clipboard! 📋");
  };

  // UPI Request triggered
  const handleTriggerUPI = (personId: number, amount: number) => {
    const person = people[personId];
    if (!person) return;
    const host = people[0];
    const hostUpiId = host ? (host.upi || 'host@upi') : 'host@upi';
    const upiLink = `upi://pay?pa=${hostUpiId}&pn=${encodeURIComponent(host ? host.name : 'Wise')}&am=${amount}&tn=${encodeURIComponent(activeSplitName)}`;
    
    console.log("UPI Link:", upiLink);
    showToast(`UPI request sent to ${person.name} for ₹${amount.toLocaleString('en-IN')} 📩`);
  };

  // Inline edit host name
  const editHostNameInline = () => {
    const old = hostName || '';
    const newName = prompt("Enter your name:", old);
    if (newName && newName.trim()) {
      const trimmed = newName.trim();
      setHostName(trimmed);
      localStorage.setItem('wise_host_name', trimmed);
      
      // Also update the host's name in the people array if it exists
      setPeople(prev => {
        if (prev.length > 0) {
          const next = [...prev];
          next[0] = { ...next[0], name: trimmed };
          return next;
        }
        return prev;
      });
      
      showToast(`Name updated to ${trimmed} ✓`);
    }
  };

  // Helper to calculate total for a single person
  const calcPersonTotal = (personId: number) => {
    let subtotal = 0;
    items.forEach(item => {
      const assigned = assignments[item.id] || [];
      if (assigned.includes(personId)) {
        subtotal += item.price / Math.max(1, assigned.length);
      }
    });
    return subtotal;
  };

  // ── GUEST ACTIONS ────────────────────────────────────────────────────────────
  const loadGuestView = async () => {
    if (backendOnline && activeGuestToken) {
      try {
        const resp = await fetch(`${API_BASE}/guest/${activeGuestToken}`);
        if (resp.ok) {
          const data = await resp.json();
          setActiveSplitName(data.restaurant || data.name);
          
          const subtotal = data.total - data.tax - data.tip;
          setTaxRate(data.tax / Math.max(1, subtotal) || 0.08);
          setTipRate(data.tip / Math.max(1, subtotal) || 0.10);

          setItems(data.items.map((item: any) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            qty: item.quantity,
            emoji: item.emoji
          })));
          
          setPeople([
            { id: 0, name: data.host.name, emoji: data.host.emoji, color: colors[0], upi: data.host.upi_id }
          ]);
        }
      } catch (e) {
        console.warn("Guest details fetch failed:", e);
      }
    }
    goTo('guest');
  };

  const handleToggleGuestItem = (itemId: string) => {
    setGuestSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleGoToPayment = () => {
    if (guestTotal <= 0) {
      showToast("Please select at least 1 item to pay!");
      return;
    }
    setPaymentSuccess(false);
    goTo('payment');
  };

  const handleDoPayment = async () => {
    setPaymentProcessing(true);

    if (backendOnline && activeGuestToken) {
      const selectedIds = Array.from(guestSelectedItems);
      try {
        const resp = await fetch(`${API_BASE}/guest/${activeGuestToken}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Guest',
            amount: guestTotal,
            item_ids: selectedIds
          })
        });
        if (resp.ok) {
          const result = await resp.json();
          showToast(`UPI Deeplink: ${result.upi_id} 📱`);
        }
      } catch (e) {
        console.warn("Guest payment failed:", e);
      }
    }

    setTimeout(() => {
      setPaymentProcessing(false);
      setPaymentSuccess(true);
      setConfettiActive(true);
      setTimeout(() => setConfettiActive(false), 4000);
    }, 1200);
  };

  // ── CALCULATIONS (MEMOIZED) ──────────────────────────────────────────────────
  
  // Total owed calculation for balance card
  const totalOwedAmount = useMemo(() => {
    return splitHistory.reduce((acc, split) => acc + split.amount, 0);
  }, [splitHistory]);

  const billSubtotal = useMemo(() => {
    return items.reduce((s, i) => s + i.price, 0);
  }, [items]);

  const mySubtotal = useMemo(() => {
    let total = 0;
    items.forEach(item => {
      const assigned = assignments[item.id] || [];
      if (assigned.includes(0)) {
        total += item.price / Math.max(1, assigned.length);
      }
    });
    return total;
  }, [items, assignments]);

  const guestSubtotal = useMemo(() => {
    let total = 0;
    items.forEach(item => {
      if (guestSelectedItems.has(item.id)) {
        total += item.price;
      }
    });
    return total;
  }, [items, guestSelectedItems]);

  const guestTotal = useMemo(() => {
    const sub = guestSubtotal;
    const taxShare = sub * taxRate;
    const tipShare = sub * tipRate;
    return Math.round(sub + taxShare + tipShare);
  }, [guestSubtotal, taxRate, tipRate]);

  // Tab filter items
  const filteredItems = useMemo(() => {
    if (currentTab === 'you') return items.filter(it => (assignments[it.id] || []).includes(0));
    if (currentTab === 'unassigned') return items.filter(it => (assignments[it.id] || []).length === 0);
    return items;
  }, [items, assignments, currentTab]);

  return (
    <div className="shell">
      <div className="phone" id="phone">
        {/* Dynamic Island */}
        <div className="island"></div>

        {/* Status Bar */}
        <div className="status">
          <span className="status-time">{clockTime}</span>
          <div className="status-icons">
            <svg width="16" height="12" viewBox="0 0 16 12" fill="white">
              <rect x="0" y="3" width="3" height="9" rx="1" />
              <rect x="4.5" y="2" width="3" height="10" rx="1" />
              <rect x="9" y="0.5" width="3" height="11.5" rx="1" />
              <rect x="13.5" y="0" width="2.5" height="12" rx="1" opacity=".3" />
            </svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="white">
              <path d="M8 2.5C10.5 2.5 12.8 3.5 14.4 5.2L15.7 3.9C13.7 1.8 11 0.5 8 0.5C5 0.5 2.3 1.8 0.3 3.9L1.6 5.2C3.2 3.5 5.5 2.5 8 2.5Z" opacity=".4" />
              <path d="M8 5C9.7 5 11.2 5.7 12.3 6.8L13.6 5.5C12.1 4.1 10.1 3.2 8 3.2C5.9 3.2 3.9 4.1 2.4 5.5L3.7 6.8C4.8 5.7 6.3 5 8 5Z" opacity=".7" />
              <circle cx="8" cy="10" r="2" />
            </svg>
            <svg width="25" height="12" viewBox="0 0 25 12" fill="white">
              <rect x="0" y="1" width="22" height="10" rx="3" stroke="white" strokeWidth="1" fill="none" opacity=".35" />
              <rect x="23" y="4" width="2" height="4" rx="1" opacity=".35" />
              <rect x="1" y="2" width="18" height="8" rx="2" fill="white" />
            </svg>
          </div>
        </div>

        {/* Live status API indicator */}
        <div id="backend-indicator" style={{
          position: 'absolute', top: '64px', right: '16px', zIndex: 997,
          display: 'flex', alignItems: 'center', gap: '5px',
          background: backendOnline ? 'rgba(34,211,163,0.12)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${backendOnline ? 'rgba(34,211,163,0.25)' : 'rgba(248,113,113,0.2)'}`,
          borderRadius: '99px', padding: '4px 10px',
          fontSize: '10px', fontWeight: 600,
          color: backendOnline ? '#22D3A3' : '#F87171',
          pointerEvents: 'none'
        }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: backendOnline ? '#22D3A3' : '#F87171',
            animation: backendOnline ? 'pulse 2s ease-in-out infinite' : 'none'
          }}></span>
          {backendOnline ? 'Live API' : 'Demo Mode'}
        </div>

        {/* Screens */}
        <div className="screens">

          {/* ═══ HOME SCREEN ═══ */}
          {activeScreen === 'home' && (
            <div className="screen active" id="home">
              <div className="home-bg"></div>
              <div className="home-pad">
                <div className="home-greeting">Good evening 🌙</div>
                <div className="home-name" id="home-username" onClick={editHostNameInline} style={{ cursor: 'pointer', display: 'inline-block' }}>
                  {hostName || 'Tap to set name'} ✌️
                </div>

                <div className="balance-card">
                  <div className="balance-label">You are owed</div>
                  <div className="balance-amount"><span>₹{totalOwedAmount.toLocaleString('en-IN')}</span></div>
                  <div className="balance-sub">across {splitHistory.length} splits · tap to settle</div>
                </div>

                <div className="quick-actions">
                  <button className="qa-btn" id="btn-scan-receipt" onClick={() => goTo('setup-split')}>
                    <div className="qa-icon purple">📷</div>
                    <div>
                      <div className="qa-label">Scan Receipt</div>
                      <div className="qa-sub">AI itemizes in 2s</div>
                    </div>
                  </button>
                  <button className="qa-btn" onClick={loadGuestView}>
                    <div className="qa-icon green">🔗</div>
                    <div>
                      <div className="qa-label">Guest View</div>
                      <div className="qa-sub">No app needed</div>
                    </div>
                  </button>
                  <button className="qa-btn" onClick={() => showToast('Coming soon! 🚀')}>
                    <div className="qa-icon gold">👥</div>
                    <div>
                      <div className="qa-label">New Group</div>
                      <div className="qa-sub">Recurring splits</div>
                    </div>
                  </button>
                  <button className="qa-btn" onClick={() => showToast('Settle all with 1 tap 🎉')}>
                    <div className="qa-icon pink">⚡</div>
                    <div>
                      <div className="qa-label">Settle All</div>
                      <div className="qa-sub">Min. transactions</div>
                    </div>
                  </button>
                </div>

                <div className="section-title">
                  Recent Splits
                  <span className="section-see">See all</span>
                </div>
                
                <div className="card" style={{ padding: '0 16px' }} id="recent-splits-list">
                  {splitHistory.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                      No splits yet. Click Scan Receipt to set up a new split! 🚀
                    </div>
                  ) : (
                    splitHistory.map(s => (
                      <div key={s.id} className="split-item" onClick={() => handleLoadHistorySplit(s.id)}>
                        <div className="split-avatar" style={{ background: 'rgba(255,170,80,0.12)' }}>🍽️</div>
                        <div className="split-info">
                          <div className="split-name">{s.restaurant}</div>
                          <div className="split-date">{s.date} · {s.count} people</div>
                        </div>
                        <div>
                          <div className="split-amount owed">+₹{s.amount.toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ height: '100px' }}></div>
              </div>

              {/* Bottom Nav */}
              <div className="nav-bar">
                <div className="nav-item active">
                  <span className="nav-icon">🏠</span>
                  <span className="nav-label">Home</span>
                </div>
                <div className="nav-item" onClick={() => goTo('items')}>
                  <span className="nav-icon-wrap">
                    <span className="nav-icon">💸</span>
                    <span className="nav-dot"></span>
                  </span>
                  <span className="nav-label">Splits</span>
                </div>
                <div className="nav-item" onClick={() => showToast('Friends coming soon!')}>
                  <span className="nav-icon">👫</span>
                  <span className="nav-label">Friends</span>
                </div>
                <div className="nav-item" onClick={() => showToast('Your profile 🙌')}>
                  <span className="nav-icon">🧑</span>
                  <span className="nav-label">Profile</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SETUP SPLIT SCREEN ═══ */}
          {activeScreen === 'setup-split' && (
            <div className="screen active" id="setup-split" style={{ background: 'var(--bg2)' }}>
              <div style={{ padding: '59px 22px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <button className="back-btn" onClick={goBack} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path d="M11 4L6 9L11 14" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div style={{ fontSize: '20px', fontWeight: 800, flex: 1 }}>New Split Setup</div>
                </div>

                <div className="card" style={{ padding: '18px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text2)' }}>Your Info (Host)</div>
                  <input type="text" placeholder="Your Name" value={hostName} onChange={(e) => setHostName(e.target.value)} />
                  <input type="text" placeholder="Your UPI ID (optional)" value={hostUpi} onChange={(e) => setHostUpi(e.target.value)} />
                </div>

                <div className="card" style={{ padding: '18px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text2)' }}>Split Info</div>
                  <input type="text" placeholder="Restaurant or Event Name (e.g. Pizza, Coffee, BBQ)" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} />
                </div>

                <div className="card" style={{ padding: '18px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text2)' }}>Friends (Participants)</div>
                    <button className="btn" onClick={addSetupFriendRow} style={{ background: 'rgba(124,111,255,0.12)', color: 'var(--accent2)', border: 'none', borderRadius: '8px', padding: '4px 10px', fontSize: '11px', fontWeight: 600 }}>+ Add Friend</button>
                  </div>
                  <div id="setup-friends-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {setupFriends.map((f, idx) => (
                      <div key={idx} className="setup-friend-row">
                        <input type="text" value={f.name} onChange={(e) => updateSetupFriend(idx, 'name', e.target.value)} placeholder="Name" style={{ flex: 2 }} />
                        <input type="text" value={f.emoji} onChange={(e) => updateSetupFriend(idx, 'emoji', e.target.value)} placeholder="Emoji" style={{ width: '44px', textAlign: 'center' }} />
                        <input type="text" value={f.upi} onChange={(e) => updateSetupFriend(idx, 'upi', e.target.value)} placeholder="UPI ID" style={{ flex: 2 }} />
                        <button className="setup-friend-remove" onClick={() => removeSetupFriend(idx)}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary" onClick={() => handleConfirmSplitSetup('scan')} style={{ width: '100%' }}>📷 Upload or Scan Receipt</button>
                <div style={{ height: '10px' }}></div>
                <button className="btn btn-secondary" onClick={() => handleConfirmSplitSetup('manual')} style={{ width: '100%' }}>✏️ Manual Entry (Skip Scan)</button>
              </div>
            </div>
          )}

          {/* ═══ SCAN SCREEN ═══ */}
          {activeScreen === 'scan' && (
            <div className="screen active" id="scan">
              <div className="scan-header">
                <button className="back-btn" onClick={goBack}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="white">
                    <path d="M11 4L6 9L11 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="scan-title">Scan Receipt</span>
                <div style={{ width: '38px' }}></div>
              </div>

              <div className="camera-view">
                <div className="receipt-preview">
                  <img src="/receipt.png" alt="Receipt" onError={(e) => {
                    // Fallback in case path in vite is different
                    (e.target as HTMLImageElement).src = 'receipt.png';
                  }} />
                </div>
                <div className="scan-overlay">
                  <div className="scan-corner tl"></div>
                  <div className="scan-corner tr"></div>
                  <div className="scan-corner bl"></div>
                  <div className="scan-corner br"></div>
                  <div className="scan-line"></div>
                </div>
              </div>

              <div className="scan-bottom">
                <div className="scan-hint">Position receipt within frame · AI reads automatically</div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center' }}>
                  <button className="btn btn-secondary" onClick={triggerFileSelect} style={{ flex: 0, padding: '14px 18px', borderRadius: '16px' }}>
                    📁
                  </button>
                  <button className="shutter" onClick={triggerFileSelect}>
                    <div className="shutter-inner"></div>
                  </button>
                  <button className="btn btn-secondary" onClick={() => showToast('Flash on 💡')} style={{ flex: 0, padding: '14px 18px', borderRadius: '16px' }}>
                    ⚡
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ PROCESSING SCREEN ═══ */}
          {activeScreen === 'processing' && (
            <div className="screen active" id="processing">
              <div className="proc-content">
                <div className="ai-ring">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <defs>
                      <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#7C6FFF" />
                        <stop offset="100%" stopColor="#22D3A3" />
                      </linearGradient>
                    </defs>
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(124,111,255,0.15)" strokeWidth="3" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="url(#ringGrad)" strokeWidth="3" strokeLinecap="round" strokeDasharray="80 246" />
                  </svg>
                  <div className="ai-ring-inner">✨</div>
                </div>
                <div className="proc-title">Reading your receipt</div>
                <div className="proc-sub">Gemini Vision is parsing the bill…</div>

                <div className="card proc-steps" style={{ padding: '4px 20px', width: '100%' }}>
                  <div className="proc-step">
                    <div className="proc-step-icon done">✅</div>
                    <div className="proc-step-label">Image uploaded <span>· 1.2MB</span></div>
                    <div className="proc-check">
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                  <div className="proc-step">
                    <div className={`proc-step-icon ${pStep >= 2 ? 'done' : 'active'}`}>{pStep >= 2 ? '✅' : '🔍'}</div>
                    <div className="proc-step-label">{pStep >= 2 ? `Found ${foundItemsCount || items.length} items ✓` : 'Reading line items'}</div>
                    {pStep < 2 ? <div className="proc-spinner"></div> : (
                      <div className="proc-check">
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="proc-step">
                    <div className={`proc-step-icon ${pStep >= 3 ? 'done' : pStep === 2 ? 'active' : 'pending'}`}>{pStep >= 3 ? '✅' : '💰'}</div>
                    <div className="proc-step-label">{pStep >= 3 ? 'Tax & tip detected ✓' : 'Calculating totals'}</div>
                    {pStep === 2 && <div className="proc-spinner"></div>}
                    {pStep >= 3 && (
                      <div className="proc-check">
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="proc-step">
                    <div className={`proc-step-icon ${pStep >= 4 ? 'done' : pStep === 3 ? 'active' : 'pending'}`}>{pStep >= 4 ? '✅' : '👥'}</div>
                    <div className="proc-step-label">{pStep >= 4 ? 'Ready to split ✓' : 'Building split view'}</div>
                    {pStep === 3 && <div className="proc-spinner"></div>}
                    {pStep >= 4 && (
                      <div className="proc-check">
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ ITEMS SCREEN ═══ */}
          {activeScreen === 'items' && (
            <div className="screen active" id="items">
              <div className="items-header">
                <div className="items-title-row">
                  <button className="back-btn" onClick={goBack} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path d="M11 4L6 9L11 14" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div className="items-screen-title">Assign Items</div>
                  <button className="btn" onClick={() => goTo('summary')} style={{ background: 'var(--accent)', color: 'white', borderRadius: '12px', padding: '8px 16px', fontSize: '13px', border: 'none' }}>Done</button>
                </div>
                
                <div className="items-rest" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span id="items-rest-display">🍽️ {activeSplitName || 'Meal Split'}</span>
                  <button onClick={handleEditRestaurantName} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer' }}>✏️ Edit</button>
                </div>

                {/* People row */}
                <div className="pax-row" id="pax-row">
                  {people.map((p, idx) => (
                    <div key={idx} className="pax-chip" onClick={() => setSelectedPerson(idx)}>
                      <div className={`pax-ava ${selectedPerson === idx ? 'selected' : ''}`} id={`pax-${idx}`} style={{ background: p.color }}>{p.emoji}</div>
                      <div className="pax-chip-name">{p.name.split(' ')[0]}</div>
                    </div>
                  ))}
                  <div className="pax-chip" onClick={() => goTo('setup-split')}>
                    <div className="pax-add">+</div>
                    <div className="pax-chip-name">Edit</div>
                  </div>
                </div>

                <div className="tabs">
                  <button className={`tab ${currentTab === 'all' ? 'active' : 'inactive'}`} onClick={() => setCurrentTab('all')}>All Items</button>
                  <button className={`tab ${currentTab === 'you' ? 'active' : 'inactive'}`} onClick={() => setCurrentTab('you')}>Yours</button>
                  <button className={`tab ${currentTab === 'unassigned' ? 'active' : 'inactive'}`} onClick={() => setCurrentTab('unassigned')}>Unassigned</button>
                </div>
              </div>

              {/* Manual Add Item Form */}
              <div style={{ padding: '10px 22px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" placeholder="➕ Add custom item name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={{ flex: 2, height: '38px', padding: '6px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                  <input type="number" placeholder="Price" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} style={{ flex: 1, height: '38px', padding: '6px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                  <button className="btn" onClick={handleAddManualItem} style={{ background: 'var(--accent)', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 700, height: '38px', padding: '0 16px', width: 'auto' }}>Add</button>
                </div>
              </div>

              <div className="items-list" id="items-list">
                {filteredItems.map(item => {
                  const assigned = assignments[item.id] || [];
                  const isMine = assigned.includes(selectedPerson);
                  const avatars = assigned.map(pid => {
                    const p = people[pid];
                    if (!p) return null;
                    return <div key={pid} className="item-avatar" style={{ background: p.color }}>{p.emoji}</div>;
                  });

                  return (
                    <div key={item.id} className="item-row" onClick={() => handleToggleItemAssignment(item.id)}>
                      <div className={`item-check ${isMine ? 'checked' : ''}`}>
                        {isMine && '✓'}
                      </div>
                      <div className="item-info">
                        <div className="item-name">{item.name}</div>
                        <div className="item-qty">Qty {item.qty} · {assigned.length > 0 ? 'shared' : 'unassigned'}</div>
                        <div className="item-assignees">{avatars}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="item-price">₹{Math.round(item.price).toLocaleString('en-IN')}</div>
                        <button onClick={(e) => handleEditItem(item.id, e)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '12px' }}>✏️</button>
                        <button onClick={(e) => handleDeleteItem(item.id, e)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: '12px' }}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="items-footer">
                <div className="items-footer-summary">
                  <div>
                    <div className="items-footer-label">Your subtotal</div>
                    <div className="items-footer-val" id="my-subtotal">₹{Math.round(mySubtotal).toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="items-footer-label">Bill total</div>
                    <div className="items-footer-val" id="items-bill-total">₹{Math.round(billSubtotal).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => goTo('summary')}>
                  ✓ &nbsp; Confirm & Share Split
                </button>
              </div>
            </div>
          )}

          {/* ═══ SUMMARY SCREEN ═══ */}
          {activeScreen === 'summary' && (
            <div className="screen active" id="summary">
              <div className="summary-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                  <button className="back-btn" onClick={goBack} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path d="M11 4L6 9L11 14" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px', flex: 1 }}>Split Summary</div>
                  <button className="btn" onClick={() => showToast('Receipt saved 📁')} style={{ background: 'var(--surface)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px 14px', fontSize: '13px' }}>Save</button>
                </div>
              </div>

              <div className="summary-hero">
                <div className="summary-icon">🍽️</div>
                <div className="summary-title">{activeSplitName}</div>
                <div className="summary-sub">Today · {people.length} people · {people[0]?.name || 'You'} paid</div>
              </div>

              {/* Share card */}
              <div className="share-card">
                <div className="share-card-title">🔗 Share with your friends</div>
                <div className="share-card-sub">They open the link — no app needed</div>
                <div className="share-link-box" onClick={handleCopyLink}>
                  <span>{backendOnline && activeSplitId ? `${API_BASE}/guest/${activeGuestToken}` : 'wise.app/s/demo-link'}</span>
                  <span className="share-link-copy" id="copy-label">Copy</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => showToast('Shared to WhatsApp! 🟢')} style={{ flex: 1, fontSize: '13px', padding: '12px' }}>WhatsApp</button>
                  <button className="btn btn-secondary" onClick={handleCopyLink} style={{ flex: 1, fontSize: '13px', padding: '12px' }}>Copy Link</button>
                  <button className="btn btn-secondary" onClick={() => showToast('QR generated! 📱')} style={{ flex: 0, fontSize: '13px', padding: '12px 16px' }}>QR</button>
                </div>
              </div>

              {/* People Cards list */}
              <div className="person-cards" id="person-cards">
                {people.map(person => {
                  const subtotal = calcPersonTotal(person.id);
                  const taxShare = subtotal * taxRate;
                  const tipShare = subtotal * tipRate;
                  const total = Math.round(subtotal + taxShare + tipShare);

                  const myItems = items.filter(it => (assignments[it.id] || []).includes(person.id));
                  const itemNamesStr = myItems.slice(0, 2).map(i => i.name).join(', ') + (myItems.length > 2 ? ` +${myItems.length - 2}` : '');
                  const isYou = person.id === 0;

                  return (
                    <div key={person.id} className="person-card" id={`person-card-${person.id}`}>
                      <div className="person-card-header">
                        <div className="person-card-ava" style={{ background: person.color }}>{person.emoji}</div>
                        <div className="person-card-info">
                          <div className="person-card-name">{person.name}</div>
                          <div className="person-card-items">{itemNamesStr || 'No items'}</div>
                        </div>
                        <div className="person-card-amount">₹{total.toLocaleString('en-IN')}</div>
                      </div>
                      <div className="person-card-breakdown">
                        <div className="breakdown-row"><span>Food & drinks</span><span>₹{Math.round(subtotal).toLocaleString('en-IN')}</span></div>
                        <div className="breakdown-row"><span>Tax share</span><span>₹{Math.round(taxShare).toLocaleString('en-IN')}</span></div>
                        <div className="breakdown-row"><span>Tip share</span><span>₹{Math.round(tipShare).toLocaleString('en-IN')}</span></div>
                        <div className="breakdown-row total"><span>Total</span><span>₹{total.toLocaleString('en-IN')}</span></div>
                      </div>
                      <div className="pay-btns">
                        {isYou ? (
                          <button className="pay-btn paid" style={{ flex: 1 }}>✓ You paid the bill</button>
                        ) : (
                          <>
                            <button className="pay-btn upi" style={{ flex: 2 }} onClick={() => handleTriggerUPI(person.id, total)}>🇮🇳 Request via UPI</button>
                            <button className="pay-btn link" style={{ flex: 1 }} onClick={() => showToast(`Link sent to ${person.name}! 🔗`)}>🔗 Link</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total calculations card */}
              <div className="summary-total-card">
                <div className="stc-row">
                  <span className="stc-label">Subtotal</span>
                  <span className="stc-val">₹{Math.round(billSubtotal).toLocaleString('en-IN')}</span>
                </div>
                <div className="stc-row">
                  <span className="stc-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    Tax ({Math.round(taxRate * 100)}%)
                    <button onClick={handleEditTaxTip} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                  </span>
                  <span className="stc-val">₹{Math.round(billSubtotal * taxRate).toLocaleString('en-IN')}</span>
                </div>
                <div className="stc-row">
                  <span className="stc-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    Tip ({Math.round(tipRate * 100)}%)
                    <button onClick={handleEditTaxTip} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                  </span>
                  <span className="stc-val">₹{Math.round(billSubtotal * tipRate).toLocaleString('en-IN')}</span>
                </div>
                <div className="stc-divider"></div>
                <div className="stc-total-row">
                  <span className="stc-total-label">Bill Total</span>
                  <span className="stc-total-val">₹{Math.round(billSubtotal * (1 + taxRate + tipRate)).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div style={{ height: '30px' }}></div>
            </div>
          )}

          {/* ═══ GUEST VIEW SCREEN ═══ */}
          {activeScreen === 'guest' && (
            <div className="screen active" id="guest">
              <div className="guest-hero">
                <div className="guest-badge">🔗 Guest View · No app needed</div>
                <div className="guest-title">Select your items</div>
                <div className="guest-sub" id="guest-sub">From <strong>{activeSplitName || 'Demo Split'}</strong></div>
              </div>
              <div className="guest-items">
                <div className="guest-host-note">
                  <span>ℹ️</span>
                  <span><strong>{people[0]?.name || 'Host'}</strong> fronted the bill. Select what you ordered and pay your share instantly.</span>
                </div>
                <div id="guest-items-list">
                  {items.map(item => {
                    const isSel = guestSelectedItems.has(item.id);
                    return (
                      <div key={item.id} className="guest-item" onClick={() => handleToggleGuestItem(item.id)}>
                        <div className={`guest-item-sel ${isSel ? 'on' : ''}`}>{isSel && '✓'}</div>
                        <div className="guest-item-name">{item.emoji} {item.name}</div>
                        <div className="guest-item-price">₹{Math.round(item.price).toLocaleString('en-IN')}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="guest-footer">
                <div className="guest-total-row">
                  <span className="guest-total-label">Your total (with tax & tip)</span>
                  <span className="guest-total-amount" id="guest-total">₹{guestTotal.toLocaleString('en-IN')}</span>
                </div>
                <button className="btn btn-green" id="guest-pay-btn" onClick={handleGoToPayment}>
                  💸 &nbsp; Pay {people[0]?.name || 'Host'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ PAYMENT SCREEN ═══ */}
          {activeScreen === 'payment' && (
            <div className="screen active" id="payment">
              <div className="payment-pad">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <button className="back-btn" onClick={goBack} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path d="M11 4L6 9L11 14" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div style={{ fontSize: '18px', fontWeight: 800, flex: 1 }}>Pay Now</div>
                </div>

                <div className="pay-hero">
                  <div className="pay-amount-label">You owe</div>
                  <div className="pay-amount-big"><span id="pay-amount-display">₹{guestTotal.toLocaleString('en-IN')}</span></div>
                  <div className="pay-to">to {people[0]?.name || 'Host'} · {activeSplitName}</div>
                </div>

                <div className="pay-methods">
                  <div className={`pay-method ${selectedPayMethod === 'upi' ? 'selected' : ''}`} onClick={() => setSelectedPayMethod('upi')}>
                    <div className="pay-method-icon" style={{ background: 'rgba(0,177,90,0.12)' }}>🇮🇳</div>
                    <div className="pay-method-info">
                      <div className="pay-method-name">UPI</div>
                      <div className="pay-method-sub">GPay · PhonePe · BHIM · Any UPI app</div>
                    </div>
                    <span className="pay-method-badge fast">Instant</span>
                  </div>
                  <div className={`pay-method ${selectedPayMethod === 'card' ? 'selected' : ''}`} onClick={() => setSelectedPayMethod('card')}>
                    <div className="pay-method-icon" style={{ background: 'rgba(96,165,250,0.12)' }}>💳</div>
                    <div className="pay-method-info">
                      <div className="pay-method-name">Card</div>
                      <div className="pay-method-sub">Credit or Debit card</div>
                    </div>
                    <span className="pay-method-badge">Soon</span>
                  </div>
                </div>

                <button className="btn btn-green" id="pay-now-btn" onClick={handleDoPayment} disabled={paymentProcessing}>
                  {paymentProcessing ? '⏳ Processing…' : '💸   Pay Now'}
                </button>
              </div>

              {/* Success overlay */}
              <div className={`pay-success-overlay ${paymentSuccess ? 'show' : ''}`} id="pay-success">
                <div className="confetti-container" id="confetti">
                  {confettiActive && Array.from({ length: 60 }).map((_, i) => {
                    const colorsList = ['#7C6FFF', '#22D3A3', '#F59E0B', '#F87171', '#A78BFA'];
                    return (
                      <div key={i} className="confetti-piece" style={{
                        left: `${Math.random() * 100}%`,
                        top: '-20px',
                        background: colorsList[Math.floor(Math.random() * colorsList.length)],
                        width: `${4 + Math.random() * 8}px`,
                        height: `${4 + Math.random() * 8}px`,
                        animationDuration: `${1.5 + Math.random() * 2}s`,
                        animationDelay: `${Math.random() * 0.5}s`,
                        borderRadius: Math.random() > 0.5 ? '50%' : '2px'
                      }}></div>
                    );
                  })}
                </div>
                <div className="pay-success-icon">✅</div>
                <div className="pay-success-title">Paid! 🎉</div>
                <div className="pay-success-sub" id="pay-success-sub-text">
                  Payment sent to {people[0]?.name || 'Host'}.<br />Your friends can see this too.
                </div>
                <button className="btn btn-primary" onClick={() => {
                  setPaymentSuccess(false);
                  goTo('home');
                }} style={{ marginTop: '32px', width: '200px' }}>Back to Home</button>
              </div>
            </div>
          )}

        </div>{/* /screens */}

        {/* Toast notifications */}
        <div className={`toast ${toastMsg ? 'show' : ''}`} id="toast">
          {toastMsg}
        </div>
        
        {/* Global confetti */}
        <div className="confetti-container" id="global-confetti"></div>

      </div>{/* /phone */}

      {/* Hidden file input for real receipt uploads */}
      <input
        type="file"
        id="receipt-file-input"
        accept="image/*"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleReceiptFileChange}
      />
    </div>
  );
}
