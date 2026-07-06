
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { runOneTimeCacheReset } from './services/cacheReset';

// One-time local cache cleanup after the app update (runs once per device,
// clears only cache entries — auth/profiles/settings are untouched).
runOneTimeCacheReset();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);