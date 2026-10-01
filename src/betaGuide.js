import * as THREE from "three";
import { state } from "./state.js";
import { TRACK_LENGTH } from "./constants.js";
import { wrapAngle } from "./mathUtils.js";

/**
 * Guia de pilotagem da 2.0: uma linha fina e translúcida pintada no asfalto à frente do carro
 * (como a linha de corrida dos jogos de F1), sem paredes nem túnel, que muda de cor conforme o que fazer naquele trecho: verde = acelere, amarelo = alivie o pé, vermelho =
 * freie. O alvo de velocidade de cada ponto vem da curvatura da pista e da capacidade real de
 * esterço do carro (mesma fórmula de player.js), com frenagem calculada de trás para a frente.
 */

export const GUIDE = {
  step: 4, // m entre amostras do perfil
  ahead: 280, // m de pista mostrados
  skip: 4, // m logo à frente do carro sem faixa (evita sobrepor o cockpit)
  width: 1.3, // linha fina pintada no asfalto, como a linha de corrida dos jogos de F1
  decel: 30, // m/s² de frenagem considerada na curva
  topSpeed: 94, // m/s, teto da 2.0
  margin: 0.88, // fração da velocidade máxima de curva que o guia pede
};

/** Taxa máxima de guinada (rad/s) do carro a `speed` m/s: espelha updatePlayerPhysics. */
export function maxYawRate(speed) {
  return (0.2 + 0.98 / (1 + speed / 48)) * Math.min(speed / 11, 1);
}

/** Maior velocidade em que o carro ainda faz uma curva de curvatura `kappa` (1/m). */
export function cornerSpeed(kappa, topSpeed = GUIDE.topSpeed) {
  if (kappa < 1e-5) return topSpeed;
  let low = 8;
  let high = topSpeed;
  if (high * kappa <= maxYawRate(high)) return topSpeed;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (mid * kappa <= maxYawRate(mid)) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * Perfil de velocidade máxima permitida em cada amostra de uma pista fechada: limite de curva
 * e, de trás para a frente, a velocidade de que ainda dá para frear a tempo (duas voltas
 * para fechar o circuito).
 */
export function buildSpeedProfile(curvature, { step = GUIDE.step, decel = GUIDE.decel, topSpeed = GUIDE.topSpeed, margin = GUIDE.margin } = {}) {
  const count = curvature.length;
  // A margem só vale em curva; na reta o limite é o teto do carro.
  const limit = curvature.map((kappa) => {
    const corner = cornerSpeed(kappa, topSpeed);
    return corner >= topSpeed ? topSpeed : corner * margin;
  });
  const profile = limit.slice();
  for (let pass = 0; pass < 2; pass++) {
    for (let i = count - 1; i >= 0; i--) {
      const next = profile[(i + 1) % count];
      profile[i] = Math.min(profile[i], Math.sqrt(next * next + 2 * decel * step));
    }
  }
  return { profile, limit };
}

/** Curvatura (1/m) a cada `step` m, suavizada em ±`smooth` amostras. */
export function trackCurvature(yawAt, length, { step = GUIDE.step, smooth = 3 } = {}) {
  const count = Math.round(length / step);
  const raw = [];
  for (let i = 0; i < count; i++) {
    raw.push(Math.abs(wrapAngle(yawAt(((i + 1) * step) % length) - yawAt((i * step) % length))) / step);
  }
  return raw.map((_, i) => {
    let sum = 0;
    for (let k = -smooth; k <= smooth; k++) sum += raw[(i + k + count) % count];
    return sum / (2 * smooth + 1);
  });
}

export const ACTIONS = { go: "go", lift: "lift", brake: "brake" };

/**
 * O que fazer num ponto cujo perfil permite `allowed` m/s, estando o carro a `speed` m/s.
 * Freia se estiver acima do permitido, alivia se estiver perto do limite de uma curva, e
 * acelera nos demais casos (inclusive nas retas, em que o permitido é o teto).
 */
export function guideAction(speed, allowed, limit, { topSpeed = GUIDE.topSpeed } = {}) {
  if (speed > allowed * 1.05 + 1) return ACTIONS.brake;
  const inCorner = limit < topSpeed * 0.92;
  if (inCorner && speed > allowed * 0.92) return ACTIONS.lift;
  return ACTIONS.go;
}

export const ACTION_COLORS = {
  go: new THREE.Color("#19e06d"),
  lift: new THREE.Color("#ffcf2e"),
  brake: new THREE.Color("#ff2a22"),
};

/** Linha contínua com bordas suaves e um leve traço repetido (textura em canvas). */
function lineTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const across = ctx.createLinearGradient(0, 0, size, 0);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.3, "rgba(255,255,255,0.85)");
  across.addColorStop(0.7, "rgba(255,255,255,0.85)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, size, size);
  // Trecho levemente mais fraco entre os traços: a linha parece segmentada sem ficar picotada.
  const along = ctx.createLinearGradient(0, 0, 0, size);
  along.addColorStop(0, "rgba(0,0,0,0)");
  along.addColorStop(0.5, "rgba(0,0,0,0.32)");
  along.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const _color = new THREE.Color();

/** Cria a faixa. Chamar depois de `state.track` existir; devolve o controlador. */
export function createBetaGuide() {
  const track = state.track;
  const curvature = trackCurvature((s) => track.at(s).yaw, TRACK_LENGTH);
  const { profile, limit } = buildSpeedProfile(curvature);
  const count = curvature.length;

  const segments = Math.floor((GUIDE.ahead - GUIDE.skip) / GUIDE.step);
  const vertices = (segments + 1) * 2;
  const positions = new Float32Array(vertices * 3);
  const colors = new Float32Array(vertices * 4); // RGBA: o alfa esmaece a linha com a distância
  const uvs = new Float32Array(vertices * 2);
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    map: lineTexture(),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "beta-guide";
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  state.scene.add(mesh);

  let lastAction = null;

  return {
    mesh,
    /** Reposiciona e recolore a faixa para a posição `s` (m) e a velocidade `speed` (m/s). */
    update(s, speed, clock = 0) {
      const base = s + GUIDE.skip;
      for (let i = 0; i <= segments; i++) {
        const distance = base + i * GUIDE.step;
        const index = ((Math.round(distance / GUIDE.step) % count) + count) % count;
        const action = guideAction(speed, profile[index], limit[index]);
        if (i === 0) lastAction = action;
        const frame = track.at(((distance % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH);
        const half = GUIDE.width / 2;
        // Esmaece com a distância para o guia não "cortar" no horizonte.
        const fade = 1 - Math.min(1, Math.max(0, (distance - s - 120) / (GUIDE.ahead - 120)));
        for (let side = 0; side < 2; side++) {
          const v = i * 2 + side;
          const lateral = side ? half : -half;
          positions[v * 3] = frame.p.x + frame.right.x * lateral;
          positions[v * 3 + 1] = frame.p.y + 0.12;
          positions[v * 3 + 2] = frame.p.z + frame.right.z * lateral;
          _color.copy(ACTION_COLORS[action]);
          colors[v * 4] = _color.r;
          colors[v * 4 + 1] = _color.g;
          colors[v * 4 + 2] = _color.b;
          // Translúcida e suave: some aos poucos com a distância e logo à frente do carro.
          const near = Math.min(1, (distance - s) / 18);
          colors[v * 4 + 3] = (0.15 + 0.5 * fade) * near;
          uvs[v * 2] = side;
          uvs[v * 2 + 1] = distance / 9;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      geometry.attributes.uv.needsUpdate = true;
      // Respiração bem leve, só para a linha parecer viva.
      material.opacity = 0.78 + Math.sin(clock * 2.4) * 0.04;
    },
    /** Ação do trecho logo à frente (para testes e a HUD). */
    get action() {
      return lastAction;
    },
  };
}
