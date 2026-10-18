import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/app-shell';
import { VIEW_TITLES, routeFromPath } from '@/lib/routes';

// 逐视图分包：静态资源在 Cloudflare 免费且不限量，这里优化的是首屏体积
const HomeView = React.lazy(() => import('@/views/home').then(module => ({ default: module.HomeView })));
const UserView = React.lazy(() => import('@/views/user').then(module => ({ default: module.UserView })));
const AccountsView = React.lazy(() => import('@/views/accounts').then(module => ({ default: module.AccountsView })));
const PreviewView = React.lazy(() => import('@/views/preview').then(module => ({ default: module.PreviewView })));
const AboutView = React.lazy(() => import('@/views/about').then(module => ({ default: module.AboutView })));

export default function App() {
  const location = useLocation();
  const view = routeFromPath(location.pathname);

  React.useEffect(() => {
    document.title = `${VIEW_TITLES[view]} · MusicForUrl`;
  }, [view]);

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeView />} />
        <Route path="user" element={<UserView />} />
        <Route path="accounts" element={<AccountsView />} />
        <Route path="preview" element={<PreviewView />} />
        <Route path="about" element={<AboutView />} />
        {/* 旧版有 /user.html 这个入口，保留重定向以免旧链接失效 */}
        <Route path="user.html" element={<Navigate to="/user" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
