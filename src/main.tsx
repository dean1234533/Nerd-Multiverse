import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ToastProvider } from './store';
import { AuthProvider } from './auth';
import { capturePromptEvent } from './components/InstallBanner';
import App from './App';
import WhatsAppSupport from './components/WhatsAppSupport';
import './styles.css';

capturePromptEvent();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
          <WhatsAppSupport />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
