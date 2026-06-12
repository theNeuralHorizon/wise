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
  if (h < 12) return 'Good morning ☀️';
  if (h < 17) return 'Good afternoon 🌤️';
  return 'Good evening 🌙';
}

export const HomeScreen: React.FC<Props> = ({ splitHistory, onNewSplit, onLoadSplit, onHistory, showToast }) => {
  const [hostName, setHostName] = useState(() => localStorage.getItem('wise_host_name') || '');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(hostName);
  const totalOwed = splitHistory.reduce((acc, s) => acc + s.amount, 0);

  const confirmName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) { setHostName(trimmed); localStorage.setItem('wise_host_name', trimmed); showToast(`Name updated to ${trimmed} ✓`); }
    setEditingName(false);
  };

  return (
    <div className="screen active" id="home">
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
            {hostName || 'Tap to set name'} ✌️
          </div>
        )}

        <div className="balance-card">
          <div className="balance-label">You are owed</div>
          <div className="balance-amount"><span>₹{(totalOwed / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          <div className="balance-sub">across {splitHistory.length} splits · tap to settle</div>
        </div>

        <div className="quick-actions">
          <button className="qa-btn" onClick={onNewSplit}>
            <div className="qa-icon purple">📷</div>
            <div><div className="qa-label">Scan Receipt</div><div className="qa-sub">AI itemizes in 2s</div></div>
          </button>
          <button className="qa-btn" onClick={() => showToast('Open a guest link to use Guest View')}>
            <div className="qa-icon green">🔗</div>
            <div><div className="qa-label">Guest View</div><div className="qa-sub">No app needed</div></div>
          </button>
          <button className="qa-btn" onClick={() => showToast('Coming soon! 🚀')}>
            <div className="qa-icon gold">👥</div>
            <div><div className="qa-label">New Group</div><div className="qa-sub">Recurring splits</div></div>
          </button>
          <button className="qa-btn" onClick={() => showToast('Settle all with 1 tap 🎉')}>
            <div className="qa-icon pink">⚡</div>
            <div><div className="qa-label">Settle All</div><div className="qa-sub">Min. transactions</div></div>
          </button>
        </div>

        <div className="section-title">
          Recent Splits
          <span className="section-see" onClick={onHistory}>See all →</span>
        </div>

        <div className="card card-padded">
          {splitHistory.length === 0 ? (
            <div className="empty-state">No splits yet. Click Scan Receipt to set up a new split! 🚀</div>
          ) : splitHistory.map(s => (
            <div key={s.id} className="split-item" onClick={() => onLoadSplit(s.id)}>
              <div className="split-avatar orange">🍽️</div>
              <div className="split-info">
                <div className="split-name">{s.restaurant}</div>
                <div className="split-date">{s.date} · {s.count} people</div>
              </div>
              <div><div className="split-amount owed">+₹{(s.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
            </div>
          ))}
        </div>

        <div className="bottom-spacer" />
      </div>

      <div className="nav-bar">
        <div className="nav-item active"><span className="nav-icon">🏠</span><span className="nav-label">Home</span></div>
        <div className="nav-item" onClick={onNewSplit}><span className="nav-icon">💸</span><span className="nav-label">Splits</span></div>
        <div className="nav-item" onClick={() => showToast('Friends coming soon!')}><span className="nav-icon">👫</span><span className="nav-label">Friends</span></div>
        <div className="nav-item" onClick={() => showToast('Your profile 🙌')}><span className="nav-icon">🧑</span><span className="nav-label">Profile</span></div>
      </div>
    </div>
  );
};
