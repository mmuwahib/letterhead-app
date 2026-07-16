import { useEffect, useState } from 'react';
import { fetchDocuments } from '@/lib/storage';

type Doc = Awaited<ReturnType<typeof fetchDocuments>>[number];

/**
 * Lightweight recents fetch with in-memory caching to avoid hammering the
 * backend. Only used by the sidebar / command palette.
 */
let cache: { at: number; rows: Doc[] } | null = null;
const TTL_MS = 60_000;

export function useRecentDocuments(limit = 5, enabled = true) {
  const [rows, setRows] = useState<Doc[]>(() => cache?.rows ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const fresh = cache && Date.now() - cache.at < TTL_MS;
    if (fresh) {
      setRows(cache!.rows);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchDocuments(limit)
      .then((data) => {
        cache = { at: Date.now(), rows: data };
        if (active) {
          setRows(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [limit, enabled]);

  return { rows: rows.slice(0, limit), loading };
}

export function invalidateRecentDocuments() {
  cache = null;
}