import { state } from "./state.js";

/**
 * Valores que diferem entre a versão clássica (1.0) e a 2.0, reunidos num só
 * lugar: scene.js e camera.js leem daqui em vez de espalhar `graphicsBeta ?`.
 * Os valores da 1.0 que variam por tema de circuito (céu, névoa) continuam em
 * scene.js; aqui ficam só os que a 2.0 fixa.
 */

const CAMERA = {
  classic: {
    chaseDistance: -11.8,
    chaseHeight: 5.3,
    chaseLookHeight: 1.1,
    chaseLerp: 8,
    chaseBaseFov: 63,
    cockpitForward: 0.45,
    cockpitHeight: 1.32,
    speedFovGain: { chase: 0, cockpit: 0 },
    speedFovMax: { chase: 0, cockpit: 0 },
  },
  beta: {
    chaseDistance: -8.9,
    chaseHeight: 3.35,
    chaseLookHeight: 0.65,
    chaseLerp: 16,
    chaseBaseFov: 60,
    cockpitForward: 0.14,
    cockpitHeight: 1.55,
    speedFovGain: { chase: 0.1, cockpit: 0.045 },
    speedFovMax: { chase: 11, cockpit: 5 },
  },
};

const LOOK = { classic: { cockpit: 1.2 }, beta: { cockpit: 1.2 } };

const SCENE = {
  classic: {
    terrainSegments: 74,
    hemisphereGround: "#556c39",
    sunColor: "#fff2d1",
    exposure: (night) => (night ? 0.95 : 1.15),
    hemisphereIntensity: (night) => (night ? 0.55 : 2.6),
    sunIntensity: (night) => (night ? 0.4 : 2.5),
  },
  beta: {
    terrainSegments: 132,
    hemisphereGround: "#5a6650",
    sunColor: "#fff0d1",
    exposure: () => 0.9,
    hemisphereIntensity: () => 0.62,
    sunIntensity: () => 2.85,
  },
};

/** Perfil de câmera do modo atual. */
export function cameraProfile(beta = state.graphicsBeta) {
  const key = beta ? "beta" : "classic";
  return { ...CAMERA[key], cockpitLookHeight: LOOK[key].cockpit };
}

/** Perfil de cena/iluminação do modo atual. */
export function sceneProfile(beta = state.graphicsBeta) {
  return SCENE[beta ? "beta" : "classic"];
}
