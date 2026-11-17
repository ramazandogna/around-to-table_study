import './net/startOver';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/tiny5/400.css';
import { App } from './App';
import { keepBlock } from './state/block';
import { useGameStore } from './state/store';
import './styles.css';

// Tests reach the store before the world exists (the sign-in and the door); dev builds only.
if (import.meta.env.DEV) Object.assign(window, { __store: useGameStore });

keepBlock();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
