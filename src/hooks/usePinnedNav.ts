import { useCallback, useEffect, useState } from 'react';

const KEY = 'gc.nav.pins';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(pins: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pins));
  } catch {
    /* ignore */
  }
}

export function usePinnedNav() {
  const [pins, setPins] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : read(),
  );

  // Listen for changes from other components / tabs.
  useEffect(() => {
    const handler = () => setPins(read());
    window.addEventListener('storage', handler);
    window.addEventListener('gc.nav.pins.changed', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('gc.nav.pins.changed', handler);
    };
  }, []);

  const toggle = useCallback((path: string) => {
    setPins((curr) => {
      const next = curr.includes(path)
        ? curr.filter((p) => p !== path)
        : [...curr, path];
      write(next);
      window.dispatchEvent(new Event('gc.nav.pins.changed'));
      return next;
    });
  }, []);

  const isPinned = useCallback((path: string) => pins.includes(path), [pins]);

  return { pins, toggle, isPinned };
}