/**
 * Dinâmica de direção compartilhada entre a física do jogador (player.js) e o
 * guia de pilotagem da 2.0 (betaGuide.js). Fica num único lugar para o guia
 * nunca divergir do que o carro realmente consegue fazer.
 */

/** Taxa máxima de guinada (rad/s) do carro a `speed` m/s com o volante todo esterçado. */
export function maxYawRate(speed) {
  return (0.2 + 0.98 / (1 + speed / 48)) * Math.min(speed / 11, 1);
}
