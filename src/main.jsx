import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './fonts.css';
import { GOOGLE_FONTS_CSS } from '../js/shared/fonts.js';

// One stylesheet for every registered Google family (font files download only when used).
document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: GOOGLE_FONTS_CSS }));
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
