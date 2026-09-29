/**
 * 全局尺寸 / 配色 / 质量配置
 * ------------------------------------------------------------------
 * 所有几何均以米为单位，原点在广场地面中心，建筑中轴为 Y 轴。
 *
 * 尺度依据公开资料（总高约 38 m、上层檐口直径 32.72 m、28 根檐柱、
 * 三层汉白玉台基）做了比例化重构；为在交互中取得更好的观感，
 * 部分构件尺寸做了适度夸张（如斗拱比例、栏杆密度）。
 */

/** 单层屋顶 / 柱圈的参数描述 */
export interface LevelSpec {
  /** 该层的显示名（用于调试与线框面板） */
  name: string;
  /** 檐口外半径 */
  eaveRadius: number;
  /** 檐口（起翘起点）高度 */
  eaveY: number;
  /** 屋面内缘半径 */
  innerRadius: number;
  /** 屋面内缘高度 */
  innerY: number;
  /** 内缘是否为一圈水平面 */
  flatTop: boolean;
  /** 举折比：脊坡 / 檐坡 */
  rho: number;
  /** 檐口起翘高度 */
  eaveLift: number;
  /** 檐口外撇 */
  eaveFlare: number;
  /** 柱圈数量 */
  columnCount: number;
  /** 柱圈半径（斗栌立于柱头） */
  columnRadius: number;
  /** 柱圈底 / 顶高度 */
  columnBottom: number;
  columnTop: number;
  /** 柱半径 */
  columnRadiusSize: number;
  /** 斗拱层数 */
  dougongTiers: number;
  /** 斗拱组数 */
  dougongCount: number;
  /** 承载本层柱圈的鼓座半径（0 = 坐在下一重屋面上） */
  drumRadius: number;
  /** 瓦垄数（一周） */
  tileCount: number;
}

/** 台基（汉白玉三层）参数 */
export interface TierSpec {
  radius: number;
  /** 顶面高度 */
  top: number;
  /** 该层台基主体高度 */
  height: number;
  /** 栏板是否存在 */
  railing: boolean;
}

export const BUILDING = {
  /** 台基（三层，自下而上） */
  tiers: [
    { radius: 21.6, top: 1.62, height: 1.62, railing: true },
    { radius: 19.15, top: 3.18, height: 1.56, railing: true },
    { radius: 16.95, top: 4.68, height: 1.5, railing: true },
  ] as TierSpec[],

  /** 南面（+Z 为正南，相机默认位于 +Z）中央石阶 */
  stairs: {
    azimuth: 0,
    /** 踏跺宽度（横向） */
    width: 8.4,
    /** 御路宽度 */
    imperialWidth: 3.4,
    /** 每跑级数 */
    steps: 9,
    /** 踏面进深 / 级高（决定坡度，约 1.55 → 33°） */
    slope: 1.55,
  },

  /** 殿身（圆形墙体） */
  body: {
    /** 墙体半径（柱心内侧） */
    radius: 8.5,
    bottom: 4.68,
    /** 额枋上沿（墙体结束处，之上为斗栌） */
    top: 14.62,
    /** 柱数 */
    columns: 28,
    columnRadius: 0.55,
    /** 门窗：门开在正南北东西四面（以柱序计） */
    doorBays: [0, 7, 14, 21],
    /** 门（槅扇）宽度 / 高度 */
    doorWidth: 1.62,
    doorHeight: 5.1,
    /** 窗台 / 窗顶 */
    windowBottom: 6.15,
    windowTop: 12.5,
    /** 墙裙高度 */
    dadoHeight: 1.42,
    /** 额枋彩画带 */
    friezeBottom: 13.15,
    friezeTop: 14.62,
    /** 室内（透过窗棂看到的暗部） */
    interiorRadius: 8.1,
  },

  /** 三重檐：祈年殿为"上大下小"，上层檐口直径最大 */
  levels: [
    {
      name: '下檐',
      eaveRadius: 11.9,
      eaveY: 17.32,
      innerRadius: 4.6,
      innerY: 22.0,
      flatTop: true,
      rho: 2.45,
      eaveLift: 0.62,
      eaveFlare: 0.42,
      columnCount: 28,
      columnRadius: 8.9,
      columnBottom: 4.68,
      columnTop: 15.62,
      columnRadiusSize: 0.55,
      dougongTiers: 2,
      dougongCount: 42,
      /** 承载本层柱圈的鼓座半径（0 表示坐在下一重屋面上） */
      drumRadius: 0,
      tileCount: 144,
    },
    {
      name: '中檐',
      eaveRadius: 13.62,
      eaveY: 25.52,
      innerRadius: 4.35,
      innerY: 30.0,
      flatTop: true,
      rho: 2.6,
      eaveLift: 0.7,
      eaveFlare: 0.46,
      columnCount: 24,
      columnRadius: 10.6,
      columnBottom: 18.35,
      columnTop: 23.84,
      columnRadiusSize: 0.48,
      dougongTiers: 2,
      dougongCount: 44,
      drumRadius: 10.6,
      tileCount: 180,
    },
    {
      name: '上檐',
      eaveRadius: 16.36,
      eaveY: 32.12,
      innerRadius: 0.92,
      innerY: 37.05,
      flatTop: false,
      rho: 2.75,
      eaveLift: 0.86,
      eaveFlare: 0.56,
      columnCount: 20,
      columnRadius: 12.5,
      columnBottom: 26.45,
      columnTop: 29.52,
      columnRadiusSize: 0.44,
      dougongTiers: 3,
      dougongCount: 46,
      drumRadius: 12.5,
      tileCount: 216,
    },
  ] as LevelSpec[],

  /** 鎏金宝顶 */
  finial: {
    base: 36.9,
    height: 3.6,
    radius: 1.18,
    /** 宝座（压住屋面顶点开口）半径 */
    baseRadius: 1.62,
  },

  /** 斗拱单件尺寸（世界单位），随层数按 tierOut 递出 */
  dougongParts: {
    /** 栌斗底面尺寸 */
    douSize: 0.44,
    douHeight: 0.34,
    /** 小斗 */
    smallDouSize: 0.3,
    smallDouHeight: 0.22,
    /** 拱身：每跳长度 */
    armLength: 1.18,
    armWidth: 0.22,
    armHeight: 0.2,
    /** 每层升高 */
    tierRise: 0.62,
    /** 每层向外递出 */
    tierOut: 0.8,
    /** 昂嘴再递出 */
    angOut: 0.55,
    /** 柱头 / 斗栌之间的高度 */
    columnHeadGap: 0.06,
  },
} as const;

/** 配色（中国传统建筑常用色，数值线性友好） */
export const PALETTE = {
  glazeBlue: 0x1b62b0,
  glazeBlueDeep: 0x0e3f80,
  glazeEdge: 0x0a2c5c,
  lacquerRed: 0xa8261f,
  lacquerRedDeep: 0x6f1811,
  woodBrown: 0x5a3520,
  gold: 0xd6a642,
  goldHot: 0xf6dfa0,
  jadeGreen: 0x2f7d63,
  azurite: 0x2a6bb5,
  marble: 0xe9e6dc,
  marbleShade: 0xcfcab9,
  stoneGrey: 0xbdb8a8,
  roofUnder: 0x3c2a24,
  interior: 0x241a16,
  pine: 0x2c5136,
  leaf: 0x3f7a3c,
  soil: 0x8a7455,
} as const;

/** 天空与光照 */
export const SKY = {
  zenith: 0x1f5fb8,
  horizon: 0xa9cdea,
  haze: 0xcfe0ee,
  sunColor: 0xfff1d6,
  sunDirection: [-0.52, 0.6, 0.58] as [number, number, number],
  /** 北京秋日晴空的能见度 */
  fogDensity: 0.00085,
  fogColor: 0xc3d8ea,
  exposure: 0.93,
  /** 半球光：地面反照（决定檐底亮度） */
  hemiGround: 0xb5a891,
  hemiIntensity: 1.05,
  ambientIntensity: 0.26,
  sunIntensity: 3.15,
} as const;

/** 画质档位 */
export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityProfile {
  pixelRatioCap: number;
  shadowMapSize: number;
  shadows: boolean;
  ao: boolean;
  bloom: boolean;
  roofRadialSegments: number;
  roofProfileSegments: number;
  treeCount: number;
  anisotropy: number;
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: {
    pixelRatioCap: 1,
    shadowMapSize: 1024,
    shadows: true,
    ao: false,
    bloom: false,
    roofRadialSegments: 144,
    roofProfileSegments: 22,
    treeCount: 40,
    anisotropy: 2,
  },
  medium: {
    pixelRatioCap: 1.5,
    shadowMapSize: 2048,
    shadows: true,
    ao: true,
    bloom: true,
    roofRadialSegments: 216,
    roofProfileSegments: 30,
    treeCount: 120,
    anisotropy: 4,
  },
  high: {
    pixelRatioCap: 2,
    shadowMapSize: 3072,
    shadows: true,
    ao: true,
    bloom: true,
    roofRadialSegments: 320,
    roofProfileSegments: 40,
    treeCount: 210,
    anisotropy: 8,
  },
};

/** 爆炸/重组动画参数 */
export const EXPLODE = {
  /** 单层动画时长（秒） */
  duration: 1.25,
  /** 层间错峰延迟（秒） */
  stagger: 0.085,
  /** 总位移的基准尺度 */
  scale: 1,
  /** 过渡期间附加的轻微旋转（弧度） */
  twist: 0.035,
} as const;

/** 相机默认机位 */
export const CAMERA = {
  fov: 38,
  near: 0.5,
  far: 900,
  start: [41, 19.5, 74] as [number, number, number],
  target: [0, 16.5, 0] as [number, number, number],
  /** 爆炸展开后的取景（[x,y,z,targetY]） */
  startExploded: [72, 52, 130, 34] as [number, number, number, number],
  minDistance: 26,
  maxDistance: 240,
  minPolar: 0.12,
  maxPolar: Math.PI * 0.495,
  autoRotateSpeed: 0.32,
} as const;
