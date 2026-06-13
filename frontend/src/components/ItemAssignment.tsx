import React, { useState } from 'react';
import type { Item, Person } from '../schemas';
import { ParticipantList } from './ParticipantList';

interface Props {
  items: Item[];
  people: Person[];
  assignments: Record<string, number[]>;
  selectedPerson: number;
  activeSplitName: string;
  currentTab: 'all' | 'you' | 'unassigned';
  hasOwnerToken: boolean;
  onSelectPerson: (idx: number) => void;
  onSetTab: (tab: 'all' | 'you' | 'unassigned') => void;
  onToggleAssignment: (itemId: string) => void;
  onEditItem: (itemId: string, name: string, price: number) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (name: string, price: number) => void;
  onEditRestaurant: (name: string) => void;
  onRecoverToken: (token: string) => void;
  onDone: () => void;
  onBack: () => void;
  onGoToSetup: () => void;
  mySubtotal: number;
  billSubtotal: number;
}

export const ItemAssignment: React.FC<Props> = ({
  items, people, assignments, selectedPerson, activeSplitName, currentTab, hasOwnerToken,
  onSelectPerson, onSetTab, onToggleAssignment, onEditItem, onDeleteItem,
  onAddItem, onEditRestaurant, onRecoverToken, onDone, onBack, onGoToSetup, mySubtotal, billSubtotal,
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editingRestaurant, setEditingRestaurant] = useState(false);
  const [restaurantInput, setRestaurantInput] = useState(activeSplitName);
  const [recoveryToken, setRecoveryToken] = useState('');

  const filteredItems = currentTab === 'you'
    ? items.filter(it => (assignments[it.id] || []).includes(0))
    : currentTab === 'unassigned'
      ? items.filter(it => (assignments[it.id] || []).length === 0)
      : items;

  const handleAdd = () => {
    const name = newItemName.trim();
    const price = parseFloat(newItemPrice);
    if (!name || isNaN(price) || price <= 0) return;
    onAddItem(name, price);
    setNewItemName('');
    setNewItemPrice('');
  };

  const startEdit = (itemId: string, currentName: string, currentPrice: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(itemId);
    setEditName(currentName);
    setEditPrice(String(currentPrice));
  };

  const confirmEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingId) return;
    const price = parseFloat(editPrice);
    if (!editName.trim() || isNaN(price) || price <= 0) return;
    onEditItem(editingId, editName.trim(), price);
    setEditingId(null);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  return (
    <div className="screen active" id="items">
      <div className="items-header">
        <div className="items-title-row">
          <button className="back-btn header-back" onClick={onBack} aria-label="Go back">
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="items-screen-title">Assign Items</div>
          <button className="btn btn-done" onClick={onDone}>Done</button>
        </div>
        <div className="items-rest">
          {editingRestaurant ? (
            <div className="edit-row">
              <input type="text" className="edit-input" value={restaurantInput} onChange={e => setRestaurantInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onEditRestaurant(restaurantInput.trim()); setEditingRestaurant(false); } }} autoFocus />
              <button className="edit-confirm" onClick={() => { onEditRestaurant(restaurantInput.trim()); setEditingRestaurant(false); }}>✓</button>
              <button className="edit-cancel" onClick={() => setEditingRestaurant(false)}>×</button>
            </div>
          ) : (
            <div className="items-rest-display">
              <span>{activeSplitName || 'Meal Split'}</span>
              <button className="stc-edit-btn" onClick={() => { setRestaurantInput(activeSplitName); setEditingRestaurant(true); }}>Edit</button>
            </div>
          )}
        </div>
        <ParticipantList people={people} selectedPerson={selectedPerson} onSelectPerson={onSelectPerson} onAddPerson={onGoToSetup} />
        <div className="tabs">
          <button className={`tab ${currentTab === 'all' ? 'active' : 'inactive'}`} onClick={() => onSetTab('all')}>All Items</button>
          <button className={`tab ${currentTab === 'you' ? 'active' : 'inactive'}`} onClick={() => onSetTab('you')}>Yours</button>
          <button className={`tab ${currentTab === 'unassigned' ? 'active' : 'inactive'}`} onClick={() => onSetTab('unassigned')}>Unassigned</button>
        </div>
      </div>

      {!hasOwnerToken && (
        <div className="recovery-bar">
          <div className="recovery-bar-title">Owner token not found. Enter your token to edit this split.</div>
          <div className="form-row">
            <input type="text" className="recovery-input" placeholder="Paste owner token..." value={recoveryToken} onChange={e => setRecoveryToken(e.target.value)} />
            <button className="recovery-btn" onClick={() => { if (recoveryToken.trim()) { onRecoverToken(recoveryToken.trim()); setRecoveryToken(''); } }}>Restore</button>
          </div>
        </div>
      )}

      <div className="add-item-bar">
        <div className="add-item-row">
          <input type="text" className="add-item-input add-item-name" placeholder="Add custom item name" value={newItemName} onChange={e => setNewItemName(e.target.value)} />
          <input type="number" className="add-item-input add-item-price" placeholder="Price" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} />
          <button className="btn add-item-btn" onClick={handleAdd}>+</button>
        </div>
      </div>

      <div className="items-list" id="items-list">
        {filteredItems.map(item => {
          const assigned = assignments[item.id] || [];
          const isMine = assigned.includes(selectedPerson);
          const avatars = assigned.map(pid => {
            const p = people[pid];
            if (!p) return null;
            return <div key={pid} className="item-avatar">{p.name.charAt(0)}</div>;
          });

          return (
            <div key={item.id} className="item-row" onClick={() => onToggleAssignment(item.id)}>
              <div className={`item-check ${isMine ? 'checked' : ''}`}>{isMine && '✓'}</div>
              <div className="item-info">
                {editingId === item.id ? (
                  <div className="edit-row" onClick={e => e.stopPropagation()}>
                    <input type="text" className="edit-input edit-name" value={editName} onChange={e => setEditName(e.target.value)} />
                    <input type="number" className="edit-input edit-price" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
                    <button className="edit-confirm" onClick={confirmEdit}>✓</button>
                    <button className="edit-cancel" onClick={cancelEdit}>×</button>
                  </div>
                ) : (
                  <>
                    <div className="item-name">{item.name}</div>
                    <div className="item-qty">Qty {item.qty} · {assigned.length > 0 ? 'shared' : 'unassigned'}</div>
                    <div className="item-assignees">{avatars}</div>
                  </>
                )}
              </div>
              <div className="item-actions">
                <div className="item-price">₹{(item.price / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <button className="item-action-btn edit" onClick={e => startEdit(item.id, item.name, item.price / 100, e)} aria-label="Edit item">✎</button>
                <button className="item-action-btn delete" onClick={e => { e.stopPropagation(); onDeleteItem(item.id); }} aria-label="Delete item">×</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="items-footer">
        <div className="items-footer-summary">
          <div>
            <div className="items-footer-label">Your subtotal</div>
            <div className="items-footer-val">₹{(mySubtotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="items-footer-summary-right">
            <div className="items-footer-label">Bill total</div>
            <div className="items-footer-val">₹{(billSubtotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={onDone}>Confirm & Share Split</button>
      </div>
    </div>
  );
};
