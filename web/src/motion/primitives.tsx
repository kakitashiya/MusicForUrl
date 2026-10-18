import * as React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { cn } from '@/lib/utils';

// 时长表与旧版 cloudflare/ANIMATION.md 保持一致，方便对照
export const DURATION = {
  page: { enter: 0.28, exit: 0.12 },
  tabs: { enter: 0.24, exit: 0.12 },
  list: { enter: 0.22, exit: 0.1 },
  indicator: 0.26,
  theme: 0.36,
  press: 0.09,
};

const EASE = [0.22, 0.61, 0.36, 1] as const;

export function PageTransition({ viewKey, children }: { viewKey: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={viewKey}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: DURATION.page.enter, ease: EASE }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

export function ListReveal({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <m.ul
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.025 } } }}
    >
      {children}
    </m.ul>
  );
}

export function ListItem({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <m.li
      className={className}
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
      transition={{ duration: DURATION.list.enter, ease: EASE }}
    >
      {children}
    </m.li>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/** 分段控件。滑块用 layoutId 共享元素过渡，取代旧版手写测量宽度的做法。 */
export function Segmented<T extends string>({
  value, options, onChange, className, ariaLabel,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const id = React.useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-1 rounded-md bg-muted p-1', className)}
    >
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <m.span
                layoutId={`segmented-${id}`}
                className="absolute inset-0 rounded-md bg-card shadow-sm"
                transition={{ duration: DURATION.indicator, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { AnimatePresence, m };
