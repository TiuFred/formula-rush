import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * Gradação final da 2.0, aplicada depois do OutputPass (já em sRGB): saturação e
 * contraste para tirar o aspecto lavado, vinheta suave, aberração cromática
 * discreta nas bordas e um desfoque radial que só aparece em alta velocidade.
 * O centro da imagem (ponto de fuga da pista) permanece nítido.
 */
const GradeShader = {
  name: "BetaGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.14 },
    uContrast: { value: 1.07 },
    uVignette: { value: 0.3 },
    uSpeed: { value: 0 },
    uAspect: { value: 16 / 9 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uSharpen: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uSpeed;
    uniform float uAspect;
    uniform vec2 uTexel;
    uniform float uSharpen;
    varying vec2 vUv;

    float dither(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      centered.x *= uAspect;
      float radius = length(centered);

      // Desfoque radial e aberração crescem com a distância do centro.
      vec2 direction = (vUv - 0.5);
      float edge = smoothstep(0.18, 0.95, radius);
      float blur = uSpeed * uSpeed * 0.013 * edge;
      float split = (0.0004 + uSpeed * 0.0012) * edge;
      vec3 color = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < 6; i++) {
        float t = float(i) / 5.0;
        vec2 uv = vUv - direction * blur * t;
        vec3 tap = vec3(
          texture2D(tDiffuse, uv - direction * split).r,
          texture2D(tDiffuse, uv).g,
          texture2D(tDiffuse, uv + direction * split).b
        );
        float w = 1.0 - t * 0.55;
        color += tap * w;
        total += w;
      }
      color /= total;

      // Nitidez: realça o que o MSAA e o bloom suavizam, sem halos fortes.
      vec3 around = (
        texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb +
        texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb +
        texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb +
        texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb
      ) * 0.25;
      color += clamp(color - around, -0.12, 0.12) * uSharpen;

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      color = (color - 0.5) * uContrast + 0.5;
      float vignette = smoothstep(1.05, 0.25, radius);
      color *= mix(1.0 - uVignette, 1.0, vignette);
      // Ruído mínimo quebra as faixas de degradê do céu (banding).
      color += (dither(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }`,
};

export function createBetaGradePass() {
  return new ShaderPass(GradeShader);
}

/** `speed` em m/s; `aspect` = largura/altura da tela; `width`/`height` = pixels reais do buffer. */
export function updateBetaGrade(pass, speed, aspect, width = 1280, height = 720) {
  pass.uniforms.uTexel.value.set(1 / width, 1 / height);
  pass.uniforms.uSpeed.value = THREE.MathUtils.clamp((speed - 35) / 60, 0, 1);
  pass.uniforms.uAspect.value = aspect;
}
