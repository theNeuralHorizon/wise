import React from 'react';

interface Props {
  open: boolean;
  taxRate: number;
  tipRate: number;
  onClose: () => void;
  onConfirm: (tax: number, tip: number) => void;
}

export const TaxTipModal: React.FC<Props> = ({ open, taxRate, tipRate, onClose, onConfirm }) => {
  const [taxVal, setTaxVal] = React.useState(String(Math.round(taxRate * 100)));
  const [tipVal, setTipVal] = React.useState(String(Math.round(tipRate * 100)));

  React.useEffect(() => {
    if (open) {
      setTaxVal(String(Math.round(taxRate * 100)));
      setTipVal(String(Math.round(tipRate * 100)));
    }
  }, [open, taxRate, tipRate]);

  return (
    <div className={`modal-backdrop ${open ? 'open' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-sheet">
        <div className="modal-handle" />
        <div className="modal-title">Edit Tax & Tip</div>
        <div className="modal-sub">Adjust percentages — all amounts update instantly</div>
        <div className="modal-field">
          <div className="modal-label">Tax Rate</div>
          <div className="modal-input-row">
            <input type="number" value={taxVal} onChange={e => setTaxVal(e.target.value)} min="0" max="50" step="0.5" className="modal-input-right" />
            <span className="modal-input-suffix">%</span>
          </div>
        </div>
        <div className="modal-field">
          <div className="modal-label">Tip / Service Charge</div>
          <div className="modal-input-row">
            <input type="number" value={tipVal} onChange={e => setTipVal(e.target.value)} min="0" max="50" step="0.5" className="modal-input-right" />
            <span className="modal-input-suffix">%</span>
          </div>
        </div>
        <div className="modal-btns">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-confirm" onClick={() => onConfirm(parseFloat(taxVal) / 100, parseFloat(tipVal) / 100)}>Apply Changes</button>
        </div>
      </div>
    </div>
  );
};
