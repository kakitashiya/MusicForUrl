import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import App from './App';
import { useAuth } from './stores/auth';
import { useTheme } from './stores/theme';
import './fonts.css';
import './index.css';

// domMax 只在需要布局动画时才有用，异步加载可以把它移出首屏关键路径
const loadMotionFeatures = () => import('./motion/features').then(module => module.default);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 列表页在标签之间来回切换不应重复发请求，这是配额决策而非 DX 决策
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Bootstrap() {
  const refreshAll = useAuth(state => state.refreshAll);
  const applyTheme = useTheme(state => state.apply);

  React.useEffect(() => {
    applyTheme();
    void refreshAll();
  }, [applyTheme, refreshAll]);

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" 跟随系统设置，CSS 层另外尊重 dataset.motion。
          features 异步加载，首屏只承担 motion 核心，domMax 随后补齐。 */}
      <MotionConfig reducedMotion="user">
        <LazyMotion features={loadMotionFeatures} strict>
          <BrowserRouter>
            <Bootstrap />
            <Toaster position="top-center" richColors />
          </BrowserRouter>
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
);
