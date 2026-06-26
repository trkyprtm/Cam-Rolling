import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Gracefully handle and suppress benign Vite WebSocket connection/HMR errors 
// which occur in sandboxed preview environments because Hot Module Replacement is disabled.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason) {
      const msg = typeof reason === 'object' ? (reason.message || '') : String(reason);
      if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('vite') || msg.includes('HMR')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('vite') || msg.includes('HMR')) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
