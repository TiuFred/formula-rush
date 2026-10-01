/**
 * Resolução dinâmica: se a média de quadros ficar lenta, reduz o pixel ratio em
 * degraus; se sobrar folga por vários intervalos seguidos, sobe de volta até o
 * máximo do dispositivo. Janelas com travadas isoladas (troca de aba, pausa) são
 * ignoradas.
 */
export function createAdaptiveResolution({ max, min = 0.6, windowFrames = 90, slow = 1 / 48, fast = 1 / 72 }) {
  let ratio = max;
  let frames = 0;
  let total = 0;
  let spike = false;
  let calmWindows = 0;
  return {
    get ratio() {
      return ratio;
    },
    /** Soma um quadro; devolve o novo pixel ratio quando ele muda, senão `null`. */
    update(dt) {
      if (dt > 0.2) spike = true;
      frames++;
      total += dt;
      if (frames < windowFrames) return null;
      const average = total / frames;
      const ignored = spike;
      frames = 0;
      total = 0;
      spike = false;
      if (ignored) return null;
      const before = ratio;
      if (average > slow) {
        calmWindows = 0;
        ratio = Math.max(min, ratio - 0.125);
      } else if (average < fast && ratio < max) {
        calmWindows++;
        if (calmWindows >= 3) {
          calmWindows = 0;
          ratio = Math.min(max, ratio + 0.0625);
        }
      } else {
        calmWindows = 0;
      }
      return ratio === before ? null : ratio;
    },
  };
}
