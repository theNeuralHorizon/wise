import React, { useState } from 'react';
import type { FriendInput } from '../schemas';

const colors = [
  'rgba(124,111,255,0.18)', 'rgba(255,170,80,0.18)', 'rgba(96,165,250,0.18)',
  'rgba(248,113,113,0.18)', 'rgba(34,211,163,0.18)', 'rgba(245,158,11,0.18)',
];

interface Props {
  onConfirm: (method: 'scan' | 'manual') => void;
  onBack: () => void;
}

export const CreateSplit: React.FC<Props> = ({ onConfirm, onBack }) => {
  const [hostName, setHostName] = useState<string>(() => localStorage.getItem('wise_host_name') || '');
  const [hostUpi, setHostUpi] = useState<string>(() => localStorage.getItem('wise_host_upi') || '');
  const [restaurantName, setRestaurantName] = useState('');
  const [friends, setFriends] = useState<FriendInput[]>([
    { name: 'Loren', emoji: '🧑', upi: 'loren@ybl' },
    { name: 'Anthony', emoji: '👦', upi: 'anthony@okicici' },
    { name: 'Sara', emoji: '👩', upi: 'sara@paytm' },
  ]);

  const addFriend = () => {
    const emojis = ['🧑', '👦', '👩', '👨', '👧', '👵', '👴', '🦊', '🦁', '🐼'];
    setFriends(prev => [...prev, { name: `Friend ${prev.length + 1}`, emoji: emojis[prev.length % emojis.length], upi: '' }]);
  };

  const removeFriend = (idx: number) => setFriends(prev => prev.filter((_, i) => i !== idx));

  const updateFriend = (idx: number, key: keyof FriendInput, value: string) => {
    setFriends(prev => prev.map((f, i) => (i === idx ? { ...f, [key]: value } : f)));
  };

  const handleConfirm = (method: 'scan' | 'manual') => {
    localStorage.setItem('wise_host_name', hostName.trim() || 'You');
    localStorage.setItem('wise_host_upi', hostUpi.trim());
    onConfirm(method);
  };

  return (
    <div className="screen active" id="setup-split">
      <div className="header-row">
        <div className="header-row-inner">
          <button className="back-btn" onClick={onBack}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="header-title">New Split Setup</div>
        </div>
      </div>

      <div className="setup-content">
        <div className="card form-group">
          <div className="form-label">Your Info (Host)</div>
          <input type="text" placeholder="Your Name" value={hostName} onChange={e => setHostName(e.target.value)} className="form-input" />
          <input type="text" placeholder="Your UPI ID (optional)" value={hostUpi} onChange={e => setHostUpi(e.target.value)} className="form-input" />
        </div>

        <div className="card form-group">
          <div className="form-label">Split Info</div>
          <input type="text" placeholder="Restaurant or Event Name" value={restaurantName} onChange={e => setRestaurantName(e.target.value)} className="form-input" />
        </div>

        <div className="card form-group">
          <div className="form-row-header">
            <div className="form-label">Friends (Participants)</div>
            <button className="btn btn-add-friend" onClick={addFriend}>+ Add Friend</button>
          </div>
          <div className="form-rows">
            {friends.map((f, idx) => (
              <div key={idx} className="form-row setup-friend-row">
                <input type="text" value={f.name} onChange={e => updateFriend(idx, 'name', e.target.value)} placeholder="Name" className="form-input form-input-name" />
                <input type="text" value={f.emoji} onChange={e => updateFriend(idx, 'emoji', e.target.value)} placeholder="Emoji" className="form-input form-input-emoji" />
                <input type="text" value={f.upi} onChange={e => updateFriend(idx, 'upi', e.target.value)} placeholder="UPI ID" className="form-input form-input-upi" />
                <button className="setup-friend-remove" onClick={() => removeFriend(idx)}>×</button>
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => handleConfirm('scan')}>📷 Upload or Scan Receipt</button>
        <button className="btn btn-secondary" onClick={() => handleConfirm('manual')}>✏️ Manual Entry (Skip Scan)</button>
      </div>
    </div>
  );
};

export { colors };
