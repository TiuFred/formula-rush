import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildBetaCockpit,
  cockpitTelemetry,
  cockpitWall,
  renderBetaMirrors,
  updateBetaCockpit,
} from "../src/betaCockpit.js";
import { makeCarbonMaterial } from "../src/betaSurfaceMaterials.js";
import { GRIP_ANCHOR, HAND_FIT, HAND_SCALE } from "../src/betaWheel.js";
import { buildBetaCar } from "../src/betaCar.js";
import { DARK_RULES } from "../src/betaCarModel.js";
import { ONBOARD_FOV, updateOnboardCamera } from "../src/onboardCamera.js";

function installCanvasMock() {
  const previousDocument = globalThis.document;
  const context = new Proxy({}, {
    get(target, key) {
      if (key === "createLinearGradient") return () => ({ addColorStop() {} });
      return key in target ? target[key] : () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  };
  return () => {
    globalThis.document = previousDocument;
  };
}

test("cockpit uses the 2.0 powertrain telemetry", () => {
  assert.equal(cockpitTelemetry({ speed: 0 }, 0).gear, "N");
  assert.equal(cockpitTelemetry({ speed: .49 }, 0).gear, "N");
  assert.equal(cockpitTelemetry({ speed: .5 }, 0).gear, 1);
  assert.equal(cockpitTelemetry({ speed: 43 / 3.6 }, 0).gear, 1);
  assert.equal(cockpitTelemetry({ speed: 25, betaGear: 2, betaThrottle: .7 }, 0).gear, 2);
  const fast = cockpitTelemetry({ speed: 120 }, 0);
  assert.equal(fast.gear, 8);
  assert.equal(fast.speed, 432);
  assert.equal(fast.shift, 1);
  assert.equal(cockpitTelemetry({ speed: NaN }, 0).speed, 0);
});

test("cockpit distinguishes live, finished and invalid laps", () => {
  const car = { speed: 30, lapStarted: 25, drsActive: true };
  assert.equal(cockpitTelemetry(car, 65).lap, 40);
  assert.equal(cockpitTelemetry(car, 65).status, "DRS ATIVO");
  assert.equal(cockpitTelemetry({ ...car, currentLapValid: false }, 65).status, "VOLTA INVALIDA");
  assert.equal(cockpitTelemetry({ ...car, finish: true, lastLap: 82.34 }, 200).lap, 82.34);
  assert.equal(cockpitTelemetry(car, 0).lap, 0);
});

test("driver arms remain connected to the steering wheel at full lock", () => {
  const restoreDocument = installCanvasMock();
  try {
    const parent = new THREE.Group();
    const cockpit = buildBetaCockpit(
      parent,
      makeCarbonMaterial(),
      new THREE.MeshStandardMaterial({ color: "#d22b25" }),
    );
    const car = {
      group: parent,
      speed: 50,
      steer: 1,
      betaAcceleration: 0,
      betaGear: 5,
      betaThrottle: 1,
      currentLapValid: true,
    };
    for (let i = 0; i < 60; i++)
      updateBetaCockpit(car, i / 60, i / 60, 1 / 60);
    parent.updateMatrixWorld(true);

    for (const arm of cockpit.arms) {
      assert.ok(arm.mesh.scale.y < 0.8, `antebraço virou uma viga (${arm.mesh.scale.y} m)`);
      // O pulso do braço é o centro do punho da luva e o ponto de pegada cai na empunhadura.
      const armEnd = new THREE.Vector3(0, 0.5, 0).applyMatrix4(arm.mesh.matrixWorld);
      assert.ok(armEnd.distanceTo(arm.wrist) < 1e-9);
      const gripPoint = new THREE.Vector3(
        arm.side * (GRIP_ANCHOR.x + HAND_FIT.post.x),
        GRIP_ANCHOR.y + HAND_FIT.post.y,
        GRIP_ANCHOR.z + HAND_FIT.post.z,
      ).multiply(cockpit.wheel.scale).applyEuler(cockpit.wheel.rotation).add(cockpit.wheel.position);
      const glove = parent.getObjectByName(`beta-glove-back-${arm.side < 0 ? "left" : "right"}`).getWorldPosition(new THREE.Vector3());
      assert.ok(glove.distanceTo(gripPoint) < 0.12, `luva longe da empunhadura (${glove.distanceTo(gripPoint)} m)`);
    }
  } finally {
    restoreDocument();
  }
});

test("onboard frame contains body sides, connected wheel and complete halo", () => {
  const restoreDocument = installCanvasMock();
  try {
    const group = new THREE.Group();
    buildBetaCar(
      group,
      new THREE.MeshPhysicalMaterial({ color: "#d22b25" }),
      [],
    );
    const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9, 0.025, 100);
    updateOnboardCamera(camera, { group, speed: 0 });
    group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    for (const name of [
      "beta-cockpit-shell-left",
      "beta-cockpit-shell-right",
      "beta-center-body",
      "beta-mirror-left",
      "beta-mirror-right",
      "beta-halo-crown",
    ]) {
      const object = group.getObjectByName(name);
      assert.ok(object, `${name} ausente`);
      assert.ok(frustum.intersectsBox(new THREE.Box3().setFromObject(object)), `${name} fora do enquadramento`);
    }

    const required = [
      "beta-steering-wheel",
      "beta-steering-column",
      "beta-steering-hub",
      "beta-halo-pillar",
    ];
    for (const name of required) {
      const object = group.getObjectByName(name);
      assert.ok(object, `${name} ausente`);
      const center = new THREE.Box3()
        .setFromObject(object)
        .getCenter(new THREE.Vector3())
        .project(camera);
      assert.ok(Math.abs(center.x) <= 1 && Math.abs(center.y) <= 1, `${name} fora do enquadramento`);
    }

    const hidden = new Set(group.userData.hideOnboard);
    assert.equal(hidden.has(group.getObjectByName("beta-center-body")), false);
    const columnBox = new THREE.Box3().setFromObject(group.getObjectByName("beta-steering-column"));
    const hubBox = new THREE.Box3().setFromObject(group.getObjectByName("beta-steering-hub"));
    assert.ok(columnBox.intersectsBox(hubBox), "coluna não alcança o cubo do volante");
    const crownBox = new THREE.Box3().setFromObject(group.getObjectByName("beta-halo-crown"));
    const pillarBox = new THREE.Box3().setFromObject(group.getObjectByName("beta-halo-pillar"));
    assert.ok(crownBox.intersectsBox(pillarBox), "pilar não alcança o aro do halo");
  } finally {
    restoreDocument();
  }
});

test("superfícies do cockpit têm normais voltadas para fora (sem autossombra)", () => {
  const restoreDocument = installCanvasMock();
  try {
    const group = new THREE.Group();
    buildBetaCockpit(group, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    for (const name of [
      "beta-cockpit-shell-left",
      "beta-cockpit-shell-right",
      "beta-center-body",
      "beta-halo-crown",
      "beta-halo-pillar",
    ]) {
      const { position, normal } = group.getObjectByName(name).geometry.attributes;
      let top = 0;
      for (let i = 1; i < position.count; i++) if (position.getY(i) > position.getY(top)) top = i;
      assert.ok(normal.getY(top) > 0.3, `${name} com normais invertidas (y=${normal.getY(top)})`);
    }
  } finally {
    restoreDocument();
  }
});

test("retrovisores renderizam a vista traseira refletida e restauram o estado", () => {
  const restoreDocument = installCanvasMock();
  try {
    const group = new THREE.Group();
    buildBetaCockpit(group, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    const scene = new THREE.Scene();
    scene.add(group);
    const eye = new THREE.PerspectiveCamera();
    eye.position.set(0, 1.3, -0.22);
    const renders = [];
    const previous = { id: "tela" };
    let current = previous;
    const renderer = {
      shadowMap: { autoUpdate: true },
      getRenderTarget: () => current,
      setRenderTarget: (target) => { current = target; },
      render: (_scene, camera) => {
        assert.equal(renderer.shadowMap.autoUpdate, false, "mapa de sombras recalculado");
        renders.push(camera.getWorldDirection(new THREE.Vector3()));
      },
    };
    let rendered = 0;
    for (let i = 0; i < 4; i++) {
      renderBetaMirrors(renderer, scene, eye, { group });
      rendered = renders.length;
    }
    assert.equal(rendered, 4, "deve renderizar os dois espelhos a cada dois quadros");
    for (const direction of renders) assert.ok(direction.z < -0.5, "espelho não olha para trás");
    assert.ok(renders.some((d) => d.x > 0.05) && renders.some((d) => d.x < -0.05), "espelhos não divergem");
    assert.equal(current, previous, "alvo de render não restaurado");
    assert.equal(renderer.shadowMap.autoUpdate, true);
    for (const mirror of group.getObjectByName("beta-mirror-left").parent.children) {
      if (mirror.name.endsWith("-glass")) assert.equal(mirror.visible, true);
    }
  } finally {
    restoreDocument();
  }
});

test("braços: cotovelo respeita o comprimento dos ossos e o pulso fica preso à luva em todo o esterço", () => {
  const restoreDocument = installCanvasMock();
  try {
    const parent = new THREE.Group();
    const cockpit = buildBetaCockpit(parent, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    const car = { group: parent, speed: 40, steer: 0, betaAcceleration: 0, betaGear: 4, betaThrottle: 1, currentLapValid: true };
    for (const steer of [-1, -0.5, 0, 0.5, 1]) {
      car.steer = steer;
      for (let i = 0; i < 90; i++) updateBetaCockpit(car, i / 60, i / 60, 1 / 60);
      parent.updateMatrixWorld(true);
      for (const arm of cockpit.arms) {
        const wrist = new THREE.Vector3(0, 0.5, 0).applyMatrix4(arm.mesh.matrixWorld);
        const upper = arm.shoulder.distanceTo(arm.elbow);
        const fore = arm.elbow.distanceTo(wrist);
        assert.ok(Math.abs(upper - 0.34) < 1e-6, `braço mudou de tamanho (${upper})`);
        assert.ok(Math.abs(fore - 0.34) < 0.02, `antebraço mudou de tamanho (${fore})`);
        assert.ok(arm.elbow.y < arm.shoulder.y + 0.05, "cotovelo deveria cair, não subir");
        assert.ok(Math.sign(arm.elbow.x) === arm.side || Math.abs(arm.elbow.x) < 0.05, "cotovelo do lado errado");
      }
    }
    for (const side of ["left", "right"]) {
      assert.ok(parent.getObjectByName(`beta-glove-back-${side}`), "dorso da luva ausente");
      assert.ok(parent.getObjectByName(`beta-glove-thumb-${side}`), "polegar ausente");
      for (let finger = 0; finger < 4; finger++) assert.ok(parent.getObjectByName(`beta-glove-finger-${side}-${finger}`), `dedo ${finger} ausente`);
    }
  } finally {
    restoreDocument();
  }
});

test("luva articulada: dorso, punho, quatro dedos e polegar, espelhada na mão direita", () => {
  const restoreDocument = installCanvasMock();
  try {
    const parent = new THREE.Group();
    const cockpit = buildBetaCockpit(parent, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    parent.updateMatrixWorld(true);
    for (const side of ["left", "right"]) {
      for (const part of ["back", "wrist", "thumb"]) assert.ok(parent.getObjectByName(`beta-glove-${part}-${side}`), `${part} da luva ${side} ausente`);
      const fingers = [0, 1, 2, 3].map((i) => parent.getObjectByName(`beta-glove-finger-${side}-${i}`));
      // Os dedos se enrolam: cada um tem volume nos três eixos (não é uma placa) e cabe numa mão.
      for (const finger of fingers) {
        const size = new THREE.Box3().setFromObject(finger).getSize(new THREE.Vector3());
        assert.ok(Math.min(size.x, size.y, size.z) > 0.015, `dedo achatado (${size.toArray()})`);
        assert.ok(size.length() > 0.04 && size.length() < 0.2 * HAND_SCALE, `dedo com tamanho irreal (${size.length()} m)`);
      }
      // O indicador (topo) fica acima do mindinho, com a mesma ordem nas duas mãos.
      const topOf = (mesh) => new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).y;
      assert.ok(topOf(fingers[0]) > topOf(fingers[3]), "ordem dos dedos invertida");
    }
    const mirror = (name) => parent.getObjectByName(`beta-hand-${name}`).getObjectByName("beta-hand-mirror");
    // A luva é modelada para um lado e a do outro é o espelho.
    assert.ok(mirror("left").scale.x < 0 && mirror("right").scale.x > 0);
    assert.ok(Math.abs(Math.abs(mirror("left").scale.x) - mirror("right").scale.x) < 1e-9);
    // O pulso do braço coincide com o centro do punho da luva.
    for (const arm of cockpit.arms) {
      const socket = parent.getObjectByName(`beta-glove-wrist-${arm.side < 0 ? "left" : "right"}`).getWorldPosition(new THREE.Vector3());
      const wrist = new THREE.Vector3(0, 0.5, 0).applyMatrix4(arm.mesh.matrixWorld);
      assert.ok(socket.distanceTo(wrist) < 0.03, `punho da luva a ${socket.distanceTo(wrist)} m do antebraço`);
    }
  } finally {
    restoreDocument();
  }
});

test("halo fino e alto: o pilar central é estreito no quadro e o aro frontal fica acima da linha do olho", () => {
  const restoreDocument = installCanvasMock();
  try {
    const group = new THREE.Group();
    buildBetaCar(group, new THREE.MeshPhysicalMaterial({ color: "#d22b25" }), []);
    const camera = new THREE.PerspectiveCamera(ONBOARD_FOV, 16 / 9, 0.025, 100);
    updateOnboardCamera(camera, { group, speed: 0 });
    group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const ndc = (name) => {
      const box = new THREE.Box3().setFromObject(group.getObjectByName(name));
      return { box, center: box.getCenter(new THREE.Vector3()).project(camera) };
    };
    const pillar = ndc("beta-halo-pillar").box;
    assert.ok(pillar.max.x - pillar.min.x < 0.075, `pilar largo demais (${pillar.max.x - pillar.min.x} m)`);
    // Os arcos laterais saem do campo de visão horizontal: só o centro fica no quadro.
    const crown = group.getObjectByName("beta-halo-crown");
    const sideMax = Math.max(...Array.from({ length: crown.geometry.attributes.position.count }, (_, i) => Math.abs(crown.geometry.attributes.position.getX(i))));
    assert.ok(sideMax > 0.5, "arcos laterais deveriam ficar bem afastados do piloto");
    const eye = camera.position.clone().sub(group.position);
    const crownFront = new THREE.Box3().setFromObject(crown).max;
    assert.ok(crownFront.y - eye.y > 0.2, "aro do halo muito baixo: fecha a visão");
  } finally {
    restoreDocument();
  }
});

test("carbono em volta do cockpit: o topo interno dos sidepods escurece só ao lado do piloto", () => {
  const rule = DARK_RULES.Cube009;
  assert.equal(rule(0.2, 0.55, 0.8), 1, "topo interno ao lado do piloto deveria ser carbono");
  assert.equal(rule(0.8, 0.55, 0.8), 0, "ombro externo mantém a pintura clara");
  assert.equal(rule(0.2, 0.2, 0.8), 0, "fundo do sidepod não escurece");
  assert.equal(rule(0.2, 0.55, 2.4), 0, "entrada de ar à frente mantém a pintura");
  assert.equal(rule(0.2, 0.55, -0.6), 0, "traseira do carro mantém a pintura");
  // Transição linear: valores intermediários, não um degrau.
  assert.ok(rule(0.5, 0.55, 0.8) > 0 && rule(0.5, 0.55, 0.8) < 1);
});

test("braços não atravessam a parede do cockpit em nenhum ponto do esterço", () => {
  const restoreDocument = installCanvasMock();
  try {
    const parent = new THREE.Group();
    const cockpit = buildBetaCockpit(parent, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    const car = { group: parent, speed: 40, steer: 0, betaAcceleration: 0, betaGear: 4, betaThrottle: 1, currentLapValid: true };
    for (const steer of [-1, -0.7, -0.3, 0, 0.3, 0.7, 1]) {
      car.steer = steer;
      for (let i = 0; i < 120; i++) updateBetaCockpit(car, i / 60, i / 60, 1 / 60);
      for (const arm of cockpit.arms) {
        for (const [from, to, radius] of [[arm.shoulder, arm.elbow, 0.055], [arm.elbow, arm.wrist, 0.046]]) {
          for (let k = 1; k <= 8; k++) {
            const point = from.clone().lerp(to, k / 8);
            const wall = cockpitWall(point.z);
            if (point.y - radius * 0.4 > wall.top) continue;
            const depth = Math.abs(point.x) + radius - wall.x;
            assert.ok(depth < 0.035, `braço ${arm.side} invade a parede em ${depth.toFixed(3)} m (esterço ${steer})`);
            if (Math.abs(point.x) < wall.x) {
              const sunk = wall.floor - (point.y - radius);
              assert.ok(sunk < 0.02, `braço ${arm.side} afunda ${sunk.toFixed(3)} m no piso (esterço ${steer})`);
            }
          }
        }
      }
    }
  } finally {
    restoreDocument();
  }
});

test("as luvas encostam na empunhadura sem entrar na borracha", () => {
  const restoreDocument = installCanvasMock();
  try {
    const parent = new THREE.Group();
    const cockpit = buildBetaCockpit(parent, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    const car = { group: parent, speed: 40, steer: 0, betaAcceleration: 0, betaGear: 4, betaThrottle: 1, currentLapValid: true };
    for (let i = 0; i < 30; i++) updateBetaCockpit(car, i / 60, i / 60, 1 / 60);
    parent.updateMatrixWorld(true);
    for (const side of ["left", "right"]) {
      // O volante nomeia as empunhaduras pelo lado do desenho; a mão de cada lado segura a oposta.
      const grip = parent.getObjectByName(`beta-wheel-grip-${side === "left" ? "right" : "left"}`);
      const probe = new THREE.Mesh(grip.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      const toGrip = new THREE.Matrix4().copy(grip.matrixWorld).invert();
      const box = new THREE.Box3().setFromObject(grip);
      let inside = 0;
      let total = 0;
      const point = new THREE.Vector3();
      parent.getObjectByName(`beta-hand-${side}`).traverse((mesh) => {
        if (!mesh.isMesh) return;
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i += 3) {
          total++;
          point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          if (!box.containsPoint(point)) continue;
          const local = point.clone().applyMatrix4(toGrip);
          if (new THREE.Raycaster(local, new THREE.Vector3(0, 0, 1), 0, 5).intersectObject(probe).length % 2 === 1) inside++;
        }
      });
      assert.ok(inside / total < 0.02, `luva ${side} com ${((inside / total) * 100).toFixed(1)}% dos vértices dentro da empunhadura`);
    }
    assert.ok(cockpit.arms.length === 2);
  } finally {
    restoreDocument();
  }
});

test("a luva gira com o volante: o encaixe na empunhadura não muda em nenhum esterço", () => {
  const restoreDocument = installCanvasMock();
  try {
    const parent = new THREE.Group();
    const cockpit = buildBetaCockpit(parent, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    const car = { group: parent, speed: 40, steer: 0, betaAcceleration: 0, betaGear: 4, betaThrottle: 1, currentLapValid: true };
    const inWheel = (steer) => {
      car.steer = steer;
      for (let i = 0; i < 90; i++) updateBetaCockpit(car, i / 60, i / 60, 1 / 60);
      parent.updateMatrixWorld(true);
      cockpit.wheel.updateMatrixWorld(true);
      const toWheel = new THREE.Matrix4().copy(cockpit.wheel.matrixWorld).invert();
      return ["left", "right"].map((side) => {
        const finger = parent.getObjectByName(`beta-glove-finger-${side}-1`);
        const box = new THREE.Box3().setFromObject(finger);
        return box.getCenter(new THREE.Vector3()).applyMatrix4(toWheel);
      });
    };
    const rest = inWheel(0);
    for (const steer of [-1, -0.5, 0.5, 1]) {
      inWheel(steer).forEach((point, i) => assert.ok(point.distanceTo(rest[i]) < 0.004, `luva escorregou ${point.distanceTo(rest[i])} m na empunhadura (esterço ${steer})`));
    }
  } finally {
    restoreDocument();
  }
});

test("os dedos envolvem a empunhadura: encostam e não entram, em qualquer esterço", () => {
  const restoreDocument = installCanvasMock();
  try {
    const parent = new THREE.Group();
    const cockpit = buildBetaCockpit(parent, makeCarbonMaterial(), new THREE.MeshStandardMaterial({ color: "#d22b25" }));
    const car = { group: parent, speed: 40, steer: 0, betaAcceleration: 0, betaGear: 4, betaThrottle: 1, currentLapValid: true };
    for (const steer of [-1, 0, 1]) {
      car.steer = steer;
      for (let i = 0; i < 90; i++) updateBetaCockpit(car, i / 60, i / 60, 1 / 60);
      parent.updateMatrixWorld(true);
      for (const side of ["left", "right"]) {
        const grip = parent.getObjectByName(`beta-wheel-grip-${side === "left" ? "right" : "left"}`);
        const triangles = [];
        const gp = grip.geometry.attributes.position;
        const gi = grip.geometry.index;
        const count = gi ? gi.count : gp.count;
        for (let i = 0; i < count; i += 3) {
          triangles.push(new THREE.Triangle(...[0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(gp, gi ? gi.getX(i + k) : i + k).applyMatrix4(grip.matrixWorld))));
        }
        const probe = new THREE.Mesh(grip.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        const toGrip = new THREE.Matrix4().copy(grip.matrixWorld).invert();
        const point = new THREE.Vector3();
        const closest = new THREE.Vector3();
        let touching = 0;
        for (let finger = 0; finger < 5; finger++) {
          const mesh = parent.getObjectByName(finger < 4 ? `beta-glove-finger-${side}-${finger}` : `beta-glove-thumb-${side}`);
          const position = mesh.geometry.attributes.position;
          let nearest = Infinity;
          for (let i = 0; i < position.count; i += 2) {
            point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
            for (const triangle of triangles) {
              triangle.closestPointToPoint(point, closest);
              nearest = Math.min(nearest, closest.distanceTo(point));
            }
            const local = point.clone().applyMatrix4(toGrip);
            const hits = new THREE.Raycaster(local, new THREE.Vector3(0, 0, 1), 0, 5).intersectObject(probe).length;
            assert.ok(hits % 2 === 0 || nearest < 0.004, `dedo ${finger} da mão ${side} entra na empunhadura (esterço ${steer})`);
          }
          if (nearest < 0.008) touching++;
        }
        assert.ok(touching >= 3, `só ${touching} dedos encostam na empunhadura da mão ${side} (esterço ${steer})`);
      }
    }
    assert.equal(cockpit.arms.length, 2);
  } finally {
    restoreDocument();
  }
});
