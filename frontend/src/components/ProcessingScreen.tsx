import React, { useEffect, useRef } from 'react';

interface Props {
  step: number;
  foundItemsCount: number;
  totalItems: number;
}

const stepLabels = [
  'Image uploaded',
  'Reading line items',
  'Calculating totals',
  'Building split view',
];

export const ProcessingScreen: React.FC<Props> = ({ step, foundItemsCount, totalItems }) => {
  const prevStep = useRef(step);
  const announcerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step !== prevStep.current && announcerRef.current) {
      const label = step <= 4 ? stepLabels[step - 1] || 'Processing' : 'Done';
      announcerRef.current.textContent = label;
      prevStep.current = step;
    }
  }, [step]);

  return (
    <div className="screen active" id="processing">
      <div ref={announcerRef} aria-live="assertive" aria-atomic="true" className="sr-only" />
      <div className="proc-content">
        <div className="ai-ring">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(200,241,53,0.12)" strokeWidth="3" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="#C8F135" strokeWidth="3" strokeLinecap="round" strokeDasharray="80 246" />
          </svg>
          <div className="ai-ring-inner">→</div>
        </div>
        <div className="proc-title">Reading your receipt</div>
        <div className="proc-sub">Gemini Vision is parsing the bill...</div>

        <div className="card proc-steps proc-steps-card">
          <div className="proc-step">
            <div className="proc-step-icon done">✓</div>
            <div className="proc-step-label">Image uploaded <span>· 1.2MB</span></div>
            <div className="proc-check"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg></div>
          </div>
          <div className="proc-step">
            <div className={`proc-step-icon ${step >= 2 ? 'done' : 'active'}`}>{step >= 2 ? '✓' : '...'}</div>
            <div className="proc-step-label">{step >= 2 ? `Found ${foundItemsCount || totalItems} items` : 'Reading line items'}</div>
            {step < 2 ? <div className="proc-spinner" /> : <div className="proc-check"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg></div>}
          </div>
          <div className="proc-step">
            <div className={`proc-step-icon ${step >= 3 ? 'done' : step === 2 ? 'active' : 'pending'}`}>{step >= 3 ? '✓' : '...'}</div>
            <div className="proc-step-label">{step >= 3 ? 'Tax & tip detected' : 'Calculating totals'}</div>
            {step === 2 && <div className="proc-spinner" />}
            {step >= 3 && <div className="proc-check"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg></div>}
          </div>
          <div className="proc-step">
            <div className={`proc-step-icon ${step >= 4 ? 'done' : step === 3 ? 'active' : 'pending'}`}>{step >= 4 ? '✓' : '...'}</div>
            <div className="proc-step-label">{step >= 4 ? 'Ready to split' : 'Building split view'}</div>
            {step === 3 && <div className="proc-spinner" />}
            {step >= 4 && <div className="proc-check"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg></div>}
          </div>
        </div>
      </div>
    </div>
  );
};
