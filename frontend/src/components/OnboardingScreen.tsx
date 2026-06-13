import React, { useEffect, useState } from 'react';

interface Props {
  onDone: () => void;
}

export const OnboardingScreen: React.FC<Props> = ({ onDone }) => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 600);
    const t2 = setTimeout(() => setPhase(2), 1200);
    const t3 = setTimeout(() => setPhase(3), 1800);
    const t4 = setTimeout(() => setPhase(4), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <div className="onboarding-screen">
      <div className="onboarding-demo">
        <div className="onboarding-receipt">
          <div className="onboarding-receipt-header">
            <div className="onboarding-receipt-line w80" />
            <div className="onboarding-receipt-line w60" />
          </div>
          <div className="onboarding-receipt-items">
            <div className="onboarding-receipt-line w100" />
            <div className="onboarding-receipt-line w90" />
            <div className="onboarding-receipt-line w70" />
          </div>
          <div className={`onboarding-receipt-total ${phase >= 4 ? 'split' : ''}`}>
            <div className="onboarding-receipt-line w50" />
          </div>
          <div className={`onboarding-receipt-split ${phase >= 4 ? 'show' : ''}`}>
            <div className="onboarding-split-amount">1,250</div>
            <div className="onboarding-split-amount">890</div>
            <div className="onboarding-split-amount">640</div>
          </div>
        </div>

        <div className="onboarding-chips">
          <div className={`onboarding-chip ${phase >= 1 ? 'visible' : ''}`}>
            <div className="onboarding-chip-ava">K</div>
            <div className="onboarding-chip-name">Kshitij</div>
          </div>
          <div className={`onboarding-chip ${phase >= 2 ? 'visible' : ''}`}>
            <div className="onboarding-chip-ava">A</div>
            <div className="onboarding-chip-name">Arjun</div>
          </div>
          <div className={`onboarding-chip ${phase >= 3 ? 'visible' : ''}`}>
            <div className="onboarding-chip-ava">P</div>
            <div className="onboarding-chip-name">Priya</div>
          </div>
        </div>
      </div>

      <div className="onboarding-bottom">
        <div className="onboarding-brand">Wise</div>
        <div className="onboarding-tagline">Split bills. Not friendships.</div>
        <button className="btn btn-primary onboarding-cta" onClick={onDone}>
          Start a split
        </button>
      </div>
    </div>
  );
};
