// Event infrastructure. Locations are staged approximations, not surveyed buildings.
import * as THREE from "three";
import { state } from "./state.js";
import { addBox, addMesh, makeMaterial, makeTextPanel } from "./materials.js";
import { alignedFootprintClearanceAt, trackHalfWidthAt } from "./track.js";
import { INTERLAGOS_STANDS } from "./interlagosReal.js";
import { detailSurface } from "./betaSurfaceMaterials.js";

export function planInterlagosVenue(track) {
  const items = [];
  for (const sector of INTERLAGOS_STANDS) {
    for (let s = sector.start + 36; s < sector.end - 12; s += 90) {
      const lane = trackHalfWidthAt(s) + 12 + sector.rows * .82 + 3 + 13;
      const item = { kind: "concourse", sector: sector.id, s, lane, width: 12, depth: 16 };
      if (alignedFootprintClearanceAt(track, s, lane, item.width, item.depth) >= 8) items.push(item);
    }
  }
  // Screens face the spectators from the infield. Avoid the pit building entirely.
  for (const [s, lane] of [[-510, -48], [690, -48], [1100, -48]]) {
    const item = { kind: "screen", s, lane, width: 5, depth: 13 };
    if (alignedFootprintClearanceAt(track, s, lane, item.width, item.depth) >= 12) items.push(item);
  }
  return items;
}

export function buildInterlagosVenue(groundHeightAt) {
  const steel = makeMaterial("#747c7b", { metalness: .65, roughness: .45 });
  const white = makeMaterial("#e6e2d5", { roughness: .85 });
  const green = makeMaterial("#245648", { roughness: .8 });
  const asphalt = detailSurface(makeMaterial("#797a70", { roughness: 1 }), "road");
  const black = makeMaterial("#202829", { roughness: .7 });
  const screen = makeMaterial("#224b50", { emissive: "#37626c", emissiveIntensity: .3 });
  const line = makeMaterial("#b2d3b9", { emissive: "#718d76", emissiveIntensity: .25 });
  for (const item of planInterlagosVenue(state.track)) {
    const frame = state.track.at(item.s, item.lane);
    const root = new THREE.Group();
    root.name = `interlagos-${item.kind}`;
    root.position.copy(frame.p);
    root.position.y = groundHeightAt(frame.p.x, frame.p.z) + .25;
    root.rotation.y = frame.yaw;
    root.userData.venueFootprint = item;
    state.scene.add(root);
    if (item.kind === "concourse") {
      addBox(12, .2, 16, asphalt, 0, -.25, 0, root);
      // A concession kiosk under a four-sided marquee.
      addBox(4.6, 2.5, 6, white, 1.5, 1.1, 0, root);
      addBox(.08, 1.1, 4.8, black, 3.83, 1.45, 0, root);
      addBox(1, .1, 5, green, 4.1, .98, 0, root);
      const canopy = addMesh(new THREE.ConeGeometry(4.8, 2, 4), white, 1.5, 3.35, 0, root);
      canopy.rotation.y = Math.PI / 4;
      for (const z of [-3, 3]) addBox(.08, 3, .08, steel, 4.5, 1.4, z, root);
      // Low queue barriers and a clear pedestrian circulation strip.
      for (const z of [5.15, 6.85]) {
        addBox(5.9, .055, .055, steel, -2.95, 1, z, root);
        for (const x of [-5.5, -3, -.5]) addBox(.05, 1.1, .05, steel, x, .45, z, root);
      }
      addBox(.16, 15, .16, steel, -4, 7, -6, root);
      addBox(.5, .3, 2.3, black, -4, 14.5, -6, root);
      for (const z of [-6.7, -6, -5.3]) addBox(.1, .22, .5, white, -3.72, 14.5, z, root);
    } else {
      for (const z of [-4.6, 4.6]) {
        addBox(1.8, .6, 2, asphalt, 0, -.1, z, root);
        addBox(.25, 11, .25, steel, 0, 5.3, z, root);
        addBox(.25, 11, .25, steel, -1.6, 5.3, z, root);
        for (let y = 1; y < 10; y += 1.5) {
          const brace = addBox(2.2, .06, .06, steel, -.8, y, z, root);
          brace.rotation.z = .7;
        }
      }
      addBox(.55, 6.2, 11.6, black, 0, 10, 0, root);
      addBox(.03, 5.5, 10.8, screen, -.3, 10, 0, root);
      // A static venue information display; no extra scene render per screen.
      const title = makeTextPanel("INTERLAGOS", 9.8, 1.1, "#18393f", "#f0efdf");
      title.rotation.y = -Math.PI / 2;
      title.position.set(-.33, 11.7, 0);
      root.add(title);
      for (let row = 0; row < 4; row++) {
        addBox(.04, .16, 6.8 - row * .8, line, -.34, 10.3 - row * .62, .7, root);
        addBox(.04, .3, .45, white, -.34, 10.3 - row * .62, -4, root);
      }
    }
  }
}

/** Keep vegetation out of spectator structures, service areas and the paddock. */
export function interlagosVegetationBlocked(s, lane, length) {
  const station = ((s % length) + length) % length;
  const nearStation = (a, b) => [station, station - length].some(value => value >= a && value <= b);
  if (lane < 0 && lane > -90 && nearStation(-85, 430)) return true;
  return lane > 0 && INTERLAGOS_STANDS.some(stand =>
    nearStation(stand.start - 20, stand.end + 20) &&
    lane < trackHalfWidthAt(s) + 12 + stand.rows * .82 + 35);
}
