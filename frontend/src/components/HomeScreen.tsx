import React, { useState } from 'react';
import type { SplitHistoryItem } from '../schemas';

interface Props {
  splitHistory: SplitHistoryItem[];
  onNewSplit: () => void;
  onLoadSplit: (id: string) => void;
  onHistory: () => void;
  showToast: (m: string) => void;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const HomeScreen: React.FC<Props> = ({ splitHistory, onNewSplit, onLoadSplit, onHistory, showToast }) => {
  const [hostName, setHostName] = useState(() => localStorage.getItem('wise_host_name') || '');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(hostName);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const totalOwed = splitHistory.reduce((acc, s) => acc + s.amount, 0);

  const confirmName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) { setHostName(trimmed); localStorage.setItem('wise_host_name', trimmed); showToast(`Name updated to ${trimmed}`); }
    setEditingName(false);
  };

  return (
    <main className="screen active" id="home">
      <div className="home-bg" />
      <div className="home-pad">
        <div className="home-greeting">{getGreeting()}</div>
        {editingName ? (
          <div className="inline-edit-row">
            <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmName()} autoFocus className="inline-edit-input" />
            <button onClick={confirmName} className="inline-edit-confirm" aria-label="Confirm name">✓</button>
          </div>
        ) : (
          <div className="home-name" onClick={() => { setNameInput(hostName); setEditingName(true); }}>
            {hostName || 'Tap to set name'}
          </div>
        )}

        {splitHistory.length > 0 && (
          <>
            <div className="balance-card">
              <div className="balance-label">You are owed</div>
              <div className="balance-amount"><span>₹{(totalOwed / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
              <div className="balance-sub">across {splitHistory.length} splits · tap to settle</div>
            </div>

            <div className="quick-actions">
              <button className="qa-btn" onClick={onNewSplit}>
                <div className="qa-icon">→</div>
                <div><div className="qa-label">Scan Receipt</div><div className="qa-sub">AI itemizes in 2s</div></div>
              </button>
              <button className="qa-btn" onClick={() => showToast('Open a guest link to use Guest View')}>
                <div className="qa-icon">↗</div>
                <div><div className="qa-label">Guest View</div><div className="qa-sub">No app needed</div></div>
              </button>
              <button className="qa-btn" onClick={() => showToast('Coming soon')}>
                <div className="qa-icon">+</div>
                <div><div className="qa-label">New Group</div><div className="qa-sub">Recurring splits</div></div>
              </button>
              <button className="qa-btn" onClick={() => showToast('Settle all with 1 tap')}>
                <div className="qa-icon">⚡</div>
                <div><div className="qa-label">Settle All</div><div className="qa-sub">Min. transactions</div></div>
              </button>
            </div>

            <section className="section-title">
              Recent Splits
              <span className="section-see" onClick={onHistory}>See all →</span>
            </section>

            <div className="card card-padded">
              {splitHistory.map(s => (
                <article key={s.id} className="split-item" onClick={() => onLoadSplit(s.id)}>
                  <div className="split-avatar" />
                  <div className="split-info">
                    <div className="split-name">{s.restaurant}</div>
                    <div className="split-date">{s.date} · {s.count} people</div>
                  </div>
                  <div><div className="split-amount owed">+₹{(s.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
                </article>
              ))}
            </div>
          </>
        )}

        {splitHistory.length === 0 && (
          <div className="empty-state-visual">
            <svg className="empty-state-svg" viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="8" width="80" height="110" rx="6" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
              <line x1="38" y1="32" x2="82" y2="32" stroke="rgba(255,255,255,0.06)" strokeWidth="2" strokeLinecap="round" />
              <line x1="38" y1="52" x2="76" y2="52" stroke="rgba(255,255,255,0.06)" strokeWidth="2" strokeLinecap="round" />
              <line x1="38" y1="72" x2="68" y2="72" stroke="rgba(255,255,255,0.06)" strokeWidth="2" strokeLinecap="round" />
              <line x1="38" y1="92" x2="82" y2="92" stroke="rgba(255,255,255,0.06)" strokeWidth="2" strokeLinecap="round" />
              <path d="M58 105 L52 115 L64 115 Z" stroke="rgba(255,255,255,0.06)" strokeWidth="2" strokeLinejoin="round" />
              <g transform="translate(68, 98) rotate(45)">
                <path d="M0 8 C4 4, 8 0, 12 0 C16 0, 20 4, 20 8 C20 12, 16 16, 12 16 C8 16, 4 12, 0 8 Z" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" fill="none" />
                <line x1="6" y1="0" x2="6" y2="16" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
              </g>
            </svg>
            <div className="empty-state-text">No splits yet</div>
            <button className="btn btn-primary empty-state-btn" onClick={onNewSplit}>Create your first split</button>
            <button className="empty-state-link" onClick={() => setHowItWorksOpen(true)}>How it works</button>
          </div>
        )}

        <div className="bottom-spacer" />
      </div>

      <div className={`modal-backdrop ${howItWorksOpen ? 'open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setHowItWorksOpen(false); }}>
        <div className="modal-sheet">
          <div className="modal-handle" />
          <div className="modal-title">How it works</div>
          <div className="how-it-works-steps">
            <div className="how-it-works-step">
              <div className="how-it-works-num">01</div>
              <div className="how-it-works-text">Scan a receipt</div>
            </div>
            <div className="how-it-works-step">
              <div className="how-it-works-num">02</div>
              <div className="how-it-works-text">Assign items to people</div>
            </div>
            <div className="how-it-works-step">
              <div className="how-it-works-num">03</div>
              <div className="how-it-works-text">Share the link — guests pay directly</div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => { setHowItWorksOpen(false); onNewSplit(); }}>Got it</button>
        </div>
      </div>
    </main>
  );
};
