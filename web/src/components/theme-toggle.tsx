import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/stores/theme';

export function ThemeToggle() {
  const theme = useTheme(state => state.theme);
  const toggle = useTheme(state => state.toggle);
  const dark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
      title={dark ? '浅色模式' : '深色模式'}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
