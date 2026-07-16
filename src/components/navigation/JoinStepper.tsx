import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type JoinStep = 'sign-in' | 'profile' | 'approval' | 'ready';

const ORDER: JoinStep[] = ['sign-in', 'profile', 'approval', 'ready'];
const LABELS: Record<JoinStep, string> = {
  'sign-in': 'Sign in',
  profile: 'Your profile',
  approval: 'Approval',
  ready: "You're in",
};

/**
 * Linear progress bar shown across the join flow so a brand-new user can see
 * exactly where they are and what's left.
 */
export default function JoinStepper({ current }: { current: JoinStep }) {
  const currentIdx = ORDER.indexOf(current);

  return (
    <ol className="mx-auto flex w-full max-w-lg items-center gap-2">
      {ORDER.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={step} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary bg-primary/10 text-primary',
                  !done && !active && 'border-border bg-background text-muted-foreground',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < ORDER.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 rounded-full transition-colors',
                    i < currentIdx ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                'truncate text-[11px] font-medium',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}