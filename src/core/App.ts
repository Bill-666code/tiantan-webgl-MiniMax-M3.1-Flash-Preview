/**
 * 应用核心
 * ------------------------------------------------------------------
 * 渲染器 / 相机 / 控制器 / 后处理 / 画质自适应 / 帧循环。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { BUILDING, CAMERA, QUALITY, SKY } from '../config';
import type { QualityLevel, QualityProfile } from '../config';
import { getMaterials } from '../gfx/materials';
import { setTextureAnisotropy, vignetteTexture } from '../gfx/textures';
import { buildAssembly } from '../build/Assembly';
import type { AssemblyResult } from '../build/Assembly';
import { buildGreens } from '../build/trees';
import { createSky } from './sky';
import type { SkyResult } from './sky';
import { ExplodeController } from '../anim/ExplodeController';
import { buildGround } from './ground';

export interface AppOptions {
  canvas: HTMLCanvasElement;
  quality: QualityLevel;
  onProgress?: (ratio: number, label: string) => void;
}

export class App {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private gtaoPass: GTAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private outputPass: OutputPass | null = null;

  private sky: SkyResult | null = null;
  private assembly: AssemblyResult | null = null;
  private explode: ExplodeController | null = null;
  private envScene = new THREE.Group();

  private quality: QualityProfile;
  private qualityName: QualityLevel;
  private lastTime = 0;
  private elapsed = 0;
  private raf = 0;
  private running = false;
  private frameTimes: number[] = [];
  private degradedFrom: QualityLevel | null = null;

  private aoEnabled = true;
  private bloomEnabled = true;
  private shadowsEnabled = true;
  private wireframe = false;
  private autoOrbit = true;
  private userInteractingUntil = 0;
  /** 爆炸/重组时平滑过渡到对应取景；用户操作后交还控制权 */
  private frameGoal: [number, number, number, number] | null = null;

  /** 统计信息（供 UI 显示） */
  readonly stats = { fps: 0, calls: 0, triangles: 0 };

  constructor(private opts: AppOptions) {
    this.qualityName = opts.quality;
    this.quality = QUALITY[opts.quality];
    setTextureAnisotropy(this.quality.anisotropy);

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: false, // 由 composer 的 MSAA render target 承担
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = SKY.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
    this.camera.position.set(...CAMERA.start);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...CAMERA.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = CAMERA.minDistance;
    this.controls.maxDistance = CAMERA.maxDistance;
    this.controls.minPolarAngle = CAMERA.minPolar;
    this.controls.maxPolarAngle = CAMERA.maxPolar;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = CAMERA.autoRotateSpeed;
    this.controls.addEventListener('start', () => {
      this.userInteractingUntil = performance.now() + 4000;
      this.frameGoal = null;
    });
    this.controls.update();

    this.scene.fog = new THREE.FogExp2(SKY.fogColor, SKY.fogDensity);

    this.onResize();
  }

  /** 分步构建，带进度回调（让加载界面不卡死） */
  async build(): Promise<void> {
    const progress = this.opts.onProgress ?? (() => undefined);
    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    progress(0.05, '生成天穹与环境光…');
    await nextFrame();
    this.sky = createSky(this.renderer, this.scene);

    progress(0.18, '铺砌广场地面…');
    await nextFrame();
    this.scene.add(this.envScene);
    this.envScene.add(buildGround());

    progress(0.32, '砌筑三层汉白玉台基…');
    await nextFrame();
    this.assembly = buildAssembly(this.quality);
    this.scene.add(this.assembly.root);

    progress(0.78, '栽种松槐…');
    await nextFrame();
    const greens = buildGreens(this.quality.treeCount, 38, 165);
    this.scene.add(greens.group);

    progress(0.88, '装配爆炸图层…');
    await nextFrame();
    this.explode = new ExplodeController(this.assembly.layers);
    this.explode.reset();

    progress(0.94, '构建后处理管线…');
    await nextFrame();
    this.buildComposer();
    this.applyShadowSettings();

    progress(1, '就绪');
    await nextFrame();
  }

  private buildComposer(): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: this.qualityName === 'low' ? 0 : 4,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    if (this.quality.ao && this.aoEnabled) {
      this.gtaoPass = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.gtaoPass.updateGtaoMaterial({
        radius: 2.2,
        distanceExponent: 1.4,
        thickness: 1.6,
        scale: 1.0,
        samples: this.qualityName === 'high' ? 16 : 12,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
      this.gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 12 });
      this.gtaoPass.blendIntensity = 0.85;
      this.composer.addPass(this.gtaoPass);
    }

    if (this.quality.bloom && this.bloomEnabled) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.24, 0.62, 0.9);
      this.composer.addPass(this.bloomPass);
    }

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  /* ---------------- 外部控制 ---------------- */

  setAutoOrbit(on: boolean): void {
    this.autoOrbit = on;
    this.controls.autoRotate = on;
  }

  get autoOrbitEnabled(): boolean {
    return this.autoOrbit;
  }

  toggleExplode(): void {
    this.explode?.toggle();
    this.shadowDirty = true;
    this.frameGoal = this.explode?.isExploded ? CAMERA.startExploded : [...CAMERA.start, CAMERA.target[1]];
  }

  /** 立即跳到爆炸/重组的末态（用于测试或跳帧） */
  setExplodeImmediate(v: number): void {
    this.explode?.setImmediate(v);
    this.shadowDirty = true;
    this.frameGoal = v > 0.5 ? CAMERA.startExploded : [...CAMERA.start, CAMERA.target[1]];
  }

  /** 阴影贴图默认逐帧重算；场景静止时可省下大量开销 */
  private shadowDirty = true;
  private shadowSettleFrames = 0;

  get exploded(): boolean {
    return this.explode?.isExploded ?? false;
  }

  resetView(): void {
    this.camera.position.set(...CAMERA.start);
    this.controls.target.set(...CAMERA.target);
    this.frameGoal = null;
    this.controls.update();
  }

  setAo(on: boolean): void {
    if (this.aoEnabled === on) return;
    this.aoEnabled = on;
    this.rebuildPasses();
  }

  setBloom(on: boolean): void {
    if (this.bloomEnabled === on) return;
    this.bloomEnabled = on;
    this.rebuildPasses();
  }

  setShadows(on: boolean): void {
    this.shadowsEnabled = on;
    this.applyShadowSettings();
  }

  setWireframe(on: boolean): void {
    this.wireframe = on;
    if (!this.assembly) return;
    this.assembly.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh && !(mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if (mat && 'wireframe' in mat) mat.wireframe = on;
      }
    });
  }

  get qualityLevel(): QualityLevel {
    return this.qualityName;
  }

  setQuality(level: QualityLevel): void {
    if (this.qualityName === level) return;
    this.qualityName = level;
    this.quality = QUALITY[level];
    this.degradedFrom = null;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    if (this.sky) {
      this.sky.sun.shadow.mapSize.setScalar(this.quality.shadowMapSize);
      this.sky.sun.shadow.map?.dispose();
      this.sky.sun.shadow.map = null;
      this.shadowDirty = true;
    }
    this.aoEnabled = this.quality.ao;
    this.bloomEnabled = this.quality.bloom;
    this.applyShadowSettings();
    this.onResize();
    this.rebuildPasses();
    this.setWireframe(this.wireframe);
  }

  /** 画质档位变化时重建后处理 */
  private rebuildPasses(): void {
    if (!this.composer) return;
    for (const pass of this.composer.passes.slice(1)) this.composer.removePass(pass);
    this.gtaoPass?.dispose();
    this.bloomPass?.dispose();
    this.gtaoPass = null;
    this.bloomPass = null;
    this.outputPass = null;
    this.buildComposer();
    this.onResize();
  }

  private applyShadowSettings(): void {
    this.renderer.shadowMap.enabled = this.shadowsEnabled && this.quality.shadows;
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh || mesh.isMesh) {
        if (this.assembly && !isDescendant(mesh, this.assembly.root) && !isDescendant(mesh, this.envScene)) return;
        mesh.castShadow = this.shadowsEnabled;
      }
    });
    if (this.sky) this.sky.sun.shadow.map?.dispose();
    this.renderer.shadowMap.needsUpdate = true;
    this.shadowDirty = true;
  }

  onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 竖屏时略微加大视野，保证横向不裁切；同时限制在 38~48° 以免透视变形
    const aspect = w / h;
    const designAspect = 16 / 9;
    const widen = aspect < designAspect ? Math.pow(designAspect / aspect, 0.22) : 1;
    this.camera.fov = Math.min(48, CAMERA.fov * widen);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.composer.setSize(w, h);
      this.gtaoPass?.setSize(size.x, size.y);
      this.bloomPass?.setSize(size.x, size.y);
    }
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.elapsed += dt;
      this.tick(dt, this.elapsed);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(dt: number, elapsed: number): void {
    // 自动环绕：用户操作后暂停 4 秒再恢复
    const autoOn = this.autoOrbit && performance.now() > this.userInteractingUntil;
    this.controls.autoRotate = autoOn;

    const moving = this.explode?.isAnimating ?? false;
    if (moving) this.shadowDirty = true;
    // 静止若干帧后停止重算阴影贴图（阴影内容不再变化）
    this.renderer.shadowMap.autoUpdate = this.shadowDirty;
    if (this.shadowDirty && !moving) {
      this.shadowSettleFrames++;
      if (this.shadowSettleFrames > 2) {
        this.shadowDirty = false;
        this.shadowSettleFrames = 0;
      }
    }

    this.applyFrameGoal(dt);
    this.controls.update();
    this.explode?.update(dt);
    this.sky?.update(elapsed);

    this.renderer.info.reset();
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);

    this.measure(dt, elapsed);
  }

  /** 平滑过渡到目标机位（不改变方位角，只调整距离与目标高度） */
  private applyFrameGoal(dt: number): void {
    const goal = this.frameGoal;
    if (!goal) return;
    if (performance.now() < this.userInteractingUntil) {
      this.frameGoal = null;
      return;
    }
    const k = 1 - Math.exp(-dt * 2.6);
    const [gx, gy, gz, gy2] = goal;
    const offset = this.camera.position.clone().sub(this.controls.target);
    // 窄屏时展开后的层次更高，需要相应拉远
    const aspect = this.camera.aspect;
    const portrait = aspect < 1.3 ? Math.min(1.6, Math.pow(1.3 / aspect, 0.42)) : 1;
    const goalDist = Math.hypot(gx, gy - gy2, gz) * portrait;
    const curDist = offset.length();
    const nextDist = curDist + (goalDist - curDist) * k;
    offset.setLength(nextDist);
    this.controls.target.y += (gy2 - this.controls.target.y) * k;
    this.camera.position.copy(this.controls.target).add(offset);
    if (Math.abs(nextDist - goalDist) < 0.05 && Math.abs(gy2 - this.controls.target.y) < 0.05) {
      this.frameGoal = null;
    }
  }

  private measure(dt: number, elapsed: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    if (this.frameTimes.length < 12) return;

    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.stats.fps = Math.round(1 / Math.max(avg, 1e-4));
    const info = this.renderer.info.render;
    this.stats.calls = info.calls;
    this.stats.triangles = info.triangles;

    // 自适应降级：连续过慢时降一档（只降不升，避免抖动）
    if (this.degradedFrom === null && elapsed > 6) {
      const order: QualityLevel[] = ['low', 'medium', 'high'];
      const idx = order.indexOf(this.qualityName);
      if (avg > 0.055 && idx > 0) {
        this.degradedFrom = this.qualityName;
        this.setQuality(order[idx - 1]);
        this.onAutoDegrade?.(order[idx - 1]);
      }
    }
  }

  onAutoDegrade: ((level: QualityLevel) => void) | null = null;

  /** 用于调试：逐层线框 */
  layerInfo(): { id: string; label: string }[] {
    return (this.assembly?.layers ?? []).map((l) => ({ id: l.id, label: l.label }));
  }
}

function isDescendant(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = obj;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}

export { vignetteTexture, getMaterials, BUILDING };
