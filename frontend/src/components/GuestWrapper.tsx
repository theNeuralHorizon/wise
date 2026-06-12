import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import type { Item, Person } from '../schemas';
import { GuestView } from './GuestView';
import { colors } from './CreateSplit';
import { cacheGuestData, getCachedGuestData } from '../offline/cache';

interface Props {
  showToast: (m: string) => void;
  onBack: () => void;
}

export const GuestWrapper: React.FC<Props> = ({ showToast, onBack }) => {
  const { token } = useParams<{ token: string }>();
  const api = useApi();
  const [items, setItems] = useState<Item[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [splitName, setSplitName] = useState('');
  const [taxRate, setTaxRate] = useState(0.08);
  const [tipRate, setTipRate] = useState(0.10);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await api.getGuestView(token);
        setSplitName(data.restaurant || data.name);
        const subtotal = data.total - data.tax - data.tip;
        setTaxRate(data.tax / Math.max(1, subtotal) || 0.08);
        setTipRate(data.tip / Math.max(1, subtotal) || 0.10);
        setItems(data.items.map(item => ({ id: item.id, name: item.name, price: item.price, qty: item.quantity, emoji: item.emoji })));
        setPeople([{ id: 0, name: data.host.name, emoji: data.host.emoji, color: colors[0], upi: data.host.upi_id }]);
        cacheGuestData({
          token,
          splitId: data.split_id,
          name: data.name,
          restaurant: data.restaurant,
          total: data.total,
          tax: data.tax,
          tip: data.tip,
          host: data.host,
          items: data.items,
          cachedAt: Date.now(),
        });
      } catch (e) {
        console.warn('Guest load failed:', e);
        const cached = await getCachedGuestData(token);
        if (cached) {
          setSplitName(cached.restaurant || cached.name);
          const subtotal = cached.total - cached.tax - cached.tip;
          setTaxRate(cached.tax / Math.max(1, subtotal) || 0.08);
          setTipRate(cached.tip / Math.max(1, subtotal) || 0.10);
          setItems(cached.items.map(item => ({ id: item.id, name: item.name, price: item.price, qty: item.quantity, emoji: item.emoji })));
          setPeople([{ id: 0, name: cached.host.name, emoji: cached.host.emoji, color: colors[0], upi: cached.host.upi_id }]);
          showToast('Offline — showing cached receipt');
        } else {
          showToast('Failed to load guest view');
        }
      }
      finally { setLoading(false); }
    })();
  }, [token, api, showToast]);

  if (loading) return <div className="screen active"><div className="loading-screen"><div className="loading-spinner" /><div className="loading-text">Loading…</div></div></div>;

  return (
    <GuestView
      items={items} people={people} activeSplitName={splitName}
      taxRate={taxRate} tipRate={tipRate} onBack={onBack}
      onPay={async (ids, amount) => { if (token) await api.guestPay(token, { name: 'Guest', amount, item_ids: ids }); }}
    />
  );
};
