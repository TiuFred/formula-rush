import { state } from "./state.js";
import { requestGearShift, togglePause } from "./input.js";
import { clamp } from "./mathUtils.js";

/**
 * Gamepad (mapeamento "standard"): o analógico esquerdo esterça de forma
 * contínua; RT/A aceleram, LT/B freiam, LB/RB trocam de marcha (câmbio manual
 * da 2.0), X volta ao centro e Start pausa. O teclado continua funcionando.
 */

export const DEADZONE = 0.12;
const BTN = { A: 0, B: 1, X: 2, LB: 4, RB: 5, LT: 6, RT: 7, START: 9 };

/** Zona morta radial com curva suave: pequenos desvios não esterçam, o fundo do curso dá −1/+1. */
export function steerCurve(axis, deadzone = DEADZONE) {
  const value = Number.isFinite(axis) ? axis : 0;
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  const scaled = clamp((magnitude - deadzone) / (1 - deadzone), 0, 1);
  return Math.sign(value) * scaled ** 1.4;
}

const pressed = (pad, index) => Boolean(pad.buttons[index]?.pressed) || (pad.buttons[index]?.value ?? 0) > 0.5;

/** Converte um gamepad em comandos do jogo. O eixo X positivo é para a direita; o jogo usa +1 = esquerda. */
export function readGamepad(pad) {
  if (!pad?.connected) return null;
  return {
    steer: -steerCurve(pad.axes[0]),
    throttle: pressed(pad, BTN.RT) || pressed(pad, BTN.A),
    brake: pressed(pad, BTN.LT) || pressed(pad, BTN.B),
    shiftUp: pressed(pad, BTN.RB),
    shiftDown: pressed(pad, BTN.LB),
    recover: pressed(pad, BTN.X),
    pause: pressed(pad, BTN.START),
  };
}

const previous = { shiftUp: false, shiftDown: false, pause: false };
let active = false;

/** Chamar uma vez por quadro. Sem gamepad conectado, não interfere no teclado. */
export function pollGamepad(getPads = () => globalThis.navigator?.getGamepads?.() ?? []) {
  const pad = [...getPads()].find((candidate) => candidate?.connected);
  const input = readGamepad(pad);
  if (!input) {
    if (active) {
      active = false;
      state.analogSteer = null;
      state.keys.GamepadUp = state.keys.GamepadDown = false;
    }
    return;
  }
  active = true;
  state.analogSteer = input.steer;
  // O físico lê o mesmo mapa de teclas; teclas "virtuais" evitam brigar com o teclado real.
  state.keys.GamepadUp = input.throttle;
  state.keys.GamepadDown = input.brake;
  if (input.shiftUp && !previous.shiftUp) requestGearShift(1);
  if (input.shiftDown && !previous.shiftDown) requestGearShift(-1);
  if (input.pause && !previous.pause && ["race", "countdown", "paused"].includes(state.gameState)) togglePause();
  previous.shiftUp = input.shiftUp;
  previous.shiftDown = input.shiftDown;
  previous.pause = input.pause;
}
