import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/stores/theme';
import type { ThemeName } from '@/lib/types';

const OPTIONS: { value: ThemeName; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

/**
 * 三态主题选择。写 localStorage.theme，与旧版前端共用同一个键。
 * tone="rail" 用于深色侧栏：选中态是浅色块，未选中态用侧栏前景色。
 */
export function ThemeChoice({ className, tone = 'default' }: { className?: string; tone?: 'default' | 'rail' }) {
  const theme = useTheme(state => state.theme);
  const set = useTheme(state => state.set);
  const rail = tone === 'rail';

  return (
    <div
      role="radiogroup"
      aria-label="主题"
      className={cn('inline-flex items-center gap-1 rounded-lg p-0.5', rail ? 'bg-black/25' : 'bg-muted', className)}
    >
      {OPTIONS.map(option => {
        const active = option.value === theme;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.label}
            onClick={() => set(option.value)}
            className={cn(
              'grid size-7 place-items-center rounded-md transition-colors',
              active
                ? rail ? 'bg-rail-active text-rail-active-foreground' : 'bg-card text-foreground shadow-sm'
                : rail ? 'text-rail-foreground hover:text-rail-active-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 顶栏用的单键切换：在浅色与深色之间来回，是最常用的那个动作。 */
export function ThemeToggle() {
  const resolved = useTheme(state => state.resolved);
  const toggle = useTheme(state => state.toggle);
  const dark = resolved === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
      title={dark ? '浅色模式' : '深色模式'}
      className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
