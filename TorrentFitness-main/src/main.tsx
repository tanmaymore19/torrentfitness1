import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

// Prevent uncaught errors from html5-qrcode video abort/teardown events
window.addEventListener('error', (event) => {
  const msg = typeof event.message === 'string' ? event.message : '';
  const errStr = typeof event.error === 'string' ? event.error : (event.error?.message || '');
  if (
    msg.includes('RenderedCameraImpl video surface onabort') ||
    msg.includes('RenderedCameraImpl video surface onerror') ||
    errStr.includes('RenderedCameraImpl video surface onabort') ||
    errStr.includes('RenderedCameraImpl video surface onerror')
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = String(event.reason || '');
  if (
    reason.includes('RenderedCameraImpl video surface onabort') ||
    reason.includes('RenderedCameraImpl video surface onerror')
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

