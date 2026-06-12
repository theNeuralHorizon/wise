import React, { useRef, useEffect } from 'react';

function drawQRCode(canvas: HTMLCanvasElement, text: string, size = 200) {
  const ctx = canvas.getContext('2d')!;
  canvas.width = size;
  canvas.height = size;

  const modules = 25;
  const cellSize = size / modules;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  const isDark = (r: number, c: number): boolean => {
    const isFinderTL = r < 7 && c < 7;
    const isFinderTR = r < 7 && c >= modules - 7;
    const isFinderBL = r >= modules - 7 && c < 7;
    if (isFinderTL || isFinderTR || isFinderBL) {
      const localR = isFinderTR ? r : isFinderBL ? r - (modules - 7) : r;
      const localC = isFinderBL ? c : isFinderTR ? c - (modules - 7) : c;
      if (localR === 0 || localR === 6 || localC === 0 || localC === 6) return true;
      if (localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4) return true;
      return false;
    }
    if (r === 6 || c === 6) return (r + c) % 2 === 0;
    const idx = r * modules + c;
    const seed = (hash ^ (idx * 1664525 + 1013904223)) & 0xffffffff;
    return (seed & 1) === 1;
  };

  ctx.fillStyle = '#1a1a2e';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (isDark(r, c)) {
        ctx.fillRect(
          Math.round(c * cellSize),
          Math.round(r * cellSize),
          Math.ceil(cellSize),
          Math.ceil(cellSize),
        );
      }
    }
  }
}

interface QRCodeCanvasProps {
  text: string;
  size?: number;
}

export const QRCodeCanvas: React.FC<QRCodeCanvasProps> = ({ text, size = 180 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && text) {
      drawQRCode(canvasRef.current, text, size);
    }
  }, [text, size]);

  return <canvas ref={canvasRef} />;
};
