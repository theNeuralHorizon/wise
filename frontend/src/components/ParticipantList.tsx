import React from 'react';
import type { Person } from '../schemas';

interface Props {
  people: Person[];
  selectedPerson: number;
  onSelectPerson: (idx: number) => void;
  onAddPerson: () => void;
}

export const ParticipantList: React.FC<Props> = ({ people, selectedPerson, onSelectPerson, onAddPerson }) => (
  <div className="pax-row" id="pax-row">
    {people.map((p, idx) => (
      <div key={idx} className="pax-chip" onClick={() => onSelectPerson(idx)}>
        <div className={`pax-ava ${selectedPerson === idx ? 'selected' : ''}`}>{p.name.charAt(0)}</div>
        <div className="pax-chip-name">{p.name.split(' ')[0]}</div>
      </div>
    ))}
    <div className="pax-chip" onClick={onAddPerson}>
      <div className="pax-add">+</div>
      <div className="pax-chip-name">Edit</div>
    </div>
  </div>
);
