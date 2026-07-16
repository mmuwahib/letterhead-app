import { useEffect } from 'react';

export interface PageMeta {
  title: string;
  description?: string;
  /** Optional key into the help drawer registry (defaults to current pathname). */
  helpKey?: string;
}

const STATE: { current: PageMeta | null; listeners: Set<() => void> } = {
  current: null,
  listeners: new Set(),
};

function emit() {
  STATE.listeners.forEach((fn) => fn());
}

export function getPageMeta(): PageMeta | null {
  return STATE.current;
}

export function subscribePageMeta(fn: () => void) {
  STATE.listeners.add(fn);
  return () => {
    STATE.listeners.delete(fn);
  };
}

/**
 * Pages call this once to register their title / description / help key.
 * The `PageHeader` component subscribes and renders the result.
 */
export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    STATE.current = meta;
    emit();
    if (typeof document !== 'undefined') {
      document.title = `${meta.title} · Gulf Cryo`;
    }
    return () => {
      if (STATE.current === meta) {
        STATE.current = null;
        emit();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.title, meta.description, meta.helpKey]);
}