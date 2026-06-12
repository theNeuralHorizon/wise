import React from 'react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => (
  <div className={`toast ${message ? 'show' : ''}`} id="toast">
    {message}
  </div>
);
