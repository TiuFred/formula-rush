/** Não altera os timers dos itens: desligar a opção preserva o turbo normal. */
export function alwaysTurboEnabled(settings) {
  return settings.alwaysTurbo === true && !settings.graphicsBeta;
}

export function playerTurboSettings(car, settings, throttle) {
  const permanent = alwaysTurboEnabled(settings);
  return {
    accelerating: car.boost > 0 || (permanent && Boolean(throttle)),
    speedCap: car.underYellow ? 46 : car.boost > 0 || permanent ? 108 : car.drsActive ? 90 : 84,
  };
}
