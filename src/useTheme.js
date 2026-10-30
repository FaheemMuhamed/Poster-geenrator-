import { useSyncExternalStore } from 'react';

// Light / dark interface theme. Follows the system until the person picks one,
// then remembers it. index.html applies it before first paint to avoid a flash.
const KEY = 'morva-theme';
const media = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

let choice = null;
try { choice = localStorage.getItem(KEY); } catch {}

const resolved = () => choice || (media.matches ? 'dark' : 'light');

function apply() {
  document.documentElement.classList.toggle('dark', resolved() === 'dark');
  listeners.forEach((f) => f());
}
media.addEventListener('change', () => { if (!choice) apply(); });
apply();

export function setTheme(theme) {
  choice = theme;
  try { localStorage.setItem(KEY, theme); } catch {}
  apply();
}

export function useTheme() {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, resolved);
}

// The current value of a theme colour token, e.g. themeColor('--stage').
export const themeColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
