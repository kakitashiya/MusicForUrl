import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/stores/theme';

export function ThemeToggle() {
  const theme = useTheme(state => state.theme);
  const toggle = useTheme(state => state.toggle);
  const dark = theme === 'dark';
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
