import React, { useMemo } from 'react';

const CONFETTI_COLORS = ['#7C6FFF', '#22D3A3', '#F59E0B', '#F87171', '#A78BFA'];

interface ConfettiOverlayProps {
  active: boolean;
}

export const ConfettiOverlay: React.FC<ConfettiOverlayProps> = ({ active }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }, () => ({
        left: `${Math.random() * 100}%`,
        top: '-20px',
        background: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        width: `${4 + Math.random() * 8}px`,
        height: `${4 + Math.random() * 8}px`,
        animationDuration: `${1.5 + Math.random() * 2}s`,
        animationDelay: `${Math.random() * 0.5}s`,
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
      })),
    [],
  );

  return (
    <div className="confetti-container" id="confetti">
      {active &&
        pieces.map((style, i) => <div key={i} className="confetti-piece" style={style} />)}
    </div>
  );
};
