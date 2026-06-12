import React from 'react';
import type { SplitHistoryItem } from '../schemas';

interface Props {
  history: SplitHistoryItem[];
  onBack: () => void;
  onLoadSplit: (id: string) => void;
}

export const HistoryScreen: React.FC<Props> = ({ history, onBack, onLoadSplit }) => (
  <div className="screen active" id="history">
    <div className="history-header">
      <button className="back-btn" onClick={onBack} aria-label="Go back">
        <svg width="18" height="18" viewBox="0 0 18 18"><path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="history-title">All Splits</div>
      <span className="history-count">{history.length} total</span>
    </div>
    <div className="history-list">
      {history.length === 0 ? (
        <div className="history-empty">
          <div className="history-empty-icon">🍽️</div>
          <div className="history-empty-text">No splits yet.<br/>Start a new split from the home screen!</div>
        </div>
      ) : (
        <>
          <div className="history-month">Recent</div>
          <div className="card card-padded">
            {history.map(s => (
              <div key={s.id} className="split-item" onClick={() => onLoadSplit(s.id)}>
                <div className="split-avatar purple">🍽️</div>
                <div className="split-info">
                  <div className="split-name">{s.restaurant}</div>
                  <div className="split-date">{s.date} · {s.count} people</div>
                </div>
                <div>
                  <div className="split-amount owed">{s.amount > 0 ? `₹${(s.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  </div>
);
