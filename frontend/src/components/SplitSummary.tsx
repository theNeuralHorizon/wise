import React, { useState } from 'react';
import type { Person, Item, SettlementTransaction, PaymentRecord } from '../schemas';
import { QRCodeCanvas } from './QRCodeCanvas';
import { guestShareLink } from '../config';
import { openUpiDeeplink } from '../upi';

interface Props {
  people: Person[];
  items: Item[];
  assignments: Record<string, number[]>;
  activeSplitName: string;
  taxRate: number;
  tipRate: number;
  activeGuestToken: string | null;
  hasOwnerToken: boolean;
  backendOnline: boolean;
  settlements: SettlementTransaction[] | null;
  settlementsLoading: boolean;
  payments: PaymentRecord[];
  onBack: () => void;
  onTriggerUPI: (personId: number, amount: number) => void;
  onFetchSettlements: () => void;
  onEditTaxTip: () => void;
  onRecoverToken: (token: string) => void;
  onConfirmPayment: (paymentId: string) => void;
  showToast: (msg: string) => void;
  billSubtotal: number;
}

export const SplitSummary: React.FC<Props> = ({
  people, items, assignments, activeSplitName, taxRate, tipRate,
  activeGuestToken, hasOwnerToken, backendOnline, settlements, settlementsLoading, payments,
  onBack, onTriggerUPI, onFetchSettlements, onEditTaxTip, onRecoverToken, onConfirmPayment, showToast, billSubtotal,
}) => {
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrPerson, setQrPerson] = useState<{ name: string; emoji: string; upi: string | null; amount: number } | null>(null);
  const [recoveryToken, setRecoveryToken] = useState('');

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

  const handleShowQR = (personId: number, amount: number) => {
    const person = people[personId];
    if (!person) return;
    const host = people[0];
    setQrPerson({ name: person.name, emoji: person.emoji, upi: host?.upi ?? null, amount });
    setQrModalOpen(true);
  };

  const handleShare = async () => {
    const link = backendOnline && activeGuestToken
      ? guestShareLink(activeGuestToken)
      : 'wise.app/s/demo-link';
    const hostName = people[0]?.name || 'Someone';
    const restaurant = activeSplitName || 'a meal';
    const message = `${hostName} added you to a split at ${restaurant}. Tap to see your items and pay: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Wise — Split Bill', text: message });
      } catch { /* user cancelled or not supported */ }
    } else {
      navigator.clipboard.writeText(message).catch(() => {});
      showToast('Share message copied to clipboard');
    }
  };

  const handleCopyLink = () => {
    const link = backendOnline && activeGuestToken
      ? guestShareLink(activeGuestToken)
      : 'wise.app/s/demo-link';
    navigator.clipboard.writeText(link).catch(() => {});
    showToast('Link copied to clipboard');
  };

  return (
    <div className="screen active" id="summary">
      {!hasOwnerToken && backendOnline && (
        <div className="recovery-bar">
          <div className="recovery-bar-title">No Owner Token</div>
          <div className="recovery-bar-sub">Enter your owner token to manage this split.</div>
          <div className="form-row">
            <input
              type="text"
              className="recovery-input"
              placeholder="Paste owner token..."
              value={recoveryToken}
              onChange={e => setRecoveryToken(e.target.value)}
            />
            <button
              className="btn btn-primary recovery-btn"
              onClick={() => { if (recoveryToken.trim()) { onRecoverToken(recoveryToken.trim()); setRecoveryToken(''); } }}
            >Restore</button>
          </div>
        </div>
      )}

      <div className="summary-header">
        <div className="header-row">
          <button className="back-btn header-back" onClick={onBack} aria-label="Go back">
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="header-title">Split Summary</div>
          <button className="btn header-save-btn" onClick={() => showToast('Receipt saved')}>Save</button>
        </div>
      </div>

      <div className="summary-hero">
        <div className="summary-title">{activeSplitName}</div>
        <div className="summary-sub">Today · {people.length} people · {people[0]?.name || 'You'} paid</div>
      </div>

      <div className="share-card">
        <div className="share-card-title">Share with your friends</div>
        <div className="share-card-sub">They open the link — no app needed</div>
        <div className="share-link-box" onClick={handleCopyLink}>
          <span>{backendOnline && activeGuestToken ? guestShareLink(activeGuestToken) : 'wise.app/s/demo-link'}</span>
          <span className="share-link-copy">Copy</span>
        </div>
        <div className="share-btn-row">
          <button className="btn btn-primary share-btn" onClick={handleShare}>Share</button>
          <button className="btn btn-secondary share-btn" onClick={handleCopyLink}>Copy Link</button>
          <button className="btn btn-secondary share-btn share-btn-qr" onClick={() => {
            const host = people[0];
            if (host) { setQrPerson({ name: host.name, emoji: host.emoji, upi: host.upi, amount: 0 }); setQrModalOpen(true); }
          }}>QR</button>
        </div>
      </div>

      {payments.length > 0 && (
        <div className="payments-section">
          <div className="payments-title">Payments</div>
          <div className="card payments-card">
            {payments.map(p => (
              <div key={p.id} className="payment-item">
                <span className="payment-emoji">{p.from_name.charAt(0)}</span>
                <div className="payment-info">
                  <div className="payment-name">{p.from_name}</div>
                  <div className="payment-time">{new Date(p.created_at).toLocaleTimeString()}</div>
                </div>
                <div className="payment-amount">₹{(p.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                {p.status === 'confirmed' ? (
                  <span className="payment-confirmed">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" stroke="#C8F135" /><path d="M3.5 6L5.5 8L8.5 4.5" stroke="#C8F135" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    Confirmed
                  </span>
                ) : (
                  <button
                    className="payment-confirm-btn"
                    onClick={() => onConfirmPayment(p.id)}
                  >Confirm</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
                <div className="person-card-ava">{person.name.charAt(0)}</div>
                <div className="person-card-info">
                  <div className="person-card-name">{person.name}</div>
                  <div className="person-card-items">{itemNamesStr || 'No items'}</div>
                </div>
                <div className="person-card-amount">₹{(total / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="person-card-breakdown">
                <div className="breakdown-row"><span>Food & drinks</span><span>₹{(Math.round(subtotal) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="breakdown-row"><span>Tax share</span><span>₹{(Math.round(taxShare) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="breakdown-row"><span>Tip share</span><span>₹{(Math.round(tipShare) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="breakdown-row total"><span>Total</span><span>₹{(total / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
              </div>
              <div className="pay-btns">
                {isYou ? (
                  <button className="pay-btn paid">✓ You paid the bill</button>
                ) : (
                  <>
                    <button className="pay-btn upi" onClick={() => onTriggerUPI(person.id, total)}>Pay via UPI</button>
                    <button className="pay-btn link" onClick={() => handleShowQR(person.id, total)}>QR</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {backendOnline && (
        <div className="settle-section">
          <div className="settle-header">
            <div className="settle-title">Settle All</div>
            <button className="settle-badge" onClick={onFetchSettlements}>
              {settlementsLoading ? 'Computing...' : 'Minimize Transactions'}
            </button>
          </div>
          {!settlements && !settlementsLoading && (
            <div className="settle-empty">
              Tap above to compute the minimum number of payments needed to settle all debts.
            </div>
          )}
          {settlementsLoading && (
            <div className="settle-card"><div className="settle-loading"><div className="settle-spinner" />Computing optimal settlements...</div></div>
          )}
          {settlements && !settlementsLoading && (
            settlements.length === 0 ? (
              <div className="settle-card settle-card-all-settled">
                All settled! No payments needed.
              </div>
            ) : (
              <div className="settle-card">
                {settlements.map((txn, i) => (
                  <div key={i} className="settle-txn" onClick={() => { if (txn.upi_deeplink) openUpiDeeplink(txn.upi_deeplink); else showToast(`No UPI ID for ${txn.to_name}`); }}>
                    <span className="settle-txn-emoji">{txn.from_name.charAt(0)}</span>
                    <div className="settle-txn-arrows">→</div>
                    <span className="settle-txn-emoji">{txn.to_name.charAt(0)}</span>
                    <div className="settle-txn-info">
                      <div className="settle-txn-desc">{txn.from_name} pays {txn.to_name}</div>
                      <div className="settle-txn-sub">{txn.to_upi || 'No UPI ID'}</div>
                    </div>
                    <div className="settle-txn-amount">₹{(txn.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    {txn.upi_deeplink && <button className="settle-txn-pay" onClick={e => { e.stopPropagation(); openUpiDeeplink(txn.upi_deeplink); }}>Pay →</button>}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      <div className="summary-total-card">
        <div className="stc-row"><span className="stc-label">Subtotal</span><span className="stc-val">₹{(billSubtotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        <div className="stc-row">
          <span className="stc-label stc-label-edit">
            Tax ({Math.round(taxRate * 100)}%)
            <button className="stc-edit-btn" onClick={onEditTaxTip} aria-label="Edit tax and tip">✎</button>
          </span>
          <span className="stc-val">₹{((billSubtotal * taxRate) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="stc-row">
          <span className="stc-label stc-label-edit">
            Tip ({Math.round(tipRate * 100)}%)
            <button className="stc-edit-btn" onClick={onEditTaxTip} aria-label="Edit tax and tip">✎</button>
          </span>
          <span className="stc-val">₹{((billSubtotal * tipRate) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="stc-divider" />
        <div className="stc-total-row">
          <span className="stc-total-label">Bill Total</span>
          <span className="stc-total-val">₹{((billSubtotal * (1 + taxRate + tipRate)) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* QR Modal */}
      <div className={`modal-backdrop ${qrModalOpen ? 'open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setQrModalOpen(false); }}>
        <div className="modal-sheet">
          <div className="modal-handle" />
          {qrPerson && (
            <div className="qr-modal-content">
              <div className="qr-person-info">{qrPerson.amount > 0 ? `Pay ${qrPerson.name}` : `${people[0]?.name || 'Host'}`}</div>
              {qrPerson.amount > 0 && <div className="qr-amount-big">₹{(qrPerson.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
              <div className="qr-hint">Scan with any UPI app</div>
              <div className="qr-canvas-wrap">
                <QRCodeCanvas text={(() => {
                  const host = people[0];
                  return host?.upi
                    ? `upi://pay?pa=${encodeURIComponent(host.upi)}&pn=${encodeURIComponent(host.name)}&am=${(qrPerson.amount / 100).toFixed(2)}&tn=WiseSplit&cu=INR`
                    : `upi://pay?am=${(qrPerson.amount / 100).toFixed(2)}&tn=WiseSplit&cu=INR`;
                })()} />
              </div>
              {qrPerson.upi && <div className="qr-upi-id">{qrPerson.upi}</div>}
              {!qrPerson.upi && <div className="qr-hint qr-hint-error">No UPI ID set for host</div>}
              <button className="btn btn-green qr-pay-btn" onClick={() => {
                const host = people[0];
                if (host?.upi) {
                  openUpiDeeplink(`upi://pay?pa=${encodeURIComponent(host.upi)}&pn=${encodeURIComponent(host.name)}&am=${(qrPerson.amount / 100).toFixed(2)}&tn=WiseSplit&cu=INR`);
                } else showToast('No UPI ID set for host');
                setQrModalOpen(false);
              }}>Open UPI App</button>
            </div>
          )}
          <div className="qr-modal-spacer" />
          <button className="modal-btn-cancel qr-close-btn" onClick={() => setQrModalOpen(false)}>Close</button>
        </div>
      </div>

      <div className="bottom-spacer" />
    </div>
  );
};
