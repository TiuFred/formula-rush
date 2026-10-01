import { clamp } from "./mathUtils.js";

/** Velocidade (m/s) em que cada marcha atinge o limite de giro. Índice = marcha. */
const UPSHIFT_SPEEDS = [0, 19.5, 30.5, 41.5, 52.5, 63.5, 75, 86.5, 97];
const GEAR_FORCE = [0, 13.3, 12.5, 11.5, 10.5, 9.6, 8.8, 8, 7.2];

export const GEAR_COUNT = 8;
export const TRANSMISSIONS = ["auto", "manual"];

/** Giro (0–1) mínimo mostrado com o motor ligado, e faixa em que as luzes de troca acendem. */
const IDLE_RPM = 0.22;
const SHIFT_LIGHTS_FROM = 0.72;
/** Manual: abaixo desse giro o câmbio reduz sozinho (anti-morte do motor). */
const ANTI_STALL_RPM = 0.12;
/** Manual: a redução é recusada se o motor passaria deste giro (proteção contra sobregiro). */
const DOWNSHIFT_MAX_RPM = 1.06;

const AUTO_SHIFT_CUT = 0.055;
const MANUAL_SHIFT_CUT = 0.09;

export function gearTopSpeed(gear) {
  return UPSHIFT_SPEEDS[clamp(Math.round(gear), 1, GEAR_COUNT)];
}

export function betaGearAtSpeed(speed) {
  for (let gear = 1; gear < GEAR_COUNT; gear++) {
    if (speed < UPSHIFT_SPEEDS[gear]) return gear;
  }
  return GEAR_COUNT;
}

/** Giro do motor (0–1) para uma marcha e velocidade: proporcional à velocidade, como num câmbio real. */
export function rpmAt(gear, speed) {
  return clamp(Math.max(0, speed) / gearTopSpeed(gear), 0, 1);
}

/** Texto da marcha na HUD: o automático mostra N parado; o manual sempre mostra a marcha engatada. */
export function displayGear(car) {
  const speed = Math.max(0, Number.isFinite(car.speed) ? car.speed : 0);
  const gear = clamp(car.betaGear || betaGearAtSpeed(speed), 1, GEAR_COUNT);
  return !car.betaManual && speed < 0.5 ? "N" : gear;
}

export function betaPowertrainTelemetry(car) {
  const speed = Math.max(0, car.speed || 0);
  const gear = car.betaGear || betaGearAtSpeed(speed);
  const rpm = clamp(Math.max(IDLE_RPM, rpmAt(gear, speed)), 0, 1);
  return {
    gear,
    label: displayGear(car),
    manual: Boolean(car.betaManual),
    rpm,
    // Luzes de troca: só a parte alta do giro, para avisar a hora de subir a marcha.
    shift: clamp((rpm - SHIFT_LIGHTS_FROM) / (1 - SHIFT_LIGHTS_FROM), 0, 1),
    denied: (car.betaShiftDenied || 0) > 0,
    throttle: clamp(car.betaThrottle || 0, 0, 1),
  };
}

/** Pedido de troca (+1 sobe, −1 desce) vindo do teclado/toque; consumido por `updateBetaPowertrain`. */
export function queueGearShift(car, direction) {
  if (!car) return;
  car.betaShiftQueue = clamp((car.betaShiftQueue || 0) + Math.sign(direction), -2, 2);
}

function shiftCut(car, seconds) {
  car.betaShiftTimer = Math.max(car.betaShiftTimer || 0, seconds);
}

/** Troca por pedido do jogador (câmbio manual). Devolve a nova marcha. */
function manualShift(car, gear) {
  const request = Math.sign(car.betaShiftQueue || 0);
  car.betaShiftQueue = (car.betaShiftQueue || 0) - request;
  if (request > 0 && gear < GEAR_COUNT) {
    shiftCut(car, MANUAL_SHIFT_CUT);
    return gear + 1;
  }
  if (request < 0 && gear > 1) {
    if (car.speed <= UPSHIFT_SPEEDS[gear - 1] * DOWNSHIFT_MAX_RPM) {
      shiftCut(car, MANUAL_SHIFT_CUT);
      return gear - 1;
    }
    car.betaShiftDenied = 0.45;
  }
  // Anti-stall: quase parado numa marcha alta, o câmbio desce sozinho.
  if (gear > 1 && car.speed < UPSHIFT_SPEEDS[gear] * ANTI_STALL_RPM) {
    shiftCut(car, AUTO_SHIFT_CUT);
    return gear - 1;
  }
  return gear;
}

/** Modelo longitudinal exclusivo da 2.0. Valores são em m/s e m/s². */
export function updateBetaPowertrain(car, input, dt) {
  const manual = input.transmission === "manual";
  const throttleTarget = input.throttle && !input.brake ? 1 : 0;
  const throttleRate = throttleTarget ? 5.2 : 8;
  car.betaThrottle = clamp(
    (car.betaThrottle || 0) + clamp(throttleTarget - (car.betaThrottle || 0), -throttleRate * dt, throttleRate * dt),
    0,
    1,
  );

  const currentGear = clamp(car.betaGear || betaGearAtSpeed(car.speed), 1, GEAR_COUNT);
  let nextGear = currentGear;
  if (manual) {
    nextGear = manualShift(car, currentGear);
  } else {
    car.betaShiftQueue = 0;
    // Voltando do manual: reencontra a marcha certa para a velocidade em vez de subir/descer degrau a degrau.
    if (car.betaManual) nextGear = betaGearAtSpeed(car.speed);
    else if (currentGear < GEAR_COUNT && car.speed >= UPSHIFT_SPEEDS[currentGear] + 0.2) nextGear++;
    else if (currentGear > 1 && car.speed < UPSHIFT_SPEEDS[currentGear - 1] - 2.8) nextGear--;
    if (car.betaGear && nextGear !== car.betaGear) shiftCut(car, AUTO_SHIFT_CUT);
  }
  car.betaManual = manual;
  car.betaGear = nextGear;
  car.betaShiftTimer = Math.max(0, (car.betaShiftTimer || 0) - dt);
  car.betaShiftDenied = Math.max(0, (car.betaShiftDenied || 0) - dt);

  const rpm = rpmAt(nextGear, car.speed);
  let torqueCurve;
  if (manual) {
    // Embreagem patina na saída; marcha longa demais em baixa rotação perde força.
    const slipping = nextGear <= 2 && car.speed < 10;
    const effective = Math.max(rpm, slipping ? 0.5 : IDLE_RPM);
    const lugging = effective < 0.3 ? 0.4 + (0.6 * effective) / 0.3 : 1;
    torqueCurve = (0.78 + Math.sin(effective * Math.PI) * 0.22) * lugging;
  } else {
    const low = UPSHIFT_SPEEDS[nextGear - 1];
    const high = UPSHIFT_SPEEDS[nextGear];
    const sawtooth = clamp((car.speed - low) / Math.max(1, high - low), 0, 1);
    torqueCurve = 0.78 + Math.sin(sawtooth * Math.PI) * 0.22;
  }
  // Limitador de giro: no manual, a marcha corta o motor em vez de passar do limite.
  const limiter = manual && nextGear < GEAR_COUNT
    ? clamp((UPSHIFT_SPEEDS[nextGear] + 0.6 - car.speed) / 1.2, 0, 1)
    : 1;
  const shiftTorque = car.betaShiftTimer > 0 ? 0.28 : 1;
  let acceleration = car.betaThrottle * GEAR_FORCE[nextGear] * torqueCurve * shiftTorque * limiter;
  acceleration -= 0.34 + car.speed * car.speed * 0.00061;
  // Freio-motor: sem acelerar, marcha curta segura mais o carro (só no manual).
  if (manual && !input.throttle && !input.brake) acceleration -= rpm * 3.2;
  acceleration -= input.grade * 9.81;
  if (input.brake) acceleration -= 31 + car.speed * 0.13;
  if (!input.onTrack) acceleration -= 5 + car.speed * 0.48;
  if (input.stunned) acceleration -= 20;
  if (input.drs) acceleration += 1.15;

  const speedCap = input.underYellow ? 46 : input.drs ? 97 : 94.5;
  car.speed = clamp(car.speed + acceleration * dt, 0, speedCap);
  car.betaAcceleration = acceleration;
  return { acceleration, speedCap, ...betaPowertrainTelemetry(car) };
}
