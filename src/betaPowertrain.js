import { clamp } from "./mathUtils.js";

const UPSHIFT_SPEEDS = [0, 19.5, 30.5, 41.5, 52.5, 63.5, 75, 86.5, 97];
const GEAR_FORCE = [0, 13.3, 12.5, 11.5, 10.5, 9.6, 8.8, 8, 7.2];

export function betaGearAtSpeed(speed) {
  for (let gear = 1; gear < 8; gear++) {
    if (speed < UPSHIFT_SPEEDS[gear]) return gear;
  }
  return 8;
}

export function betaPowertrainTelemetry(car) {
  const speed = Math.max(0, car.speed || 0);
  const gear = car.betaGear || betaGearAtSpeed(speed);
  const low = UPSHIFT_SPEEDS[gear - 1];
  const high = UPSHIFT_SPEEDS[gear];
  return {
    gear,
    rpm: clamp((speed - low) / Math.max(1, high - low), 0, 1),
    throttle: clamp(car.betaThrottle || 0, 0, 1),
  };
}

/** Modelo longitudinal exclusivo da 2.0. Valores são em m/s e m/s². */
export function updateBetaPowertrain(car, input, dt) {
  const throttleTarget = input.throttle && !input.brake ? 1 : 0;
  const throttleRate = throttleTarget ? 5.2 : 8;
  car.betaThrottle = clamp(
    (car.betaThrottle || 0) + clamp(throttleTarget - (car.betaThrottle || 0), -throttleRate * dt, throttleRate * dt),
    0,
    1,
  );

  const currentGear = clamp(car.betaGear || betaGearAtSpeed(car.speed), 1, 8);
  let nextGear = currentGear;
  if (currentGear < 8 && car.speed >= UPSHIFT_SPEEDS[currentGear] + .2) nextGear++;
  else if (currentGear > 1 && car.speed < UPSHIFT_SPEEDS[currentGear - 1] - 2.8) nextGear--;
  if (car.betaGear && nextGear !== car.betaGear) car.betaShiftTimer = 0.055;
  car.betaGear = nextGear;
  car.betaShiftTimer = Math.max(0, (car.betaShiftTimer || 0) - dt);

  const { rpm } = betaPowertrainTelemetry(car);
  const torqueCurve = 0.78 + Math.sin(rpm * Math.PI) * 0.22;
  const shiftTorque = car.betaShiftTimer > 0 ? 0.28 : 1;
  let acceleration = car.betaThrottle * GEAR_FORCE[nextGear] * torqueCurve * shiftTorque;
  acceleration -= 0.34 + car.speed * car.speed * 0.00061;
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
