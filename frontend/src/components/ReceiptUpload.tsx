import React, { useRef } from 'react';

interface Props {
  activeSplitName: string;
  onBack: () => void;
  onFileSelect: (file: File) => void;
  onMockScan: () => void;
}

export const ReceiptUpload: React.FC<Props> = ({ activeSplitName: _activeSplitName, onBack, onFileSelect, onMockScan }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <div className="screen active" id="scan">
      <div className="scan-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="white"><path d="M11 4L6 9L11 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="scan-title">Scan Receipt</span>
        <div />
      </div>

      <div className="camera-view">
        <div className="receipt-preview">
          <img src="/receipt.png" alt="Receipt" onError={e => { (e.target as HTMLImageElement).src = 'receipt.png'; }} />
        </div>
        <div className="scan-overlay">
          <div className="scan-corner tl" />
          <div className="scan-corner tr" />
          <div className="scan-corner bl" />
          <div className="scan-corner br" />
          <div className="scan-line" />
        </div>
      </div>

      <div className="scan-bottom">
        <div className="scan-hint">Position receipt within frame · AI reads automatically</div>
        <div className="scan-actions">
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>📁</button>
          <button className="shutter" onClick={() => fileInputRef.current?.click()}>
            <div className="shutter-inner" />
          </button>
          <button className="btn btn-secondary" onClick={onMockScan}>⚡</button>
        </div>
      </div>

      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileChange} />
    </div>
  );
};
