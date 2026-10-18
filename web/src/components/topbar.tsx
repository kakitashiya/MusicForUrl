import { useLocation } from 'react-router-dom';
import { AccountMenu } from '@/components/account-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { VolumeControl } from '@/components/volume-control';
import { VIEW_TITLES, routeFromPath } from '@/lib/routes';

/**
 * 顶栏。
 *
 * 只放两类东西：当前位置（面包屑）与全局开关（账号、音量、主题）。
 * 导航在侧栏，播放控制在底部，三块区域职责不重叠。
 */
export function Topbar() {
  const location = useLocation();
  const view = routeFromPath(location.pathname);
  const isHome = view === 'home';

  return (
    <header className="flex h-[62px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-8">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
        <span className="hidden sm:inline">工作台</span>
        <span aria-hidden="true" className="hidden sm:inline">/</span>
        <h1 className="truncate text-[15px] font-semibold text-foreground">{VIEW_TITLES[view]}</h1>
        {isHome && (
          <span className="ml-1 hidden truncate text-[12.5px] text-muted-foreground lg:inline">
            把歌单变成可直接播放的 M3U8
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <VolumeControl className="hidden lg:flex" compact />
        <span aria-hidden="true" className="hidden h-5 w-px bg-border lg:block" />
        <AccountMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
