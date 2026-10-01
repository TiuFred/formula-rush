import * as THREE from "three";
import { addBox, addMesh, makeMaterial } from "./materials.js";

/**
 * Volante de F1 moderno (estilo "Mercedes W11") modelado do zero a partir de
 * medidas tiradas de uma imagem de referência: chassi de carbono largo, display
 * retangular com fileira de 15 LEDs, empunhaduras que descem curvadas, botões
 * coloridos nos cantos, colunas de botões ao lado do display e três seletores
 * serrilhados com anéis numerados. Nenhuma malha nem textura do modelo de
 * referência é usada.
 *
 * O desenho é feito em "pixels de tela" (vistos pelo piloto) e convertido para
 * metros por `P`. Em espaço local do volante: +x é a esquerda do piloto, +y para
 * cima, a face aponta para -z (em direção ao piloto).
 */
const K = 0.56 / 920;
const CENTER_X = 640;
const CENTER_Y = 360;

/** Pixel de tela → metros no plano do volante (espelha x: +x local = esquerda do piloto). */
const P = (px, py) => new THREE.Vector2(-(px - CENTER_X) * K, (CENTER_Y - py) * K);

export const WHEEL_FACE_Z = -0.04;
/** Centro da pegada de cada mão, em coordenadas locais do volante (antes da escala). */
export const GRIP_ANCHOR = { x: 0.245, y: -0.045, z: -0.012 };
/** Escala da luva em relação ao volante e posição do punho no espaço local da mão (antes da escala). */
export const HAND_SCALE = 0.9;
export const WRIST_IN_HAND = { x: 0.004, y: -0.09, z: -0.1 };

/** Punho, em coordenadas do volante: logo abaixo do dorso da mão, do lado do piloto. */
export const wristLocal = (side) =>
  new THREE.Vector3(
    side * (GRIP_ANCHOR.x + WRIST_IN_HAND.x * HAND_SCALE),
    GRIP_ANCHOR.y + WRIST_IN_HAND.y * HAND_SCALE,
    GRIP_ANCHOR.z + WRIST_IN_HAND.z * HAND_SCALE,
  );

export const DISPLAY = { width: 330 * K, height: 206 * K, px: 640, py: 282, canvasW: 800, canvasH: 500 };
export const SHIFT_LED_COUNT = 15;

function pathFrom(points, mirror = false) {
  const shape = new THREE.Shape();
  points.forEach(([px, py], i) => {
    const p = P(mirror ? 1280 - px : px, py);
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  return shape;
}

// Contorno do chassi (metade direita vista pelo piloto; o resto é espelhado).
const PLATE_HALF = [
  [640, 84], [790, 87], [910, 91], [975, 98], [1018, 112], [1036, 140], [1034, 184],
  [1004, 218], [948, 262], [942, 330], [940, 410], [925, 490], [895, 528], [800, 536], [700, 540], [640, 541],
];
const plateOutline = () => [...PLATE_HALF, ...[...PLATE_HALF].reverse().map(([x, y]) => [1280 - x, y])];

// Empunhadura direita (vista pelo piloto); a esquerda é espelhada.
const GRIP = [
  [946, 206], [1012, 258], [1070, 338], [1098, 430], [1100, 522],
  [1080, 592], [1054, 614], [1018, 608], [990, 580], [984, 500], [976, 420], [962, 330], [946, 262],
];

function rubberMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#15171a";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#1f2226";
  for (let y = 0; y < 64; y += 6) ctx.fillRect(0, y, 64, 2);
  ctx.fillStyle = "#0e1012";
  for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 1, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 6);
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 });
}

// ---------------------------------------------------------------------------
// Placa frontal pintada: carbono, botões impressos, rótulos e anéis dos seletores.
// ---------------------------------------------------------------------------
const FACE = { x0: 280, y0: 70, w: 720, h: 490, scale: 2 };

function buildFaceTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = FACE.w * FACE.scale;
  canvas.height = FACE.h * FACE.scale;
  const ctx = canvas.getContext("2d");
  // Coordenadas de tela do piloto (px, py) → pixels da textura.
  const tx = (px) => (px - FACE.x0) * FACE.scale;
  const ty = (py) => (py - FACE.y0) * FACE.scale;
  const s = FACE.scale;

  const disc = (px, py, r, fill, stroke) => {
    ctx.beginPath();
    ctx.arc(tx(px), ty(py), r * s, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 2.5 * s;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  };
  const label = (text, px, py, size = 16, color = "#f0f0ec") => {
    ctx.fillStyle = color;
    ctx.font = `bold ${size * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(text, tx(px), ty(py) + size * 0.35 * s);
  };
  const box = (px, py, w, h, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(tx(px - w / 2), ty(py - h / 2), w * s, h * s);
  };

  // Base: recorte no contorno do chassi e trama de carbono.
  ctx.beginPath();
  plateOutline().forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(tx(px), ty(py));
    else ctx.lineTo(tx(px), ty(py));
  });
  ctx.closePath();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#0c0e11";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Sem trama periódica: em escala reduzida ela vira moiré.
  const sheen = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sheen.addColorStop(0, "#14181c");
  sheen.addColorStop(1, "#0a0c0f");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Botões superiores esquerdos (DRS, +10, N) e direitos (PC, +1, PL).
  const top = [
    [296, 155, 22, "#e6c72b", "DRS", "#2a2400"],
    [352, 165, 20, "#5b2a8f", "+10", "#f3eaff"],
    [403, 195, 22, "#17a7a4", "N", "#eaffff"],
    [982, 155, 22, "#ee8b1d", "PC", "#2b1600"],
    [927, 165, 20, "#5b2a8f", "+1", "#f3eaff"],
    [874, 197, 22, "#d8cf2c", "PL", "#2a2700"],
  ];
  for (const [px, py, r, color, text, ink] of top) {
    disc(px, py, r + 4, "#050607", "#23272c");
    disc(px, py, r, color);
    disc(px - r * 0.25, py - r * 0.28, r * 0.42, "rgba(255,255,255,0.22)");
    label(text, px, py, r * 0.72, ink);
  }
  for (const [px, py] of [[385, 153], [407, 160], [870, 160], [892, 150]]) disc(px, py, 7, "#0a0b0d", "#544a1a");

  // Coluna esquerda: BB+, OT, X, BB-. Coluna direita: BBAL, MARK, TALK, BB+.
  box(395, 280, 44, 60, "#c9a512");
  box(395, 280, 34, 50, "#e8c62c");
  label("BB+", 396, 243, 15);
  label("BMIG", 432, 286, 13);
  disc(421, 342, 24, "#050607", "#23272c");
  disc(421, 342, 19, "#1d2fa8");
  label("OT", 421, 342, 15);
  disc(410, 410, 26, "#050607", "#23272c");
  disc(410, 410, 21, "#c21c24");
  label("✕", 410, 410, 22);
  disc(398, 476, 27, "#050607", "#23272c");
  disc(398, 476, 21, "#0f1012", "#2d3136");
  label("BB-", 398, 476, 15);
  label("MID", 404, 375, 11, "#d9d9d4");
  box(365, 370, 30, 58, "#2b3035");
  label("10", 365, 350, 11);
  label("11", 365, 370, 11);
  label("12", 365, 390, 11);

  box(885, 276, 38, 62, "#c9a512");
  box(885, 276, 28, 52, "#e8c62c");
  label("BBAL", 858, 282, 13);
  disc(857, 342, 24, "#050607", "#23272c");
  disc(857, 342, 19, "#0f1012", "#2d3136");
  label("MARK", 857, 342, 11);
  disc(865, 410, 27, "#050607", "#23272c");
  disc(865, 410, 22, "#c9cbcd");
  label("TALK", 865, 410, 12, "#1b1d1f");
  disc(880, 476, 27, "#050607", "#23272c");
  disc(880, 476, 21, "#0f1012", "#2d3136");
  label("BB+", 880, 476, 15);
  box(915, 370, 30, 62, "#1e8f32");
  label("8", 915, 350, 11);
  label("9", 915, 370, 13);
  label("10", 915, 392, 11);
  label("EB", 876, 374, 11, "#d7e93a");

  // Seletores inferiores: anéis coloridos numerados (o botão serrilhado é 3D).
  const rings = [
    [510, 476, 58, ["#1b59c4", "#e4b71d", "#e97a1d", "#1fa77a", "#d8d8d2"]],
    [640, 466, 44, ["#d63a2b", "#2a6bd0", "#e4b71d", "#1fa77a"]],
    [765, 476, 58, ["#35c7c0", "#e4b71d", "#d63a2b", "#d8d8d2", "#1b59c4"]],
  ];
  for (const [cx, cy, r, palette] of rings) {
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(tx(cx), ty(cy), r * s, a0, a1);
      ctx.arc(tx(cx), ty(cy), (r - 20) * s, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
    }
    disc(cx, cy, r - 21, "#0a0b0d");
    for (let i = 0; i < steps; i++) {
      const a = ((i + 0.5) / steps) * Math.PI * 2 - Math.PI / 2;
      label(String(i + 1), cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10), 11, "#0a0b0d");
    }
  }
  for (const [text, px, py] of [["DEF", 716, 436], ["BITE", 688, 442], ["WET", 596, 428], ["DISP", 580, 474], ["DASH", 582, 490], ["VOL", 626, 516], ["CRUZ", 658, 516], ["TRQ", 680, 504], ["MAG", 692, 488]]) {
    label(text, px, py, 10, "#e9e9e4");
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Botão rotativo serrilhado (perfil de engrenagem), como nos seletores do original. */
function gearKnob(radius, height, teeth, material) {
  const shape = new THREE.Shape();
  const steps = teeth * 2;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = i % 2 ? radius * 0.86 : radius;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: radius * 0.05, bevelThickness: height * 0.12, bevelSegments: 2 });
  geometry.translate(0, 0, -height);
  return new THREE.Mesh(geometry, material);
}

export function buildF1Wheel(parent, { metal }) {
  const wheel = new THREE.Group();
  wheel.name = "beta-steering-wheel";
  parent.add(wheel);

  const rubber = rubberMaterial();
  // Material liso: a trama de carbono procedural gera moiré nessa escala; a placa pintada já traz o desenho.
  const carbon = new THREE.MeshStandardMaterial({ color: "#0d1013", roughness: 0.42, metalness: 0.35 });
  const faceTexture = buildFaceTexture();

  // Chassi de carbono (volume) e placa impressa por cima.
  const plateDepth = 0.04;
  const plateGeometry = new THREE.ExtrudeGeometry(pathFrom(plateOutline()), {
    depth: plateDepth,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 2,
    curveSegments: 6,
  });
  plateGeometry.translate(0, 0, -plateDepth);
  const plate = addMesh(plateGeometry, carbon, 0, 0, 0, wheel);
  plate.name = "beta-wheel-plate";

  const faceWidth = FACE.w * K;
  const faceHeight = FACE.h * K;
  const faceCenter = P(FACE.x0 + FACE.w / 2, FACE.y0 + FACE.h / 2);
  const face = addMesh(
    new THREE.PlaneGeometry(faceWidth, faceHeight),
    new THREE.MeshStandardMaterial({ map: faceTexture, transparent: true, alphaTest: 0.5, roughness: 0.5, metalness: 0.25 }),
    faceCenter.x,
    faceCenter.y,
    WHEEL_FACE_Z - 0.0045,
    wheel,
  );
  face.rotation.y = Math.PI;
  face.castShadow = false;
  face.name = "beta-wheel-face";

  // Empunhaduras de borracha.
  for (const mirror of [false, true]) {
    const geometry = new THREE.ExtrudeGeometry(pathFrom(GRIP, mirror), {
      depth: 0.07,
      bevelEnabled: true,
      bevelSize: 0.011,
      bevelThickness: 0.011,
      bevelSegments: 4,
      curveSegments: 6,
    });
    geometry.translate(0, 0, -0.07 - 0.002);
    const grip = addMesh(geometry, rubber, 0, 0, 0, wheel);
    grip.name = `beta-wheel-grip-${mirror ? "left" : "right"}`;
  }

  // Moldura elevada do display.
  const dp = P(DISPLAY.px, DISPLAY.py);
  const outer = new THREE.Shape();
  const hw = DISPLAY.width / 2 + 0.008;
  const hh = DISPLAY.height / 2 + 0.008;
  const r = 0.012;
  outer.moveTo(-hw + r, -hh);
  outer.lineTo(hw - r, -hh);
  outer.quadraticCurveTo(hw, -hh, hw, -hh + r);
  outer.lineTo(hw, hh - r);
  outer.quadraticCurveTo(hw, hh, hw - r, hh);
  outer.lineTo(-hw + r, hh);
  outer.quadraticCurveTo(-hw, hh, -hw, hh - r);
  outer.lineTo(-hw, -hh + r);
  outer.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const hole = new THREE.Path();
  const iw = DISPLAY.width / 2;
  const ih = DISPLAY.height / 2;
  hole.moveTo(-iw, -ih);
  hole.lineTo(-iw, ih);
  hole.lineTo(iw, ih);
  hole.lineTo(iw, -ih);
  hole.closePath();
  outer.holes.push(hole);
  const bezelGeometry = new THREE.ExtrudeGeometry(outer, { depth: 0.011, bevelEnabled: true, bevelSize: 0.0025, bevelThickness: 0.0025, bevelSegments: 2 });
  bezelGeometry.translate(0, 0, -0.011);
  addMesh(bezelGeometry, carbon, dp.x, dp.y, WHEEL_FACE_Z - 0.004, wheel).name = "beta-wheel-bezel";

  // Display (canvas atualizado pela telemetria).
  const canvas = document.createElement("canvas");
  canvas.width = DISPLAY.canvasW;
  canvas.height = DISPLAY.canvasH;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const display = addMesh(
    new THREE.PlaneGeometry(DISPLAY.width, DISPLAY.height),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    dp.x,
    dp.y,
    WHEEL_FACE_Z - 0.0145,
    wheel,
  );
  display.rotation.y = Math.PI;
  display.castShadow = false;
  display.name = "beta-wheel-display";

  // LEDs: 15 de troca de marcha sobre o display e 3 + 3 laterais.
  const ledMaterial = (color) => new THREE.MeshStandardMaterial({ color: "#182126", emissive: color, emissiveIntensity: 0, roughness: 0.25 });
  const shiftLights = [];
  for (let i = 0; i < SHIFT_LED_COUNT; i++) {
    const on = i < 5 ? "#2ee58f" : i < 10 ? "#ff3b30" : "#3d8bff";
    const p = P(495 + i * 20, 153);
    const led = addMesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 14), ledMaterial(on), p.x, p.y, WHEEL_FACE_Z - 0.006, wheel);
    led.rotation.x = Math.PI / 2;
    led.castShadow = false;
    led.userData.on = on;
    shiftLights.push(led);
  }
  const sideLights = [];
  for (const px of [455, 825]) {
    for (const py of [185, 203, 220]) {
      const p = P(px, py);
      const led = addMesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.005, 12), ledMaterial("#ffb020"), p.x, p.y, WHEEL_FACE_Z - 0.006, wheel);
      led.rotation.x = Math.PI / 2;
      led.castShadow = false;
      led.userData.on = "#ffb020";
      sideLights.push(led);
    }
  }

  // Aros em relevo ao redor dos botões (botões são impressos na placa).
  const ringMaterial = makeMaterial("#050607", { roughness: 0.4, metalness: 0.4 });
  const rings = [
    [296, 155, 26], [352, 165, 24], [403, 195, 26], [982, 155, 26], [927, 165, 24], [874, 197, 26],
    [421, 342, 28], [410, 410, 30], [398, 476, 31], [857, 342, 28], [865, 410, 31], [880, 476, 31],
  ];
  for (const [px, py, pr] of rings) {
    const p = P(px, py);
    const ring = addMesh(new THREE.TorusGeometry(pr * K, 0.0022, 6, 28), ringMaterial, p.x, p.y, WHEEL_FACE_Z - 0.0052, wheel);
    ring.castShadow = false;
  }
  // Balancins amarelos em relevo.
  for (const [px, py, w, h] of [[395, 280, 40, 56], [885, 276, 34, 58]]) {
    const p = P(px, py);
    addBox(w * K, h * K, 0.012, makeMaterial("#e8c62c", { roughness: 0.35, transparent: true, opacity: 0.8 }), p.x, p.y, WHEEL_FACE_Z - 0.01, wheel).castShadow = false;
  }

  // Seletores serrilhados: amarelo, roxo e verde-água.
  const knobs = [
    [510, 476, 38, "#d9c323"],
    [640, 466, 28, "#4a1f86"],
    [765, 476, 38, "#19a6a1"],
  ];
  for (const [px, py, pr, color] of knobs) {
    const p = P(px, py);
    const knob = gearKnob(pr * K, 0.016, 12, new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0.1, clearcoat: 0.6 }));
    knob.position.set(p.x, p.y, WHEEL_FACE_Z - 0.0048);
    knob.castShadow = true;
    wheel.add(knob);
    const cap = addMesh(new THREE.CylinderGeometry(pr * K * 0.42, pr * K * 0.42, 0.004, 20), ringMaterial, p.x, p.y, WHEEL_FACE_Z - 0.0245, wheel);
    cap.rotation.x = Math.PI / 2;
  }

  // Aletas de câmbio atrás do volante.
  for (const side of [-1, 1]) {
    const paddle = addMesh(new THREE.BoxGeometry(0.07, 0.15, 0.008), metal, side * 0.16, -0.03, 0.038, wheel);
    paddle.rotation.z = side * 0.12;
  }

  return { wheel, canvas, ctx: canvas.getContext("2d"), texture, shiftLights, sideLights };
}
