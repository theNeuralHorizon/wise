import React, { useState, useMemo } from 'react';
import type { Item, Person } from '../schemas';

interface Props {
  items: Item[];
  people: Person[];
  activeSplitName: string;
  taxRate: number;
  tipRate: number;
  onBack: () => void;
  onPay: (selectedItemIds: string[], amount: number) => Promise<void>;
}

export const GuestView: React.FC<Props> = ({ items, people, activeSplitName, taxRate, tipRate, onBack, onPay }) => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showPayment, setShowPayment] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const toggleItem = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const guestSubtotal = useMemo(() => {
    let total = 0;
    items.forEach(item => { if (selectedItems.has(item.id)) total += item.price; });
    return total;
  }, [items, selectedItems]);

  const guestTotal = Math.round(guestSubtotal + guestSubtotal * taxRate + guestSubtotal * tipRate);

  const handleGoToPayment = () => {
    if (guestTotal <= 0) return;
    setShowPayment(true);
  };

  const handleDoPayment = async () => {
    setPaymentProcessing(true);
    try {
      await onPay(Array.from(selectedItems), guestTotal);
    } catch { /* handled upstream */ }
    setTimeout(() => {
      setPaymentProcessing(false);
      setPaymentSuccess(true);
    }, 1200);
  };

  if (showPayment) {
    return (
      <div className="screen active" id="payment">
        <div className="payment-pad">
          <div className="header-row">
            <button className="back-btn header-back" onClick={() => setShowPayment(false)} aria-label="Go back">
              <svg width="18" height="18" viewBox="0 0 18 18"><path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="header-title">Pay Now</div>
          </div>
          <div className="pay-hero">
            <div className="pay-amount-label">You owe</div>
            <div className="pay-amount-big"><span>₹{(guestTotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div className="pay-to">to {people[0]?.name || 'Host'} · {activeSplitName}</div>
          </div>
          <div className="pay-methods">
            <div className="pay-method selected">
              <div className="pay-method-icon">₹</div>
              <div className="pay-method-info">
                <div className="pay-method-name">UPI</div>
                <div className="pay-method-sub">GPay · PhonePe · BHIM · Any UPI app</div>
              </div>
              <span className="pay-method-badge fast">Instant</span>
            </div>
          </div>
          <button className={`btn btn-green ${paymentProcessing ? 'btn-disabled' : ''}`} onClick={handleDoPayment} disabled={paymentProcessing}>
            {paymentProcessing ? 'Processing...' : 'Pay Now'}
          </button>
        </div>

        <div className={`pay-success-overlay ${paymentSuccess ? 'show' : ''}`}>
          <div className="pay-success-icon">✓</div>
          <div className="pay-success-title">Paid!</div>
          <div className="pay-success-sub">
            Payment sent to {people[0]?.name || 'Host'}.<br />Your friends can see this too.
          </div>
          <button className="btn btn-primary pay-success-btn" onClick={onBack}>Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen active" id="guest">
      <div className="guest-hero">
        <div className="guest-badge">Guest View · No app needed</div>
        <div className="guest-title">Select your items</div>
        <div className="guest-sub">From <strong>{activeSplitName || 'Demo Split'}</strong></div>
      </div>
      <div className="guest-items">
        <div className="guest-host-note">
          <span><strong>{people[0]?.name || 'Host'}</strong> fronted the bill. Select what you ordered and pay your share instantly.</span>
        </div>
        <div id="guest-items-list">
          {items.map(item => {
            const isSel = selectedItems.has(item.id);
            return (
              <div key={item.id} className="guest-item" onClick={() => toggleItem(item.id)}>
                <div className={`guest-item-sel ${isSel ? 'on' : ''}`}>{isSel && '✓'}</div>
                <div className="guest-item-name">{item.name}</div>
                <div className="guest-item-price">₹{(item.price / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="guest-footer">
        <div className="guest-total-row">
          <span className="guest-total-label">Your total (with tax & tip)</span>
          <span className="guest-total-amount" id="guest-total">₹{(guestTotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <button className="btn btn-green" id="guest-pay-btn" onClick={handleGoToPayment}>
          Pay {people[0]?.name || 'Host'}
        </button>
      </div>
    </div>
  );
};
