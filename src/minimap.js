// Desenha o contorno da pista em um <canvas> 2D simples (sem three.js).
// Usado tanto para o mapa estático da barra lateral do menu (`live=false`)
// quanto para o minimapa dinâmico durante a corrida (`live=true`, também
// desenha a posição de cada carro).
//
// Otimização: o contorno da pista (2100+ pontos em Interlagos, quase 2900
// em Monza) é rotacionado/projetado e convertido para um Path2D UMA VEZ por
// circuito, não a cada chamada — o minimapa dinâmico é redesenhado ~11x por
// segundo durante a corrida, então recalcular ~2-3 mil pontos a cada chamada
// (como a versão anterior fazia) desperdiçava CPU em ambas as pistas, mais
// ainda em Monza por ser mais longa. O cache é por <canvas> (o mapa estático
// e o minimapa dinâmico usam canvases diferentes) e invalidado sozinho
// quando o circuito muda (novo objeto `state.track`) ou o canvas muda de
// tamanho.

import { state } from "./state.js";

/** Rotaciona um ponto (x,z) por ~60° para uma orientação de mapa mais legível. */
function rotateForMap(point) {
  const x = point.x * Math.cos(1.05) - point.z * Math.sin(1.05);
  const y = point.x * Math.sin(1.05) + point.z * Math.cos(1.05);
  return { x, y };
}

/** Cache do contorno pré-calculado, por elemento <canvas>. */
const outlineCache = new WeakMap();

/** (Re)calcula e cacheia o Path2D do contorno da pista para este canvas. */
function getOutline(canvas, w, h) {
  const cached = outlineCache.get(canvas);
  if (cached && cached.track === state.track && cached.w === w && cached.h === h) {
    return cached;
  }

  const rotated = state.track.samples.map(rotateForMap);
  const minX = Math.min(...rotated.map((p) => p.x));
  const maxX = Math.max(...rotated.map((p) => p.x));
  const minY = Math.min(...rotated.map((p) => p.y));
  const maxY = Math.max(...rotated.map((p) => p.y));
  const scale = Math.min((w - 38) / (maxX - minX), (h - 30) / (maxY - minY));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const project = (p) => ({ x: w / 2 + (p.x - centerX) * scale, y: h / 2 + (p.y - centerY) * scale });

  const path = new Path2D();
  let startPoint = null;
  rotated.forEach((p, i) => {
    const proj = project(p);
    if (i === 0) {
      path.moveTo(proj.x, proj.y);
      startPoint = proj;
    } else {
      path.lineTo(proj.x, proj.y);
    }
  });
  path.closePath();

  const result = { track: state.track, w, h, path, startPoint, project };
  outlineCache.set(canvas, result);
  return result;
}

export function drawTrackMap(canvas, live) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const outline = getOutline(canvas, w, h);

  ctx.lineWidth = live ? 6 : 5;
  ctx.strokeStyle = live ? "#9bad9d" : "#d6f565";
  ctx.lineJoin = "round";
  ctx.stroke(outline.path);

  // Marcador da linha de largada/chegada.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(outline.startPoint.x - 4, outline.startPoint.y - 4, 8, 8);

  if (live) {
    // Desenha por último (por cima) o carro do jogador, iterando em ordem
    // inversa da lista de pilotos.
    for (const driver of [...state.drivers].reverse()) {
      const point = outline.project(rotateForMap(driver.group.position));
      const isPlayer = driver === state.player;
      ctx.beginPath();
      ctx.arc(point.x, point.y, isPlayer ? 6 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isPlayer ? "#e2ff58" : driver.color;
      ctx.fill();
      if (isPlayer) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#18201b";
        ctx.stroke();
      }
    }
  }
}
