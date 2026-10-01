import * as THREE from "three";

/**
 * Pneu de F1 da 2.0, todo procedural (sem imagens): o sombreador trabalha no espaço do objeto do pneu
 * do arquivo, onde o eixo da roda é y e a face lateral é o plano xz. Por isso o desenho gira junto com
 * a roda, e as letras da lateral dão a volta no aro sem emendas.
 *
 * Banda de rodagem: borracha preta e macia, com riscos finos no sentido da volta, manchas de borracha
 * colada ("marbles") e pó claro nos ombros. Parede lateral: costelas concêntricas do molde, pó de
 * freio perto do aro e as inscrições (marca, composto, medidas) em relevo, desgastadas.
 */

const DECAL = { width: 4096, height: 256 };

/** Onde as inscrições ficam na parede lateral, de 0 (aro) a 1 (ombro): fora do anel vermelho do aro. */
const TEXT_BAND = 0.82;

/** Fração do raio médio das inscrições que a altura da imagem cobre. */
const DECAL_SPAN = (2 * Math.PI * DECAL.height) / DECAL.width;

/** Inscrições da lateral, desenhadas em reto: o sombreador as curva em torno do aro (x = volta inteira). */
function drawDecal(ctx) {
  const { width: w, height: h } = DECAL;
  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const at = (degrees) => ((degrees % 360) / 360) * w;
  const text = (value, degrees, size, color, spacing = 0) => {
    ctx.font = `800 ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = color;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
    // Repete uma volta para cada lado: o texto que cruza a emenda em 0° fecha do outro lado.
    for (const turn of [-w, 0, w]) ctx.fillText(value, at(degrees) + turn, h / 2);
  };
  // Marca em letras grandes e o composto na cor do composto, de lados opostos da roda.
  text("FORMULA RUSH", 0, 74, "#ecebe6", 9);
  text("SOFT", 180, 92, "#e4291c", 12);
  // Faixa do composto sob a palavra e traços de molde.
  ctx.fillStyle = "#e4291c";
  ctx.fillRect(at(180) - 130, h / 2 + 56, 260, 6);
  ctx.fillStyle = "#ecebe6";
  ctx.fillRect(at(0) - 280, h / 2 + 56, 560, 3);
  // Detalhes pequenos entre os dois: especificação e origem.
  text("2.0 · HYPER RACING", 90, 34, "#c9c7c0", 5);
  text("305/660-R18 · RUSH-S", 270, 34, "#c9c7c0", 5);
  text("◀  ROTATION", 135, 28, "#c9c7c0", 4);
  text("ROTATION  ▶", 225, 28, "#c9c7c0", 4);
}

let decalTexture = null;

/** Textura das inscrições; sem canvas (testes) devolve um pixel transparente. */
export function tireDecalTexture() {
  if (decalTexture) return decalTexture;
  if (typeof document === "undefined") {
    decalTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    decalTexture.needsUpdate = true;
    return decalTexture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = DECAL.width;
  canvas.height = DECAL.height;
  drawDecal(canvas.getContext("2d"));
  decalTexture = new THREE.CanvasTexture(canvas);
  decalTexture.colorSpace = THREE.SRGBColorSpace;
  decalTexture.wrapS = THREE.RepeatWrapping;
  decalTexture.wrapT = THREE.ClampToEdgeWrapping;
  decalTexture.anisotropy = 8;
  return decalTexture;
}

const NOISE = `
float tHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float tNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tHash(i), tHash(i + vec3(1,0,0)), f.x), mix(tHash(i + vec3(0,1,0)), tHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(tHash(i + vec3(0,0,1)), tHash(i + vec3(1,0,1)), f.x), mix(tHash(i + vec3(0,1,1)), tHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float tFbm(vec3 p) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { sum += amp * tNoise(p); p = p * 2.03 + vec3(7.1, 3.7, 1.3); amp *= 0.5; }
  return sum;
}
vec3 tPerturb(vec3 pos, vec3 n, vec2 dH, float face) {
  vec3 sx = normalize(dFdx(pos)), sy = normalize(dFdy(pos));
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * face;
  return normalize(abs(det) * n - sign(det) * (dH.x * r1 + dH.y * r2));
}
`;

const COLOR = `
#include <color_fragment>
float tSide = smoothstep(0.45, 0.85, abs(vTN.y));
float tOutward = smoothstep(0.3, 0.9, vTN.y * uOut);
float tAng = atan(vTP.z, vTP.x) * uOut;
vec2 tCirc = vec2(cos(tAng), sin(tAng));
float tR = length(vTP.xz);
float tBand = clamp((tR - uBand.x) / (uBand.y - uBand.x), 0.0, 1.0);
vec3 tMeters = vTP * vTS;
float tRm = tR * vTS.x;
float tAx = tMeters.y;
float tEdge = smoothstep(0.62, 0.98, abs(vTP.y));
float tAA = 1.0 - smoothstep(0.35, 0.9, length(fwidth(tMeters * 700.0)));

// Banda de rodagem: riscos finos no sentido da volta, manchas de borracha e pó nos ombros.
float tStreak = tFbm(vec3(tCirc * 2.3, tAx * 150.0));
float tBlotch = tFbm(vec3(tCirc * 4.0, tAx * 20.0 + 3.0));
float tGrain = tNoise(tMeters * 900.0) * tAA;
float tHeightTread = tStreak * 0.55 + tGrain * 0.25;
vec3 tTread = vec3(0.034, 0.034, 0.038);
tTread = mix(tTread, vec3(0.085, 0.082, 0.08), smoothstep(0.45, 0.8, tBlotch) * (0.35 + 0.65 * tEdge));
tTread += vec3(0.07, 0.066, 0.06) * tEdge * (0.4 + tStreak);
tTread *= 0.8 + 0.4 * tStreak;

// Parede lateral: costelas do molde, pó de freio junto ao aro e poeira da pista no ombro.
float tRib = sin(tRm * 1570.8 + tNoise(vec3(tCirc * 3.0, tRm * 30.0)) * 2.0);
tRib *= 1.0 - smoothstep(0.2, 0.7, fwidth(tRm * 250.0));
float tDust = tFbm(vec3(tCirc * 3.0, tBand * 6.0));
vec3 tWall = vec3(0.034, 0.034, 0.037) * (0.85 + 0.3 * tDust);
tWall = mix(tWall, vec3(0.09, 0.077, 0.068), smoothstep(0.34, 0.0, tBand) * (0.4 + 0.6 * tDust));
tWall = mix(tWall, vec3(0.075, 0.073, 0.072), smoothstep(0.82, 1.0, tBand) * 0.6);
tWall *= 1.0 + 0.1 * tRib * smoothstep(0.1, 0.4, tBand);

// Inscrições em volta do aro, na face de fora, desgastadas.
float tMid = (uBand.x + ${TEXT_BAND} * (uBand.y - uBand.x)) * vTS.x;
vec2 tUv = vec2(tAng / 6.2831853 + 0.5, 0.5 + (tRm - tMid) / (${DECAL_SPAN.toFixed(5)} * tMid));
vec4 tDecal = texture2D(uDecal, tUv);
float tWear = 0.7 + 0.3 * tFbm(vec3(tCirc * 12.0, tRm * 60.0));
float tInk = tDecal.a * tOutward * tSide * tWear;
tWall = mix(tWall, tDecal.rgb * (0.7 + 0.3 * tWear), tInk);

float tHeightWall = tRib * 0.35 * smoothstep(0.1, 0.4, tBand) + tDust * 0.2 + tInk * 1.4;
float tHeight = mix(tHeightTread, tHeightWall, tSide);
diffuseColor.rgb = mix(tTread, tWall, tSide);
`;

/**
 * Material de um pneu. `band` é o raio interno e externo (espaço do objeto) da parede lateral e `out`
 * vale 1 quando o eixo +y do pneu aponta para fora do carro, e -1 quando aponta para dentro.
 */
export function tireMaterial({ band, out = 1 }) {
  const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, metalness: 0 });
  material.customProgramCacheKey = () => "beta-car-tire-1";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBand = { value: new THREE.Vector2(band[0], band[1]) };
    shader.uniforms.uOut = { value: out };
    shader.uniforms.uDecal = { value: tireDecalTexture() };
    shader.vertexShader = `varying vec3 vTP;\nvarying vec3 vTN;\nvarying vec3 vTS;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vTP = position;
      vTN = normal;
      vTS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));`,
    );
    shader.fragmentShader = `uniform vec2 uBand;
uniform float uOut;
uniform sampler2D uDecal;
varying vec3 vTP;
varying vec3 vTN;
varying vec3 vTS;
${NOISE}
${shader.fragmentShader}`
      .replace("#include <color_fragment>", COLOR)
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        // A banda é macia e fosca com manchas mais lisas; as letras têm um brilho leve de tinta.
        roughnessFactor = mix(0.74 + 0.2 * tBlotch, 0.97 - 0.06 * tDust, tSide);
        roughnessFactor = mix(roughnessFactor, 0.55, tInk * 0.6);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        normal = tPerturb(-vViewPosition, normal, vec2(dFdx(tHeight), dFdy(tHeight)) * 0.9, faceDirection);`,
      );
  };
  return material;
}

/** Raios interno e externo, no espaço do objeto, de uma geometria de pneu com o eixo em y. */
export function tireBand(geometry) {
  const position = geometry.attributes.position;
  let inner = Infinity;
  let outer = 0;
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getZ(i));
    inner = Math.min(inner, r);
    outer = Math.max(outer, r);
  }
  return [inner, outer];
}
