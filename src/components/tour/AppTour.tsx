import { useCallback, useMemo } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { t, getLocale } from '@/i18n';
import { useNavigate } from 'react-router-dom';

const LS_KEY = 'gc.tour.completed';

export function markTourCompletedLocal() {
  try { localStorage.setItem(LS_KEY, '1'); } catch {}
}
export function hasCompletedLocal() {
  try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
}

export type TourId = 'overview' | 'upload' | 'archive' | 'logs';

interface Step {
  route?: string;
  selector: string;
  titleKey: string;
  bodyKey: string;
  side?: 'left' | 'right' | 'top' | 'bottom';
  optional?: boolean;
}

const TOURS: Record<TourId, Step[]> = {
  overview: [
    { selector: '[data-tour="brand"]', titleKey: 'tour.step.brand.title', bodyKey: 'tour.step.brand.body', side: 'right' },
    { selector: '[data-tour="nav-/"]', titleKey: 'tour.step.dashboard.title', bodyKey: 'tour.step.dashboard.body', side: 'right' },
    { selector: '[data-tour="quick-create"], [data-tour="nav-/upload"]', titleKey: 'tour.step.upload.title', bodyKey: 'tour.step.upload.body', side: 'right', optional: true },
    { selector: '[data-tour="nav-/archive"]', titleKey: 'tour.step.archive.title', bodyKey: 'tour.step.archive.body', side: 'right', optional: true },
    { selector: '[data-tour="nav-/templates"]', titleKey: 'tour.step.templates.title', bodyKey: 'tour.step.templates.body', side: 'right', optional: true },
    { selector: '[data-tour="nav-/approvals"]', titleKey: 'tour.step.approvals.title', bodyKey: 'tour.step.approvals.body', side: 'right', optional: true },
    { selector: '[data-tour="nav-/logs"]', titleKey: 'tour.step.logs.title', bodyKey: 'tour.step.logs.body', side: 'right', optional: true },
    { selector: '[data-tour="nav-/admin"]', titleKey: 'tour.step.admin.title', bodyKey: 'tour.step.admin.body', side: 'right', optional: true },
    { selector: '[data-tour="header-actions"]', titleKey: 'tour.step.header.title', bodyKey: 'tour.step.header.body', side: 'bottom' },
    { selector: '[data-tour="help"]', titleKey: 'tour.step.help.title', bodyKey: 'tour.step.help.body', side: 'bottom' },
    { selector: '[data-tour="user"]', titleKey: 'tour.step.user.title', bodyKey: 'tour.step.user.body', side: 'top' },
  ],
  upload: [
    { route: '/upload', selector: '[data-tour="tpl-card"]', titleKey: 'tour.upload.tpl.title', bodyKey: 'tour.upload.tpl.body', side: 'right' },
    { selector: '[data-tour="upload-card"]', titleKey: 'tour.upload.file.title', bodyKey: 'tour.upload.file.body', side: 'right' },
    { selector: '[data-tour="primary-cta"]', titleKey: 'tour.upload.cta.title', bodyKey: 'tour.upload.cta.body', side: 'top' },
    { selector: '[data-tour="preview-panel"]', titleKey: 'tour.upload.preview.title', bodyKey: 'tour.upload.preview.body', side: 'left' },
    { selector: '[data-tour="finalized"]', titleKey: 'tour.upload.finalized.title', bodyKey: 'tour.upload.finalized.body', side: 'left', optional: true },
    { selector: '[data-tour="brand"]', titleKey: 'tour.upload.done.title', bodyKey: 'tour.upload.done.body', side: 'right' },
  ],
  archive: [
    { route: '/archive', selector: '[data-tour="archive-stats"]', titleKey: 'tour.archive.stats.title', bodyKey: 'tour.archive.stats.body', side: 'bottom' },
    { selector: '[data-tour="archive-filters"]', titleKey: 'tour.archive.filters.title', bodyKey: 'tour.archive.filters.body', side: 'bottom' },
    { selector: '[data-tour="archive-export"]', titleKey: 'tour.archive.export.title', bodyKey: 'tour.archive.export.body', side: 'left' },
  ],
  logs: [
    { route: '/logs', selector: '[data-tour="logs-filters"]', titleKey: 'tour.logs.filters.title', bodyKey: 'tour.logs.filters.body', side: 'bottom' },
    { selector: '[data-tour="logs-events"]', titleKey: 'tour.logs.events.title', bodyKey: 'tour.logs.events.body', side: 'top' },
  ],
};

function waitForSelector(selector: string, timeoutMs = 3000): Promise<Element | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const start = Date.now();
    const id = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(id); resolve(el); }
      else if (Date.now() - start > timeoutMs) { clearInterval(id); resolve(null); }
    }, 100);
  });
}

export function useAppTour() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { hasPermission, role } = useAuth();

  const available = useMemo<TourId[]>(() => {
    const list: TourId[] = ['overview'];
    if (hasPermission('upload')) list.push('upload');
    if (hasPermission('view_archive')) list.push('archive');
    if (hasPermission('view_logs') || role === 'admin') list.push('logs');
    return list;
  }, [hasPermission, role]);

  const persistCompletion = useCallback(async () => {
    markTourCompletedLocal();
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ tour_completed_at: new Date().toISOString() } as any)
          .eq('user_id', user.id);
        await refreshProfile();
      } catch (e) {
        console.warn('Failed to persist tour completion', e);
      }
    }
  }, [user, refreshProfile]);

  const start = useCallback(async (tourId: TourId = 'overview') => {
    const steps = TOURS[tourId] ?? [];
    if (steps.length === 0) return;

    // Pre-navigate to the first step's route if needed.
    if (steps[0].route && window.location.pathname !== steps[0].route) {
      navigate(steps[0].route);
      await waitForSelector(steps[0].selector);
    } else {
      await waitForSelector(steps[0].selector, 1500);
    }

    let d: ReturnType<typeof driver> | null = null;

    const driverSteps = steps.map((s, i) => ({
      element: s.selector,
      popover: {
        title: t(s.titleKey),
        description: t(s.bodyKey),
        side: s.side ?? 'bottom',
        align: 'start' as const,
        onNextClick: async () => {
          const next = steps[i + 1];
          if (!next) { d?.destroy(); return; }
          if (next.route && window.location.pathname !== next.route) {
            navigate(next.route);
          }
          const el = await waitForSelector(next.selector, 4000);
          if (!el && next.optional) {
            // Skip optional missing step by jumping ahead recursively.
            const remaining = steps.slice(i + 2);
            if (remaining.length === 0) { d?.destroy(); return; }
            // Find next available
            for (let j = 0; j < remaining.length; j++) {
              const r = remaining[j];
              if (r.route && window.location.pathname !== r.route) navigate(r.route);
              const found = await waitForSelector(r.selector, 4000);
              if (found) {
                d?.moveTo(i + 2 + j);
                return;
              }
            }
            d?.destroy();
            return;
          }
          d?.moveNext();
        },
      },
    }));

    d = driver({
      showProgress: true,
      allowClose: true,
      animate: true,
      smoothScroll: true,
      overlayOpacity: 0.6,
      stagePadding: 6,
      stageRadius: 10,
      disableActiveInteraction: false,
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.back'),
      doneBtnText: t('tour.finish'),
      progressText: '{{current}} / {{total}}',
      steps: driverSteps,
      onDestroyed: () => { void persistCompletion(); },
    });

    if (typeof document !== 'undefined') {
      document.documentElement.dir = getLocale() === 'ar' ? 'rtl' : 'ltr';
    }

    d.drive();
  }, [persistCompletion, navigate]);

  return { start, available };
}