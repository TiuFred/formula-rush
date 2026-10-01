import test from "node:test";
import assert from "node:assert/strict";

// Precisa existir antes do primeiro uso: o resultado é lido uma vez e guardado.
globalThis.matchMedia = () => ({ matches: true });

const THREE = await import("three");
const { ONBOARD_EYE, ONBOARD_FOV, updateOnboardCamera } = await import("../src/onboardCamera.js");
const { prefersReducedMotion } = await import("../src/accessibility.js");

test("com prefers-reduced-motion a câmera quase não balança nem abre o FOV", () => {
  assert.equal(prefersReducedMotion(), true);
  const group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9);
  const car = { group, speed: 94, steer: 1, betaAcceleration: -40, cameraShake: 1, edgeRumble: 1 };
  let peak = 0;
  for (let i = 0; i < 300; i++) {
    updateOnboardCamera(camera, car, 1 / 60, i / 60);
    const eye = camera.position.clone().applyQuaternion(group.quaternion.clone().invert());
    peak = Math.max(peak, eye.distanceTo(ONBOARD_EYE));
  }
  assert.ok(peak < 0.02, `deslocamento ${peak} m é grande demais para movimento reduzido`);
  assert.ok(camera.fov - ONBOARD_FOV < 1, "FOV não deveria abrir mais de 1°");
});
