import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  CircleUserRound, Info, Library, Link2, MonitorPlay, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { cn, imageSrc } from '@/lib/utils';
import { NAV_ORDER, VIEW_TITLES, viewPath, type ViewName } from '@/lib/routes';
import { ACCOUNT_PLATFORMS, platformInfo, platformShort } from '@/lib/platforms';
import type { Platform } from '@/lib/types';
import { ThemeChoice } from '@/components/theme-toggle';
import { VolumeControl } from '@/components/volume-control';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';

const ICONS: Record<ViewName, typeof Link2> = {
  home: Link2,
  user: Library,
  preview: MonitorPlay,
  accounts: CircleUserRound,
  about: Info,
};

const EXPANDED_WIDTH = 252;
const COLLAPSED_WIDTH = 76;

function AccountChip({ platform, expanded }: { platform: Platform; expanded: boolean }) {
  const user = useAuth(state => state.users[platform]);
  const openLogin = useUi(state => state.openLogin);
  const info = platformInfo(platform);

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => openLogin(platform)}
        title={`登录${info.label}`}
        className={cn(
          'flex items-center rounded-lg py-1.5 text-left text-[12.5px] text-rail-foreground transition-colors hover:bg-white/8 hover:text-rail-active-foreground',
          expanded ? 'gap-2.5 px-2' : 'justify-center px-0',
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/15">
          <CircleUserRound className="size-3.5" />
        </span>
        {expanded && <span className="min-w-0 flex-1 truncate">登录{info.short}</span>}
      </button>
    );
  }

  return (
    <NavLink
      to="/accounts"
      title={`${user.nickname || '已登录'} · ${info.label} · ID ${user.userId}`}
      className={({ isActive }) => cn(
        'flex items-center gap-2.5 rounded-lg py-1.5 transition-colors',
        expanded ? 'px-2' : 'justify-center px-0',
        isActive
          ? 'bg-rail-active text-rail-active-foreground'
          : 'text-rail-foreground hover:bg-white/8 hover:text-rail-active-foreground',
      )}
    >
      <img
        src={imageSrc(user.avatar)}
        alt=""
        className="size-7 shrink-0 rounded-full border border-white/20 object-cover"
        onError={event => { event.currentTarget.src = '/placeholder.svg'; }}
      />
      {expanded && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-rail-active-foreground">
            {user.nickname || '已登录'}
          </span>
          <span className="block truncate text-[11px] text-rail-foreground">
            {platformShort(platform)} · ID {user.userId}
          </span>
        </span>
      )}
    </NavLink>
  );
}

/**
 * 侧边栏。
 *
 * 层级自上而下：品牌 → 主导航 → 账号 → 外观与音量。收起时只留图标与账号头像，
 * 展开时补上文字标签、账号详情与外观设置。展开状态写在本机，默认收起。
 *
 * 窄屏（< md）没有展开空间，此时它退化成顶部图标条，账号与外观入口交给顶栏——
 * 与其做一个半成品的抽屉，不如让每个断点只有一套明确的交互。
 */
export function Sidebar() {
  const collapsed = useUi(state => state.sidebarCollapsed);
  const toggleSidebar = useUi(state => state.toggleSidebar);
  const location = useLocation();
  const expanded = !collapsed;

  // 窄屏下始终按收起渲染，避免布局在断点处抖动
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(min-width: 768px)');
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const showExpanded = wide && expanded;

  const itemClass = (active: boolean) => cn(
    'flex items-center rounded-lg transition-colors',
    showExpanded ? 'h-9 gap-2.5 px-2.5 text-[13.5px]' : 'size-11 justify-center',
    active
      ? 'bg-rail-active text-rail-active-foreground'
      : 'text-rail-foreground hover:bg-white/8 hover:text-rail-active-foreground',
  );

  return (
    <nav
      aria-label="主导航"
      aria-expanded={wide ? expanded : undefined}
      style={{ '--rail-width': `${showExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH}px` } as React.CSSProperties}
      className={cn(
        'flex shrink-0 items-center gap-1 bg-rail px-3 py-2',
        'md:h-full md:flex-col md:items-stretch md:gap-1 md:px-3 md:py-4',
        'md:w-[var(--rail-width)] md:transition-[width] md:duration-[250ms] md:ease-[cubic-bezier(0.4,0,0.2,1)]',
      )}
    >
      {/* 收起时 76px 的轨道放不下并排的品牌与开关，因此竖排；展开时改为两端对齐 */}
      <div
        className={cn(
          'flex items-center gap-1',
          showExpanded ? 'justify-between gap-2 md:mb-3' : 'md:mb-2 md:flex-col md:gap-1',
        )}
      >
        <NavLink to="/" aria-label="MusicForUrl 首页" className="flex items-center gap-2.5 md:min-w-0">
          <img src="/brand.svg" alt="" className="size-7 shrink-0" />
          {showExpanded && (
            <span className="truncate text-[14px] font-semibold text-rail-active-foreground">MusicForUrl</span>
          )}
        </NavLink>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={expanded ? '收起侧边栏' : '展开侧边栏'}
          aria-controls="main-navigation"
          title={expanded ? '收起侧边栏' : '展开侧边栏'}
          className="hidden size-8 shrink-0 place-items-center rounded-lg text-rail-foreground transition-colors hover:bg-white/8 hover:text-rail-active-foreground md:grid"
        >
          {expanded ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
      </div>

      <ul id="main-navigation" className="contents md:flex md:flex-col md:gap-1">
        {NAV_ORDER.map(view => {
          const Icon = ICONS[view];
          const active = location.pathname.replace(/\.html$/, '') === viewPath(view);
          return (
            <li key={view} className="contents">
              <NavLink
                to={viewPath(view)}
                end={view === 'home'}
                title={showExpanded ? undefined : VIEW_TITLES[view]}
                aria-label={VIEW_TITLES[view]}
                aria-current={active ? 'page' : undefined}
                className={itemClass(active)}
              >
                <Icon className="size-[18px] shrink-0" />
                {showExpanded && <span className="truncate">{VIEW_TITLES[view]}</span>}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className="ml-auto flex items-center gap-1 md:ml-0 md:mt-auto md:flex-col md:items-stretch md:gap-2">
        <div className="hidden md:flex md:flex-col md:gap-1.5 md:border-t md:border-white/10 md:pt-3">
          {showExpanded && (
            <p className="px-2 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-rail-foreground/70">
              账号
            </p>
          )}
          {ACCOUNT_PLATFORMS.map(item => (
            <AccountChip key={item.id} platform={item.id} expanded={showExpanded} />
          ))}
        </div>

        {showExpanded && (
          <div className="mt-1 rounded-lg border border-white/10 p-2.5">
            <p className="pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-rail-foreground/70">
              外观
            </p>
            <ThemeChoice tone="rail" />
            <div className="mt-2.5 border-t border-white/10 pt-2.5">
              <p className="pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-rail-foreground/70">
                音量
              </p>
              <VolumeControl tone="rail" compact />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
