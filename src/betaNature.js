import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { state } from "./state.js";
import { TRACK_LENGTH } from "./constants.js";
import { asphaltClearanceAt, trackHalfWidthAt } from "./track.js";

// O mesmo sol orienta o céu, os reflexos e as sombras do autódromo.
export const BETA_SUN_DIRECTION = new THREE.Vector3(
  -0.57,
  0.61,
  -0.55,
).normalize();

export function setupBetaEnvironment() {
  const sky = new Sky();
  sky.scale.setScalar(4200);
  sky.material.uniforms.turbidity.value = 2.45;
  sky.material.uniforms.rayleigh.value = 1.85;
  sky.material.uniforms.mieCoefficient.value = 0.0035;
  sky.material.uniforms.mieDirectionalG.value = 0.79;
  sky.material.uniforms.sunPosition.value.copy(BETA_SUN_DIRECTION);
  // Nuvens altas integradas à abóbada celeste, sem quads voltados à câmera.
  sky.material.fragmentShader =
    `
    float skyHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float skyNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+vec2(1,1)),f.x),f.y); }
    float cloudField(vec2 p) { float sum=0., amp=.5; for(int i=0;i<5;i++){sum+=amp*skyNoise(p);p=p*2.03+vec2(4.1,8.3);amp*=.5;} return sum; }
  ` + sky.material.fragmentShader;
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    "gl_FragColor = vec4( retColor, 1.0 );",
    `vec2 cloudUv=direction.xz/max(direction.y,.13)*1.1;
     float cloud=smoothstep(.54,.76,cloudField(cloudUv))*smoothstep(.06,.3,direction.y);
     retColor=mix(retColor,vec3(.76,.80,.81),cloud*.36);
     gl_FragColor=vec4(retColor,1.0);`,
  );
  sky.userData.keepSeparate = true;
  state.scene.add(sky);
  const environment = new THREE.Scene();
  environment.add(sky.clone());
  const generator = new THREE.PMREMGenerator(state.renderer);
  const target = generator.fromScene(environment, 0.04, 0.1, 6000);
  state.scene.userData.environmentTarget = target;
  state.betaEnvironment = target.texture;
  state.scene.environment = target.texture;
  state.scene.environmentIntensity = 0.62;
  generator.dispose();
}

function instances(geometry, material, count, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  state.scene.add(mesh);
  return mesh;
}

/** Ramos e copas são volumes reais: sem sprites, fotos ou transparências. */
export function buildBetaAtmosphere(
  groundHeightAt,
  rng,
  inWater = () => false,
) {
  const treeCount = 230;
  const branches = instances(
    new THREE.CylinderGeometry(0.12, 0.25, 1, 7),
    new THREE.MeshStandardMaterial({ color: "#675b48", roughness: 1 }),
    treeCount * 4,
    "beta-tree-branches",
  );
  // Folhas dobradas ao longo da nervura, com contorno recortado por geometria.
  // Uma única instância desenha toda a folhagem, sem texturas transparentes.
  const crownGeometry = new THREE.BufferGeometry();
  crownGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, -1, -0.46, 0, 0, 0, 0.16, 0, 0.46, 0, 0, 0, 0, 1],
      3,
    ),
  );
  crownGeometry.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3]);
  crownGeometry.computeVertexNormals();
  const leaves = instances(
    crownGeometry,
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.94,
      side: THREE.DoubleSide,
    }),
    treeCount * 24 * 32,
    "beta-tree-canopies",
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let branchIndex = 0,
    crownIndex = 0;
  for (let i = 0; i < treeCount; i++) {
    const s = rng() * TRACK_LENGTH;
    const lane =
      (rng() < 0.5 ? -1 : 1) * (trackHalfWidthAt(s) + 38 + rng() * 150);
    const p = state.track.at(s, lane).p;
    // Áreas de boxes/arquibancadas ficam abertas; raio da copa incluído.
    if (
      s < 300 ||
      s > TRACK_LENGTH - 480 ||
      inWater(p.x, p.z) ||
      asphaltClearanceAt(state.track, p.x, p.z) < 30
    )
      continue;
    const base = groundHeightAt(p.x, p.z);
    const height = 7 + rng() * 7;
    dummy.position.set(p.x, base + height * 0.36, p.z);
    dummy.rotation.set(0, rng() * 6.28, 0.04);
    dummy.scale.set(1.4, height * 0.72, 1.4);
    dummy.updateMatrix();
    branches.setMatrixAt(branchIndex++, dummy.matrix);
    for (let b = 0; b < 3; b++) {
      const angle = b * 2.09 + rng();
      dummy.position.set(
        p.x + Math.cos(angle),
        base + height * 0.65,
        p.z + Math.sin(angle),
      );
      dummy.rotation.set(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5);
      dummy.scale.set(0.7, height * 0.45, 0.7);
      dummy.updateMatrix();
      branches.setMatrixAt(branchIndex++, dummy.matrix);
    }
    for (let c = 0; c < 24; c++) {
      const angle = c * 2.399;
      const spread = c === 0 ? 0 : 1.2 + rng() * 2.6;
      const radius = 0.75 + rng() * 1.2;
      const centerX = p.x + Math.cos(angle) * spread;
      const centerY = base + height * (0.62 + rng() * 0.32);
      const centerZ = p.z + Math.sin(angle) * spread;
      for (let leaf = 0; leaf < 32; leaf++) {
        const azimuth = rng() * Math.PI * 2;
        const vertical = rng() * 2 - 1;
        const distance = radius * Math.cbrt(rng());
        const horizontal = Math.sqrt(1 - vertical * vertical) * distance;
        dummy.position.set(
          centerX + Math.cos(azimuth) * horizontal,
          centerY + vertical * distance * 0.7,
          centerZ + Math.sin(azimuth) * horizontal,
        );
        dummy.rotation.set(rng() * 2, rng() * 6.28, rng() * 2);
        const size = 0.28 + rng() * 0.28;
        dummy.scale.set(size, size, size);
        dummy.updateMatrix();
        leaves.setMatrixAt(crownIndex, dummy.matrix);
        color
          .set(c % 3 === 0 ? "#68763d" : c % 3 === 1 ? "#3c592f" : "#506937")
          .multiplyScalar(0.65 + rng() * 0.65);
        leaves.setColorAt(crownIndex++, color);
      }
    }
  }
  branches.count = branchIndex;
  leaves.count = crownIndex;
  branches.instanceMatrix.needsUpdate =
    leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;

  // Relevo contínuo fora do autódromo: silhueta de colinas, sem cones ou caixas.
  const ridgePositions = [],
    ridgeIndices = [];
  const segments = 128;
  for (let ring = 0; ring < 5; ring++) {
    const radius = 900 + ring * 210;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius;
      const silhouette =
        32 + 17 * Math.sin(angle * 4 + 0.5) + 11 * Math.cos(angle * 7);
      const y =
        ring === 0
          ? groundHeightAt(x, z) - 6
          : silhouette * Math.sin((ring / 4) * Math.PI) - 3;
      ridgePositions.push(x, y, z);
      if (ring < 4 && i < segments) {
        const a = ring * (segments + 1) + i,
          b = a + segments + 1;
        ridgeIndices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const ridgeGeometry = new THREE.BufferGeometry();
  ridgeGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(ridgePositions, 3),
  );
  ridgeGeometry.setIndex(ridgeIndices);
  ridgeGeometry.computeVertexNormals();
  const ridge = new THREE.Mesh(
    ridgeGeometry,
    new THREE.MeshStandardMaterial({
      color: "#65765e",
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  ridge.name = "beta-distant-ridge";
  state.scene.add(ridge);

  // Cidade em escala de fundo; nenhum prédio compete com o traçado no primeiro plano.
  const city = instances(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 }),
    72,
    "beta-distant-city",
  );
  city.castShadow = false;
  for (let i = 0; i < 72; i++) {
    const angle = 0.2 + rng() * 2.5,
      radius = 1100 + rng() * 260;
    const h = 9 + rng() * 37;
    dummy.position.set(
      Math.cos(angle) * radius,
      18 + h / 2,
      Math.sin(angle) * radius,
    );
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(9 + rng() * 15, h, 9 + rng() * 15);
    dummy.updateMatrix();
    city.setMatrixAt(i, dummy.matrix);
    city.setColorAt(i, color.set(i % 2 ? "#a5afa9" : "#8c9eaa"));
  }
  city.instanceMatrix.needsUpdate = true;
  city.instanceColor.needsUpdate = true;
}

/** Microrelevo procedural no espaço do mundo evita fotos repetidas no terreno. */
export function makeBetaGroundMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: "#7c8852",
    roughness: 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec3 vTerrainWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvTerrainWorld=(modelMatrix*vec4(position,1.0)).xyz;",
    );
    shader.fragmentShader =
      `varying vec3 vTerrainWorld;
      float fieldNoise(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float field(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(fieldNoise(i),fieldNoise(i+vec2(1.,0.)),f.x),mix(fieldNoise(i+vec2(0.,1.)),fieldNoise(i+1.),f.x),f.y); }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float broad=field(vTerrainWorld.xz*.045);
      float grain=field(vTerrainWorld.xz*3.0);
      diffuseColor.rgb*=mix(vec3(.67,.73,.52),vec3(1.15,1.08,.83),broad)*(.87+grain*.22);
    `,
    );
  };
  material.customProgramCacheKey = () => "beta-ground-v3";
  return material;
}
