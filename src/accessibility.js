let query;

/** `true` se o sistema pede menos movimento (prefers-reduced-motion). Seguro fora do navegador. */
export function prefersReducedMotion() {
  if (query === undefined) query = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  return query ? query.matches : false;
}
