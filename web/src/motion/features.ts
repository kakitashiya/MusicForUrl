import { domMax } from 'motion/react';

/**
 * 动画特性单独成块，由 LazyMotion 动态加载。
 *
 * domMax 包含布局动画所需的全部能力，体积不小；首页浏览、导航切换并不需要它
 * 参与首屏。拆成异步 chunk 后，它只在浏览器空闲时补齐，交互不会被阻塞。
 */
export default domMax;
