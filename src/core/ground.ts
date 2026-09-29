/**
 * 广场地面与院墙
 * ------------------------------------------------------------------
 * · 大面积铺地（程序化石板纹理）+ 边缘暗角接地；
 * · 祈年殿所在的圆形月台；
 * · 朱红院墙与瓦顶，界定"天坛"的空间感。
 */
import * as THREE from 'three';
import { getMaterials } from '../gfx/materials';
import { vignetteTexture } from '../gfx/textures';
import { TAU as TAU_ } from '../build/roofProfile';

export function buildGround(): THREE.Group {
  const mats = getMaterials();
  const group = new THREE.Group();
  group.name = 'environment';

  // ---- 广场铺地 ----
  const pavingMat = mats.paving.clone();
  (pavingMat.map as THREE.Texture).repeat.set(90, 90);
  if (pavingMat.normalMap) (pavingMat.normalMap as THREE.Texture).repeat.set(90, 90);
  if (pavingMat.roughnessMap) (pavingMat.roughnessMap as THREE.Texture).repeat.set(90, 90);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 96), pavingMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  ground.name = 'plaza';
  group.add(ground);

  // ---- 接地暗角 ----
  const vignette = new THREE.Mesh(
    new THREE.RingGeometry(26, 300, 96, 1),
    new THREE.MeshBasicMaterial({
      map: vignetteTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
  );
  vignette.rotation.x = -Math.PI / 2;
  vignette.position.y = 0.015;
  group.add(vignette);

  // ---- 月台：建筑所在的圆形高台 ----
  const podium = new THREE.Mesh(
    new THREE.CylinderGeometry(30.5, 31.2, 0.62, 96, 1, false),
    mats.stone,
  );
  podium.position.y = 0.31;
  podium.receiveShadow = true;
  podium.castShadow = true;
  group.add(podium);

  const podiumEdge = new THREE.Mesh(
    new THREE.CylinderGeometry(31.35, 31.35, 0.12, 96),
    mats.marble,
  );
  podiumEdge.position.y = 0.66;
  podiumEdge.receiveShadow = true;
  group.add(podiumEdge);

  // 月台踏步（南北各一）
  const stepGeo = new THREE.BoxGeometry(14, 0.21, 1.4);
  const steps = new THREE.InstancedMesh(stepGeo, mats.marble, 6);
  steps.receiveShadow = true;
  steps.castShadow = true;
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 3; i++) {
    mat.compose(new THREE.Vector3(0, 0.105 + i * 0.21, 31.4 - i * 0.7), q, one);
    steps.setMatrixAt(i, mat);
    mat.compose(new THREE.Vector3(0, 0.105 + i * 0.21, -31.4 + i * 0.7), q, one);
    steps.setMatrixAt(i + 3, mat);
  }
  steps.instanceMatrix.needsUpdate = true;
  group.add(steps);

  // ---- 院墙（朱红 + 灰瓦顶）----
  const wallRadius = 122;
  const wallHeight = 4.1;
  const segs = 48;
  const wallGeo = new THREE.BoxGeometry((TAU_ * wallRadius) / segs + 0.6, wallHeight, 0.9);
  const walls = new THREE.InstancedMesh(wallGeo, mats.wallRed, segs);
  walls.castShadow = true;
  walls.receiveShadow = true;
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * TAU_;
    mat.compose(
      new THREE.Vector3(Math.sin(th) * wallRadius, wallHeight / 2, Math.cos(th) * wallRadius),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), th),
      one,
    );
    walls.setMatrixAt(i, mat);
  }
  walls.instanceMatrix.needsUpdate = true;
  group.add(walls);

  // 墙顶灰瓦（略带出檐的双坡感）
  const copingGeo = new THREE.BoxGeometry((TAU_ * wallRadius) / segs + 0.9, 0.34, 1.9);
  const coping = new THREE.InstancedMesh(copingGeo, mats.stone, segs);
  coping.castShadow = true;
  coping.receiveShadow = true;
  const ridgeGeo = new THREE.BoxGeometry((TAU_ * wallRadius) / segs + 0.7, 0.3, 1.1);
  const ridge = new THREE.InstancedMesh(ridgeGeo, mats.tileRoof, segs);
  ridge.castShadow = true;
  for (let i = 0; i < segs; i++) {
    const th = (i / segs) * TAU_;
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), th);
    mat.compose(
      new THREE.Vector3(Math.sin(th) * wallRadius, wallHeight + 0.17, Math.cos(th) * wallRadius),
      rot,
      one,
    );
    coping.setMatrixAt(i, mat);
    mat.compose(
      new THREE.Vector3(Math.sin(th) * wallRadius, wallHeight + 0.46, Math.cos(th) * wallRadius),
      rot,
      one,
    );
    ridge.setMatrixAt(i, mat);
  }
  coping.instanceMatrix.needsUpdate = true;
  ridge.instanceMatrix.needsUpdate = true;
  group.add(coping, ridge);

  // ---- 甬道：从南门通向月台中轴的铺装带 ----
  const pathMat = new THREE.MeshStandardMaterial({
    color: 0xd2c9b4,
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.7,
  });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 66), pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.012, 62);
  path.receiveShadow = true;
  group.add(path);

  // ---- 甬道两侧石灯座 ----
  const bollardGeo = new THREE.CylinderGeometry(0.28, 0.36, 1.5, 10);
  bollardGeo.translate(0, 0.75, 0);
  const bollards = new THREE.InstancedMesh(bollardGeo, mats.marble, 12);
  bollards.castShadow = true;
  bollards.receiveShadow = true;
  let bi = 0;
  for (let i = 0; i < 6; i++) {
    const z = 34 + i * 11;
    for (const sx of [-1, 1]) {
      mat.compose(new THREE.Vector3(sx * 6.4, 0, z), q, one);
      bollards.setMatrixAt(bi++, mat);
    }
  }
  bollards.instanceMatrix.needsUpdate = true;
  group.add(bollards);

  return group;
}
