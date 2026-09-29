/**
 * 入口
 * ------------------------------------------------------------------
 * 天坛祈年殿 · 100% 程序化生成的 WebGL 重建
 */
import './style.css';
import { App } from './core/App';
import type { QualityLevel } from './config';
import { setLoaderProgress, setupHud } from './ui/hud';

/** 依据设备能力挑选初始画质 */
function detectQuality(): QualityLevel {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile || cores <= 4 || mem <= 3) return 'low';
  if (cores <= 8 || mem <= 6) return 'medium';
  return 'high';
}

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('找不到 #stage canvas');

  const app = new App({
    canvas,
    quality: detectQuality(),
    onProgress: setLoaderProgress,
  });

  const hud = setupHud(app);

  window.addEventListener('resize', app.onResize);
  window.addEventListener('orientationchange', app.onResize);

  try {
    await app.build();
  } catch (err) {
    console.error('[祈年殿] 构建失败', err);
    setLoaderProgress(1, `构建失败：${(err as Error).message}`);
    return;
  }

  app.start();
  hud.showReady();

  // 调试入口
  (window as unknown as Record<string, unknown>).tiantan = app;
  window.addEventListener('beforeunload', () => {
    app.stop();
    hud.destroy();
  });
}

bootstrap();
