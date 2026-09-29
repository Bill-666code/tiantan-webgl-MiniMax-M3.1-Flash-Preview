/**
 * 爆炸 / 重组动画控制器
 * ------------------------------------------------------------------
 * 以一个全局进度 p∈[0,1] 驱动，每层按自身延迟把 p 映射到局部进度，
 * 因此天然形成"由下而上、错峰展开"的节奏；
 * 局部进度经缓动函数处理，端点严格为 0 / 1，保证能精确归位。
 */
import * as THREE from 'three';
import { EXPLODE } from '../config';
import type { Layer } from '../build/Assembly';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface LayerState {
  layer: Layer;
  index: number;
  home: THREE.Vector3;
  homeQuat: THREE.Quaternion;
  delay: number;
}

export class ExplodeController {
  private readonly states: LayerState[] = [];
  /** 当前时间轴进度（秒），范围 [0, totalTime] */
  private time = 0;
  private target = 0;
  private dir = 1;
  private readonly totalTime: number;

  constructor(layers: Layer[]) {
    const count = layers.length;
    layers.forEach((layer, index) => {
      this.states.push({
        layer,
        index,
        home: layer.object.position.clone(),
        homeQuat: layer.object.quaternion.clone(),
        delay: index * EXPLODE.stagger,
      });
    });
    this.totalTime = EXPLODE.duration + Math.max(0, count - 1) * EXPLODE.stagger;
  }

  get isExploded(): boolean {
    return this.target > 0.5;
  }

  get isAnimating(): boolean {
    return Math.abs(this.time - this.target * this.totalTime) > 1e-4;
  }

  toggle(): void {
    this.setTarget(this.target > 0.5 ? 0 : 1);
  }

  setTarget(v: number): void {
    this.target = v;
    this.dir = v > this.time ? 1 : -1;
  }

  /** 立即归位（初始化用） */
  reset(): void {
    this.time = 0;
    this.target = 0;
    this.apply();
  }

  /**
   * 直接跳到某个状态（0 = 完全重组，1 = 完全爆炸）。
   * 用于自动化测试与"跳到末态"的交互，不会产生中间态。
   */
  setImmediate(v: number): void {
    this.time = v * this.totalTime;
    this.target = v;
    this.apply();
  }

  update(dt: number): void {
    const targetTime = this.target * this.totalTime;
    if (this.time === targetTime) return;
    this.time += this.dir * dt;
    if (this.time >= this.totalTime) {
      this.time = this.totalTime;
      this.target = 1;
    } else if (this.time <= 0) {
      this.time = 0;
      this.target = 0;
    }
    this.apply();
  }

  private apply(): void {
    for (const s of this.states) {
      const raw = (this.time - s.delay) / EXPLODE.duration;
      const local = easeInOutCubic(Math.min(1, Math.max(0, raw)));

      s.layer.object.position.set(
        s.home.x + s.layer.offset.x * local,
        s.home.y + s.layer.offset.y * local,
        s.home.z + s.layer.offset.z * local,
      );

      if (s.layer.twist !== 0) {
        const spin = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          s.layer.twist * local * EXPLODE.twist * 40,
        );
        s.layer.object.quaternion.copy(s.homeQuat).multiply(spin);
      }
    }
  }

  /** 供调试：当前整体进度 0~1 */
  get value(): number {
    return this.time / this.totalTime;
  }
}
