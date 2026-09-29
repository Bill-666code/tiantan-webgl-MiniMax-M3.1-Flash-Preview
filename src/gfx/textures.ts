/**
 * 程序化纹理库
 * ------------------------------------------------------------------
 * 全部使用 Canvas2D 在运行时生成，不加载任何外部图片。
 * 每张贴图只生成一次并缓存；颜色贴图标记为 SRGB，
 * 法线 / 粗糙度 / alpha 贴图保持线性。
 */
import * as THREE from 'three';
import { clamp, fbm2, mix, mulberry32, ridged2, smoothstep, valueNoise2D } from './noise';

type Ctx = CanvasRenderingContext2D;

const cache = new Map<string, unknown>();
let anisotropy = 8;

export function setTextureAnisotropy(value: number): void {
  anisotropy = value;
  for (const tex of cache.values()) {
    if (tex instanceof THREE.Texture) tex.anisotropy = anisotropy;
  }
}

function cached<T>(key: string, factory: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const made = factory();
  cache.set(key, made);
  return made;
}

function makeCanvas(w: number, h = w): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false }) as Ctx;
  return { canvas, ctx };
}

interface TexOptions {
  srgb?: boolean;
  repeat?: [number, number];
  wrap?: THREE.Wrapping;
}

function toTexture(canvas: HTMLCanvasElement, opts: TexOptions = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = opts.wrap ?? THREE.RepeatWrapping;
  tex.wrapT = opts.wrap ?? THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.needsUpdate = true;
  return tex;
}

/** 由高度场生成法线贴图（Sobel 近似） */
function heightToNormal(height: Float32Array, w: number, h: number, strength: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) - (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function grayTexture(data: Float32Array, w: number, h: number, srgb = false): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = clamp(data[i], 0, 1) * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { srgb });
}

/* ------------------------------------------------------------------ */
/* 琉璃瓦：颜色 / 法线 / 粗糙度                                          */
/* ------------------------------------------------------------------ */

export interface SurfaceMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/** 一张贴图覆盖 4 个瓦垄周期 × 8 个瓦垡 */
const TILE_PATCH_X = 4;
const TILE_PATCH_Y = 8;

function tileHeight(u: number, v: number): number {
  const px = u * TILE_PATCH_X;
  const xf = px - Math.floor(px);
  const py = v * TILE_PATCH_Y;
  const yf = py - Math.floor(py);

  // 底瓦（板瓦）：中心低、两侧翘
  const d = Math.min(xf, 1 - xf) / 0.5;
  const pan = 0.3 * d * d;

  // 盖瓦（筒瓦）：半圆凸起
  const e = Math.abs(xf - 0.5) / 0.31;
  const cap = e < 1 ? Math.sqrt(1 - e * e) * (1 - Math.pow(e, 7)) : 0;

  let h = Math.max(pan, cap) * 0.72 + 0.14;

  // 瓦垡搭接线（每层上口压住下层）
  h -= 0.1 * Math.exp(-Math.pow((yf - 0.05) / 0.055, 2));
  h += 0.04 * smoothstep(0.8, 1, yf);

  // 表面微起伏（边界淡出以保证可平铺）
  const fade = smoothstep(0, 0.04, u) * smoothstep(0, 0.04, 1 - u) * smoothstep(0, 0.04, v) * smoothstep(0, 0.04, 1 - v);
  h += 0.035 * (fbm2(u * 42, v * 42, 3, 2.1, 0.55, 17) - 0.5) * fade;
  h += 0.015 * (valueNoise2D(u * 180, v * 180, 91) - 0.5) * fade;
  return h;
}

export function roofTileMaps(resolution = 1024): SurfaceMaps {
  return cached(`tiles${resolution}`, () => {
    const w = resolution;
    const h = resolution;
    const height = new Float32Array(w * h);
    let hMin = Infinity;
    let hMax = -Infinity;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const val = tileHeight((x + 0.5) / w, (y + 0.5) / h);
        height[y * w + x] = val;
        if (val < hMin) hMin = val;
        if (val > hMax) hMax = val;
      }
    }
    for (let i = 0; i < height.length; i++) height[i] = (height[i] - hMin) / (hMax - hMin);

    // ---- 颜色 ----
    const { canvas, ctx } = makeCanvas(w, h);
    const img = ctx.createImageData(w, h);
    const rnd = mulberry32(20240);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        const hv = height[idx];

        // 同一张贴图内的随机釉色偏差
        const jitter = rnd();

        // 天空反射带来的高光偏青
        const sky = Math.pow(clamp((hv - 0.45) / 0.55, 0, 1), 1.4);
        // 积垢 / 风化：沿坡向的竖条纹
        const streak = fbm2(u * 90, v * 6, 4, 2.0, 0.5, 33);
        const bloom = fbm2(u * 5, v * 5, 3, 2.0, 0.5, 61);

        const hue = mix(212, 202, sky * 0.35 + bloom * 0.1);
        const sat = mix(0.7, 0.56, sky * 0.4 + streak * 0.2);
        const light = mix(0.17, 0.38, sky) + (jitter - 0.5) * 0.03 + (bloom - 0.5) * 0.04;

        const [r, g, b] = hslToRgb(hue / 360, clamp(sat, 0, 1), clamp(light, 0, 1));
        // 缝隙 AO（保持柔和，避免瓦垄看起来像锯齿）
        const ao = 0.84 + 0.16 * Math.pow(hv, 0.8);
        const i = idx * 4;
        img.data[i] = clamp(r * ao, 0, 1) * 255;
        img.data[i + 1] = clamp(g * ao, 0, 1) * 255;
        img.data[i + 2] = clamp(b * ao, 0, 1) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // ---- 粗糙度：釉面亮、凹槽哑 ----
    const rough = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        const n = fbm2(u * 26, v * 26, 3, 2.0, 0.5, 7);
        rough[idx] = clamp(mix(0.42, 0.11, Math.pow(height[idx], 1.6)) + (n - 0.5) * 0.14, 0.05, 0.9);
      }
    }

    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(height, w, h, 1.7), { srgb: false }),
      roughnessMap: grayTexture(rough, w, h),
    };
  });
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/* ------------------------------------------------------------------ */
/* 汉白玉                                                             */
/* ------------------------------------------------------------------ */

export function marbleMaps(resolution = 768): SurfaceMaps {
  return cached(`marble${resolution}`, () => {
    const w = resolution;
    const h = resolution;
    const { canvas, ctx } = makeCanvas(w, h);
    const img = ctx.createImageData(w, h);
    const height = new Float32Array(w * h);
    const rough = new Float32Array(w * h);

    const blockCols = 2;
    const blockRows = 2;
    const joint = 0.006;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;

        const grain = fbm2(u * 34, v * 34, 5, 2.05, 0.52, 5);
        const vein = ridged2(u * 5.5 + grain * 0.4, v * 5.5, 4, 23);
        const veinMask = smoothstep(0.78, 0.99, vein);
        const micro = valueNoise2D(u * 420, v * 420, 44);

        // 分块
        const bu = (u * blockCols) % 1;
        const bv = (v * blockRows) % 1;
        const edge = Math.min(bu, 1 - bu, bv, 1 - bv);
        const groove = 1 - smoothstep(joint, joint * 2.6, edge);
        const blockTint = valueNoise2D(Math.floor(u * blockCols) * 13.3, Math.floor(v * blockRows) * 7.7, 3) - 0.5;

        let l = 0.8 - grain * 0.08 - veinMask * 0.22 + micro * 0.02 + blockTint * 0.04;
        l = clamp(l, 0, 1);
        const warm = 0.02;
        const r = clamp(l + warm * 0.6 - veinMask * 0.02, 0, 1);
        const g = clamp(l + warm * 0.25, 0, 1);
        const b = clamp(l - warm * 0.35 + veinMask * 0.05, 0, 1);

        const i = idx * 4;
        img.data[i] = r * 255;
        img.data[i + 1] = g * 255;
        img.data[i + 2] = b * 255;
        img.data[i + 3] = 255;

        height[idx] = (1 - groove) * 0.6 + grain * 0.4;
        rough[idx] = clamp(0.46 + grain * 0.22 + veinMask * 0.12 + groove * 0.2, 0.05, 1);
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(height, w, h, 0.9), { srgb: false }),
      roughnessMap: grayTexture(rough, w, h),
    };
  });
}

/* ------------------------------------------------------------------ */
/* 御路石雕（云纹）                                                     */
/* ------------------------------------------------------------------ */

export function carvedRampMaps(resolution = 512): SurfaceMaps {
  return cached(`ramp${resolution}`, () => {
    const w = resolution;
    const h = resolution;
    const { canvas, ctx } = makeCanvas(w, h);
    const height = new Float32Array(w * h);

    // 底：白玉
    const base = marbleMaps(resolution).map.image as HTMLCanvasElement;
    ctx.drawImage(base, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
      const grain = fbm2((i % w) / w * 30, Math.floor(i / w) / h * 30, 4, 2.0, 0.5, 71);
      height[i] = grain * 0.5;
    }

    // 祥云团纹：二方连续的卷云
    ctx.lineCap = 'round';
    const drawScroll = (cx: number, cy: number, scale: number, dir: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale * dir, scale);
      for (let k = 0; k < 3; k++) {
        const rad = 26 - k * 7;
        const ox = k * 15;
        ctx.beginPath();
        ctx.arc(ox, 0, rad, Math.PI * 0.15, Math.PI * 1.75);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ox + rad * 0.62, -rad * 0.32, rad * 0.3, 0, Math.PI * 1.9);
        ctx.stroke();
      }
      ctx.restore();
    };

    ctx.strokeStyle = 'rgba(120, 112, 92, 0.85)';
    ctx.lineWidth = 3.4;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const cx = (col + 0.5) * (w / 4) + (row % 2 ? w / 8 : 0);
        const cy = (row + 0.5) * (h / 4);
        drawScroll(cx, cy, 0.85, row % 2 ? 1 : -1);
      }
    }

    // 用亮度差生成浮雕高度
    const carved = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
      const lum = (carved.data[i * 4] + carved.data[i * 4 + 1] + carved.data[i * 4 + 2]) / 765;
      height[i] = clamp(height[i] * 0.35 + lum * 0.65, 0, 1);
      // 雕刻线加深
      const shade = clamp(0.72 + lum * 0.42, 0, 1.2);
      img.data[i * 4] = clamp(img.data[i * 4] * shade, 0, 255);
      img.data[i * 4 + 1] = clamp(img.data[i * 4 + 1] * shade, 0, 255);
      img.data[i * 4 + 2] = clamp(img.data[i * 4 + 2] * shade, 0, 255);
    }
    ctx.putImageData(img, 0, 0);

    const rough = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) rough[i] = 0.52 + (1 - height[i]) * 0.2;

    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(height, w, h, 1.5), { srgb: false }),
      roughnessMap: grayTexture(rough, w, h),
    };
  });
}

/* ------------------------------------------------------------------ */
/* 旋子彩画（额枋 / 斗拱 / 檐檩）                                        */
/* ------------------------------------------------------------------ */

export function caissonTexture(resolution = 1024): THREE.CanvasTexture {
  return cached(`caisson${resolution}`, () => {
    const w = resolution;
    const h = Math.round(resolution / 4);
    const { canvas, ctx } = makeCanvas(w, h);

    // 主色：青绿 + 蓝地
    ctx.fillStyle = '#1d5c96';
    ctx.fillRect(0, 0, w, h);

    // 上下的金色箍头带
    const band = h * 0.13;
    const gold = '#d8ae4e';
    const goldLight = '#f2dda1';
    const green = '#2f7f63';
    const white = '#e9e3d2';
    const red = '#a8261f';

    const paintBand = (y0: number, hh: number, dir: number) => {
      const g = ctx.createLinearGradient(0, y0, 0, y0 + hh);
      g.addColorStop(0, goldLight);
      g.addColorStop(0.4, gold);
      g.addColorStop(1, '#9c7629');
      ctx.fillStyle = g;
      ctx.fillRect(0, y0, w, hh);
      ctx.strokeStyle = '#7d5c1e';
      ctx.lineWidth = Math.max(1, hh * 0.06);
      ctx.strokeRect(0, y0, w, hh);
      // 回纹
      ctx.strokeStyle = 'rgba(70, 48, 10, 0.75)';
      ctx.lineWidth = Math.max(1, hh * 0.05);
      const step = hh * 0.62;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x + dir * hh * 0.1, y0 + hh * 0.72);
        ctx.lineTo(x + dir * hh * 0.1, y0 + hh * 0.28);
        ctx.lineTo(x + dir * hh * 0.55, y0 + hh * 0.28);
        ctx.lineTo(x + dir * hh * 0.55, y0 + hh * 0.6);
        ctx.stroke();
      }
    };

    paintBand(0, band, 1);
    paintBand(h - band, band, -1);

    // 中部：三段式旋子彩画（蓝-绿-蓝）
    const midY = band;
    const midH = h - band * 2;
    const seg = w / 6;
    for (let i = 0; i < 6; i++) {
      const x0 = i * seg;
      const isGreen = i % 2 === 1;
      ctx.fillStyle = isGreen ? green : '#1d5c96';
      ctx.fillRect(x0 + seg * 0.06, midY + midH * 0.06, seg * 0.88, midH * 0.88);

      // 旋子：白心 + 金环 + 红瓣
      const cx = x0 + seg * 0.5;
      const cy = midY + midH * 0.5;
      const R = Math.min(seg, midH) * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = gold;
      ctx.fill();
      ctx.strokeStyle = '#7d5c1e';
      ctx.lineWidth = Math.max(1, R * 0.06);
      ctx.stroke();

      for (let p = 0; p < 8; p++) {
        const a = (p / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.26, R * 0.16, a, 0, Math.PI * 2);
        ctx.fillStyle = red;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = white;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = gold;
      ctx.fill();

      // 藻头两侧的白线
      ctx.strokeStyle = 'rgba(233, 227, 210, 0.85)';
      ctx.lineWidth = Math.max(1, midH * 0.035);
      ctx.beginPath();
      ctx.moveTo(x0 + seg * 0.06, midY + midH * 0.06);
      ctx.lineTo(x0 + seg * 0.06, midY + midH * 0.94);
      ctx.moveTo(x0 + seg * 0.94, midY + midH * 0.06);
      ctx.lineTo(x0 + seg * 0.94, midY + midH * 0.94);
      ctx.stroke();
    }

    // 细微做旧
    const img = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = fbm2(x / w * 120, y / h * 24, 3, 2.0, 0.5, 3);
        const k = 0.9 + n * 0.22;
        const i = (y * w + x) * 4;
        img.data[i] = clamp(img.data[i] * k, 0, 255);
        img.data[i + 1] = clamp(img.data[i + 1] * k, 0, 255);
        img.data[i + 2] = clamp(img.data[i + 2] * k, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(canvas);
  });
}

/* ------------------------------------------------------------------ */
/* 槅扇门 / 步步锦窗格（带 alpha）                                     */
/* ------------------------------------------------------------------ */

/**
 * @param cols   竖向分格（立棂）数
 * @param rows   横向分格（步步锦）数
 * @param width  贴图宽（像素）
 * @param height 贴图高（像素），应与实际构件的宽高比一致
 */
export function latticeTexture(cols: number, rows: number, width: number, height: number): THREE.CanvasTexture {
  return cached(`lattice${cols}x${rows}_${width}x${height}`, () => {
    const w = width;
    const h = height;
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.clearRect(0, 0, w, h);

    const frame = Math.max(6, w * 0.075);
    const wood = '#54371f';
    const woodLight = '#7c5730';
    const woodDark = '#2a1a0d';

    const bar = (x: number, y: number, bw: number, bh: number) => {
      const g = ctx.createLinearGradient(x, y, x + bw, y + bh);
      g.addColorStop(0, woodLight);
      g.addColorStop(0.35, wood);
      g.addColorStop(1, woodDark);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, bw, bh);
    };

    // 外框
    bar(0, 0, w, frame);
    bar(0, h - frame, w, frame);
    bar(0, 0, frame, h);
    bar(w - frame, 0, frame, h);
    bar(frame * 0.6, frame * 0.6, w - frame * 1.2, frame * 0.5);
    bar(frame * 0.6, h - frame * 1.1, w - frame * 1.2, frame * 0.5);

    const innerX = frame;
    const innerY = frame;
    const innerW = w - frame * 2;
    const innerH = h - frame * 2;
    const mullion = w * 0.055;
    const rail = w * 0.062;

    const colW = innerW / cols;
    for (let c = 1; c < cols; c++) bar(innerX + c * colW - mullion / 2, innerY, mullion, innerH);

    const rowH = innerH / rows;
    for (let r = 1; r < rows; r++) bar(innerX, innerY + r * rowH - rail / 2, innerW, rail);

    // 步步锦：每格内做“台阶”式短棂
    const thin = w * 0.038;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x0 = innerX + c * colW;
        const y0 = innerY + r * rowH;
        const cx = x0 + colW / 2;
        const cy = y0 + rowH / 2;
        const sw = colW * 0.26;
        const sh = rowH * 0.24;
        // 中心十字
        bar(cx - thin / 2, cy - sh, thin, sh * 2);
        bar(cx - sw, cy - thin / 2, sw * 2, thin);
        // 台阶
        bar(cx - sw * 0.95, cy - sh * 0.95, thin, sh * 0.8);
        bar(cx + sw * 0.95 - thin, cy + sh * 0.15, thin, sh * 0.8);
        bar(cx - sw * 0.95, cy + sh * 0.15, sw * 0.55, thin);
        bar(cx + sw * 0.4, cy - sh * 0.95, sw * 0.55, thin);
      }
    }

    return toTexture(canvas);
  });
}

/**
 * 殿身墙体镂空图（alphaMap）
 * ------------------------------------------------------------------
 * 墙体是一整张圆筒，用 alphaMap 在门窗位置开洞，
 * 洞后放置暗色内壁，使门窗真正“通透”。
 * u = 环向(0~1)，v = 墙高方向(0~1，0 为下沿)。
 */
export function wallAlphaTexture(
  bays: number,
  doorBays: number[],
  wallBottom: number,
  wallTop: number,
  doorTop: number,
  windowTop: number,
): THREE.CanvasTexture {
  return cached(`wallAlpha${bays}`, () => {
    const w = bays * 16;
    const h = 256;
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000000';

    const vToY = (y: number) => (1 - (y - wallBottom) / (wallTop - wallBottom)) * h;
    const bayW = w / bays;

    for (let i = 0; i < bays; i++) {
      const isDoor = doorBays.includes(i);
      const top = vToY(isDoor ? doorTop : windowTop);
      const x0 = i * bayW + bayW * 0.035;
      const bw = bayW * 0.93;
      ctx.fillRect(x0, top, bw, h - top);
    }
    return toTexture(canvas, { srgb: false });
  });
}

export function lacquerTexture(resolution = 512): SurfaceMaps {
  return cached(`lacquer${resolution}`, () => {
    const w = resolution;
    const h = resolution;
    const { canvas, ctx } = makeCanvas(w, h);
    const img = ctx.createImageData(w, h);
    const height = new Float32Array(w * h);
    const rough = new Float32Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        const grain = fbm2(u * 60, v * 8, 4, 2.1, 0.55, 13);
        const dirt = fbm2(u * 7, v * 7, 3, 2.0, 0.5, 29);
        const l = 0.34 + (grain - 0.5) * 0.06 + (dirt - 0.5) * 0.07;
        const i = idx * 4;
        img.data[i] = clamp(l * 1.62, 0, 1) * 255;
        img.data[i + 1] = clamp(l * 0.45, 0, 1) * 255;
        img.data[i + 2] = clamp(l * 0.36, 0, 1) * 255;
        img.data[i + 3] = 255;
        height[idx] = grain;
        rough[idx] = clamp(0.24 + (1 - dirt) * 0.22, 0.05, 1);
      }
    }
    ctx.putImageData(img, 0, 0);

    // 描金边框 + 门钉
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(216,174,78,0.85)');
    g.addColorStop(0.5, 'rgba(160,120,40,0.6)');
    g.addColorStop(1, 'rgba(216,174,78,0.85)');
    ctx.strokeStyle = g;
    ctx.lineWidth = w * 0.035;
    ctx.strokeRect(w * 0.055, h * 0.03, w * 0.89, h * 0.94);
    const stud = w * 0.035;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 4; c++) {
        const cx = w * (0.2 + c * 0.2);
        const cy = h * (0.12 + r * 0.13);
        const rg = ctx.createRadialGradient(cx - stud * 0.3, cy - stud * 0.3, 0, cx, cy, stud);
        rg.addColorStop(0, '#f6dfa0');
        rg.addColorStop(0.6, '#c39a3c');
        rg.addColorStop(1, '#7c5c1c');
        ctx.beginPath();
        ctx.arc(cx, cy, stud, 0, Math.PI * 2);
        ctx.fillStyle = rg;
        ctx.fill();
      }
    }

    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(height, w, h, 0.5), { srgb: false }),
      roughnessMap: grayTexture(rough, w, h),
    };
  });
}

/* ------------------------------------------------------------------ */
/* 鎏金                                                                */
/* ------------------------------------------------------------------ */

export function goldMaps(resolution = 512): SurfaceMaps {
  return cached(`gold${resolution}`, () => {
    const w = resolution;
    const h = resolution;
    const { canvas, ctx } = makeCanvas(w, h);
    const img = ctx.createImageData(w, h);
    const height = new Float32Array(w * h);
    const rough = new Float32Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        const hammer = fbm2(u * 26, v * 26, 4, 2.1, 0.5, 51);
        const patina = fbm2(u * 6, v * 6, 3, 2.0, 0.5, 83);
        const l = 0.62 + (hammer - 0.5) * 0.16 + (patina - 0.5) * 0.14;
        const i = idx * 4;
        img.data[i] = clamp(l * 1.02, 0, 1) * 255;
        img.data[i + 1] = clamp(l * 0.79, 0, 1) * 255;
        img.data[i + 2] = clamp(l * 0.36 + patina * 0.06, 0, 1) * 255;
        img.data[i + 3] = 255;
        height[idx] = hammer;
        rough[idx] = clamp(0.2 + (1 - hammer) * 0.34 + (patina - 0.5) * 0.16, 0.05, 1);
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(height, w, h, 0.7), { srgb: false }),
      roughnessMap: grayTexture(rough, w, h),
    };
  });
}

/* ------------------------------------------------------------------ */
/* 木材（望板 / 椽子 / 柱身）                                           */
/* ------------------------------------------------------------------ */

export function woodTexture(resolution = 512, tint: 'dark' | 'red' = 'dark'): SurfaceMaps {
  return cached(`wood${tint}${resolution}`, () => {
    const w = resolution;
    const h = resolution;
    const { canvas, ctx } = makeCanvas(w, h);
    const img = ctx.createImageData(w, h);
    const height = new Float32Array(w * h);
    const rough = new Float32Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        // 竖向木纹
        const rings = fbm2(u * 40, v * 2.4, 4, 2.1, 0.55, 9);
        const fine = valueNoise2D(u * 260, v * 12, 15);
        const g = clamp(0.5 + (rings - 0.5) * 0.9 + (fine - 0.5) * 0.18, 0, 1);
        const i = idx * 4;
        if (tint === 'red') {
          img.data[i] = (0.42 + g * 0.3) * 255;
          img.data[i + 1] = (0.09 + g * 0.09) * 255;
          img.data[i + 2] = (0.07 + g * 0.07) * 255;
        } else {
          img.data[i] = (0.17 + g * 0.14) * 255;
          img.data[i + 1] = (0.11 + g * 0.1) * 255;
          img.data[i + 2] = (0.08 + g * 0.07) * 255;
        }
        img.data[i + 3] = 255;
        height[idx] = rings;
        rough[idx] = clamp(0.62 + (1 - g) * 0.24, 0.1, 1);
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(height, w, h, 0.6), { srgb: false }),
      roughnessMap: grayTexture(rough, w, h),
    };
  });
}

/* ------------------------------------------------------------------ */
/* 广场铺地 / 草地                                                     */
/* ------------------------------------------------------------------ */

export function pavingMaps(resolution = 768): SurfaceMaps {
  return cached(`paving${resolution}`, () => {
    const w = resolution;
    const h = resolution;
    const { canvas, ctx } = makeCanvas(w, h);
    const img = ctx.createImageData(w, h);
    const height = new Float32Array(w * h);
    const rough = new Float32Array(w * h);
    const cells = 4;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        const fu = (u * cells) % 1;
        const fv = (v * cells) % 1;
        const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
        const joint = 1 - smoothstep(0.006, 0.02, edge);
        const blockId = valueNoise2D(Math.floor(u * cells) * 5.1, Math.floor(v * cells) * 3.3, 2);
        const grain = fbm2(u * 90, v * 90, 4, 2.05, 0.5, 11);
        const dust = fbm2(u * 9, v * 9, 3, 2.0, 0.5, 19);

        const l = clamp(0.6 + (blockId - 0.5) * 0.13 + (grain - 0.5) * 0.16 + (dust - 0.5) * 0.08 - joint * 0.28, 0, 1);
        const i = idx * 4;
        img.data[i] = clamp(l * 1.0, 0, 1) * 255;
        img.data[i + 1] = clamp(l * 0.985, 0, 1) * 255;
        img.data[i + 2] = clamp(l * 0.94, 0, 1) * 255;
        img.data[i + 3] = 255;
        height[idx] = (1 - joint) * 0.7 + grain * 0.3;
        rough[idx] = clamp(0.72 + (dust - 0.5) * 0.2, 0.2, 1);
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: toTexture(canvas),
      normalMap: toTexture(heightToNormal(height, w, h, 0.7), { srgb: false }),
      roughnessMap: grayTexture(rough, w, h),
    };
  });
}

export function grassTexture(resolution = 512): THREE.CanvasTexture {
  return cached(`grass${resolution}`, () => {
    const w = resolution;
    const { canvas, ctx } = makeCanvas(w);
    const img = ctx.createImageData(w, w);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / w;
        const n = fbm2(u * 40, v * 40, 4, 2.1, 0.5, 31);
        const patch = fbm2(u * 7, v * 7, 3, 2.0, 0.5, 37);
        const l = 0.3 + (n - 0.5) * 0.2 + (patch - 0.5) * 0.22;
        const i = (y * w + x) * 4;
        img.data[i] = clamp(l * 0.62, 0, 1) * 255;
        img.data[i + 1] = clamp(l * 1.12, 0, 1) * 255;
        img.data[i + 2] = clamp(l * 0.52, 0, 1) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(canvas);
  });
}

/** 广场边缘的柔和暗角（叠加在地面之上，起到接地作用） */
export function vignetteTexture(resolution = 512): THREE.CanvasTexture {
  return cached('vignette', () => {
    const size = resolution;
    const { canvas, ctx } = makeCanvas(size);
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.42, 'rgba(255,255,255,0)');
    g.addColorStop(0.72, 'rgba(30,42,56,0.30)');
    g.addColorStop(1, 'rgba(24,34,48,0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return toTexture(canvas);
  });
}

/** 云层（贴在天穹上的柔和积云） */
export function cloudTexture(resolution = 1024): THREE.CanvasTexture {
  return cached('clouds', () => {
    const w = resolution;
    const h = resolution / 2;
    const { canvas, ctx } = makeCanvas(w, h);
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        const f = fbm2(u * 6, v * 9, 6, 2.1, 0.52, 101);
        const mask = smoothstep(0.48, 0.74, f) * smoothstep(1.0, 0.5, v) * smoothstep(0.0, 0.12, v);
        const l = clamp(mask * 0.95, 0, 1);
        const i = (y * w + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = l * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(canvas);
  });
}

export function disposeTextureCache(): void {
  for (const tex of cache.values()) {
    if (tex instanceof THREE.Texture) tex.dispose();
  }
  cache.clear();
}
