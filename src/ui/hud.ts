/**
 * 界面绑定：按钮 / 开关 / 快捷键 / 统计
 */
import type { App } from '../core/App';
import type { QualityLevel } from '../config';

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少 DOM 节点 #${id}`);
  return el as T;
}

export interface Hud {
  showReady(): void;
  destroy(): void;
}

/** 供 main 在构建过程中直接更新加载条 */
export function setLoaderProgress(ratio: number, label: string): void {
  const fill = document.getElementById('loader-fill');
  const status = document.getElementById('loader-status');
  if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
  if (status) status.textContent = label;
}

export function setupHud(app: App): Hud {
  const loader = need<HTMLDivElement>('loader');

  const title = need<HTMLElement>('hud-title');
  const panel = need<HTMLElement>('hud-panel');
  const panelToggle = need<HTMLButtonElement>('panel-toggle');
  const btnExplode = need<HTMLButtonElement>('btn-explode');
  const btnExplodeLabel = need<HTMLElement>('btn-explode-label');
  const btnOrbit = need<HTMLButtonElement>('btn-orbit');
  const btnOrbitLabel = need<HTMLElement>('btn-orbit-label');
  const btnReset = need<HTMLButtonElement>('btn-reset');
  const chkAo = need<HTMLInputElement>('chk-ao');
  const chkBloom = need<HTMLInputElement>('chk-bloom');
  const chkShadows = need<HTMLInputElement>('chk-shadows');
  const chkWires = need<HTMLInputElement>('chk-wires');
  const segQuality = need<HTMLElement>('seg-quality');
  const stat = need<HTMLElement>('stat');

  // ---- 加载进度 ----
  const showReady = () => {
    loader.classList.add('is-hidden');
    title.classList.add('is-ready');
    panel.classList.add('is-ready');
    document.querySelector('.hud--foot')?.classList.add('is-ready');
  };

  // ---- 爆炸 / 重组 ----
  let explodeOn = false;
  const syncExplode = () => {
    btnExplode.classList.toggle('is-on', explodeOn);
    btnExplodeLabel.textContent = explodeOn ? '重组归位' : '爆炸分解';
  };
  const toggleExplode = () => {
    explodeOn = !explodeOn;
    app.toggleExplode();
    syncExplode();
  };
  btnExplode.addEventListener('click', toggleExplode);

  // ---- 自动环绕 ----
  let orbitOn = true;
  const syncOrbit = () => {
    btnOrbitLabel.textContent = `自动环绕：${orbitOn ? '开' : '关'}`;
  };
  btnOrbit.addEventListener('click', () => {
    orbitOn = !orbitOn;
    app.setAutoOrbit(orbitOn);
    syncOrbit();
  });

  btnReset.addEventListener('click', () => app.resetView());

  // ---- 显示开关 ----
  chkAo.addEventListener('change', () => app.setAo(chkAo.checked));
  chkBloom.addEventListener('change', () => app.setBloom(chkBloom.checked));
  chkShadows.addEventListener('change', () => app.setShadows(chkShadows.checked));
  chkWires.addEventListener('change', () => app.setWireframe(chkWires.checked));

  // ---- 画质 ----
  segQuality.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = (btn as HTMLElement).dataset.q as QualityLevel;
      app.setQuality(q);
      chkAo.checked = app.qualityLevel !== 'low';
      chkBloom.checked = app.qualityLevel !== 'low';
      segQuality.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      stat.textContent = `已切换至「${btn.textContent}」画质`;
    });
  });

  // ---- 面板折叠 ----
  panelToggle.addEventListener('click', () => {
    panel.classList.toggle('is-collapsed');
  });

  // ---- 快捷键 ----
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        toggleExplode();
        break;
      case 'KeyR':
        orbitOn = !orbitOn;
        app.setAutoOrbit(orbitOn);
        syncOrbit();
        break;
      case 'Digit0':
        app.resetView();
        break;
      case 'KeyW':
        chkWires.checked = !chkWires.checked;
        app.setWireframe(chkWires.checked);
        break;
      default:
        break;
    }
  };
  window.addEventListener('keydown', onKey);

  // ---- 统计 ----
  let frames = 0;
  const timer = window.setInterval(() => {
    frames++;
    void frames;
    const s = app.stats;
    if (s.fps <= 0) return;
    const k = (s.triangles / 1000).toFixed(0);
    stat.textContent = `${s.fps} FPS · ${s.calls} draw · ${k}k 三角面`;
  }, 500);

  app.onAutoDegrade = (level) => {
    stat.textContent = `性能不足，已自动降至「${{ low: '低', medium: '中', high: '高' }[level]}」画质`;
    segQuality.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('is-active', (b as HTMLElement).dataset.q === level);
    });
    chkAo.checked = level !== 'low';
    chkBloom.checked = level !== 'low';
  };

  return {
    showReady,
    destroy() {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    },
  };
}
