/**
 * 北京晴空 + 光照 + 环境反射
 * ------------------------------------------------------------------
 * · 天穹：自定义着色器（天顶蓝 → 地平线白），含太阳盘与体积感云带；
 * · 光照：DirectionalLight（投影）+ HemisphereLight + 弱环境光；
 * · 环境贴图：把同一片天空烘进 PMREM，供鎏金/琉璃产生真实反射。
 */
import * as THREE from 'three';
import { SKY } from '../config';
import { cloudTexture } from '../gfx/textures';

const skyVert = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(worldPos.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const skyFrag = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform sampler2D uClouds;
  uniform float uTime;
  varying vec3 vWorldDir;

  void main() {
    vec3 dir = normalize(vWorldDir);
    float h = clamp(dir.y, -1.0, 1.0);

    // 天顶 → 地平线的梯度（贴近地平线更白）
    float t = pow(clamp(h, 0.0, 1.0), 0.42);
    vec3 col = mix(uHorizon, uZenith, t);
    col = mix(col, uHaze, pow(1.0 - clamp(h, 0.0, 1.0), 6.0) * 0.55);

    // 太阳周围的辉光
    float cosA = dot(dir, normalize(uSunDir));
    float glow = pow(max(cosA, 0.0), 220.0);
    float halo = pow(max(cosA, 0.0), 7.0) * 0.22;
    col += uSunColor * (glow * 2.4 + halo);

    // 云：按方向投影到穹顶平面
    if (h > 0.02) {
      vec2 uv = dir.xz / (h + 0.22) * 0.32 + vec2(uTime * 0.0035, uTime * 0.0012);
      float c = texture2D(uClouds, uv).a;
      float c2 = texture2D(uClouds, uv * 2.1 + vec2(0.31, 0.17)).a;
      float cover = clamp(c * 0.85 + c2 * 0.4, 0.0, 1.0);
      cover *= smoothstep(0.02, 0.2, h);
      vec3 cloudCol = mix(vec3(0.97, 0.98, 1.0), vec3(1.0, 0.99, 0.95), glow * 0.6);
      col = mix(col, cloudCol, cover * 0.62);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface SkyResult {
  mesh: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  envTexture: THREE.Texture;
  update(elapsed: number): void;
}

export function createSky(renderer: THREE.WebGLRenderer, scene: THREE.Scene): SkyResult {
  const sunDir = new THREE.Vector3(...SKY.sunDirection).normalize();

  const uniforms = {
    uZenith: { value: new THREE.Color(SKY.zenith) },
    uHorizon: { value: new THREE.Color(SKY.horizon) },
    uHaze: { value: new THREE.Color(SKY.haze) },
    uSunColor: { value: new THREE.Color(SKY.sunColor) },
    uSunDir: { value: sunDir.clone() },
    uClouds: { value: cloudTexture() },
    uTime: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 32), mat);
  mesh.name = 'sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // ---- 环境反射（把天空烘进 PMREM）----
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const envMesh = new THREE.Mesh(mesh.geometry, mat);
  envScene.add(envMesh);
  const envRT = pmrem.fromScene(envScene, 0.0, 1, 1200);
  scene.environment = envRT.texture;
  pmrem.dispose();

  // ---- 光照 ----
  const sun = new THREE.DirectionalLight(0xfff3de, SKY.sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 40;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 52;
  sun.shadow.camera.bottom = -22;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 14, 0);
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd9f4, SKY.hemiGround, SKY.hemiIntensity);
  hemi.position.set(0, 60, 0);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, SKY.ambientIntensity);
  scene.add(ambient);

  return {
    mesh,
    sun,
    hemi,
    ambient,
    envTexture: envRT.texture,
    update(elapsed: number) {
      uniforms.uTime.value = elapsed;
    },
  };
}
