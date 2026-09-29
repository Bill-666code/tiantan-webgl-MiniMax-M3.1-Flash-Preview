/**
 * 中国屋顶剖面曲线（举折 + 檐口起翘）
 * ------------------------------------------------------------------
 * 屋面在竖直剖面内是一条曲线：自脊(内缘)向外坡度渐缓（举折），
 * 至檐口末端再向上反翘（起翘 / 翼角）。
 * 剖面求得后绕 Y 轴旋转即得整片屋顶 —— 绝非圆锥替代。
 *
 * 求解方式：
 *   θ(t) = k · ( ρ − (ρ−1)·(1−t)^p )     t∈[0,1]，0=内缘，1=檐口
 *   未知量 k（整体坡度）与 S（剖面弧长），由 Δr、Δy 两个约束二分求得。
 */
import { clamp, smootherstep } from '../gfx/noise';

export interface ProfilePoint {
  /** 半径 */
  r: number;
  /** 高度 */
  y: number;
  /** 剖面外法线 r 分量（指向斜上方） */
  nr: number;
  /** 剖面外法线 y 分量 */
  ny: number;
}

export interface RoofProfileOptions {
  /** 内缘半径 */
  innerRadius: number;
  /** 内缘高度 */
  innerY: number;
  /** 檐口外半径 */
  eaveRadius: number;
  /** 檐口(起翘起点)高度 */
  eaveY: number;
  /** 内缘是否为一圈水平面（下层屋顶被上方鼓座压住处） */
  flatTop: boolean;
  /** 剖面采样数（不含水平段） */
  samples: number;
  /** 举折比：脊坡 / 檐坡 */
  rho: number;
  /** 举折曲线指数 */
  curve?: number;
  /** 檐口起翘高度 */
  eaveLift: number;
  /** 檐口外撇 */
  eaveFlare: number;
  /** 起翘起点比例 */
  liftStart?: number;
}

const TWO_PI = Math.PI * 2;

function integrate(theta: (t: number) => number, n: number) {
  let a = 0;
  let b = 0;
  const dt = 1 / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * dt;
    a += Math.cos(theta(t)) * dt;
    b += Math.sin(theta(t)) * dt;
  }
  return { a, b };
}

export function sampleRoofProfile(opts: RoofProfileOptions): ProfilePoint[] {
  const {
    innerRadius,
    innerY,
    eaveRadius,
    eaveY,
    flatTop,
    samples,
    rho,
    curve = 1.55,
    eaveLift,
    eaveFlare,
    liftStart = 0.74,
  } = opts;

  const dr = eaveRadius - innerRadius;
  const dy = innerY - eaveY;
  const n = Math.max(8, samples);

  // ---- 二分求 k，使 atan2(B,A) 与 atan2(dy,dr) 一致 ----
  const target = Math.atan2(dy, dr);
  let lo = 1e-4;
  let hi = 1.6;
  let k = 0;
  for (let i = 0; i < 60; i++) {
    k = (lo + hi) * 0.5;
    const { a, b } = integrate(makeTheta(k, rho, curve), n);
    if (Math.atan2(b, a) < target) lo = k;
    else hi = k;
  }
  const theta = makeTheta(k, rho, curve);
  const { a } = integrate(theta, n);
  const S = dr / a;

  // ---- 沿弧长积分出剖面点 ----
  const pts: ProfilePoint[] = [];
  if (flatTop) {
    // 中心水平盘（被上层鼓座覆盖）
    const flatSteps = 4;
    for (let i = 0; i < flatSteps; i++) {
      const r = (innerRadius * i) / flatSteps;
      pts.push({ r, y: innerY, nr: 0, ny: 1 });
    }
  }

  let r = innerRadius;
  let y = innerY;
  const dt = 1 / n;
  pts.push({ r, y, nr: 0, ny: 1 });
  for (let i = 1; i <= n; i++) {
    const t = (i - 0.5) * dt;
    const th = theta(t);
    r += Math.cos(th) * S * dt;
    y -= Math.sin(th) * S * dt;

    // 檐口起翘 + 外撇
    const kLift = smootherstep(liftStart, 1, i / n);
    const lift = eaveLift * kLift * kLift;
    const flare = eaveFlare * kLift;
    pts.push({ r: r + flare, y: y + lift, nr: 0, ny: 0 });
  }

  recomputeNormals(pts);
  return pts;
}

function makeTheta(k: number, rho: number, curve: number) {
  return (t: number) => {
    const shape = Math.pow(1 - t, curve);
    return k * (rho - (rho - 1) * shape);
  };
}

/** 由折线重算外法线（端点用相邻线段近似） */
export function recomputeNormals(pts: ProfilePoint[]): void {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const tr = b.r - a.r;
    const ty = b.y - a.y;
    const len = Math.hypot(tr, ty) || 1;
    pts[i].nr = -ty / len;
    pts[i].ny = tr / len;
  }
}

/** 剖面弧长（用于 UV 的纵向重复） */
export function profileArcLength(pts: ProfilePoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].r - pts[i - 1].r, pts[i].y - pts[i - 1].y);
  }
  return len;
}

/** 按厚度挤出剖面（下表面） */
export function offsetProfile(pts: ProfilePoint[], thicknessAt: (t: number) => number): ProfilePoint[] {
  const n = pts.length;
  const out: ProfilePoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const th = thicknessAt(n === 1 ? 0 : i / (n - 1));
    out.push({ r: p.r - p.nr * th, y: p.y - p.ny * th, nr: -p.nr, ny: -p.ny });
  }
  return out;
}

/** 剖面包围盒 */
export function profileBounds(pts: ProfilePoint[]): { minY: number; maxY: number; maxR: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  let maxR = 0;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    maxR = Math.max(maxR, p.r);
  }
  return { minY, maxY, maxR };
}

/** 采样：给定参数 t(0..1) 在剖面上的半径（用于放置斗拱、檩条等） */
export function radiusAtT(pts: ProfilePoint[], t: number): { r: number; y: number } {
  const idx = clamp(t, 0, 1) * (pts.length - 1);
  const i = Math.floor(idx);
  const j = Math.min(pts.length - 1, i + 1);
  const f = idx - i;
  return { r: pts[i].r + (pts[j].r - pts[i].r) * f, y: pts[i].y + (pts[j].y - pts[i].y) * f };
}

export const TAU = TWO_PI;
