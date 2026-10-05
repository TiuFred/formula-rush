// Configurações exclusivas da 2.0. Nada altera os perfis físicos da 1.0.
import { INTERLAGOS_STANDS, INTERLAGOS_CONTINUOUS_SPONSOR_ZONES, INTERLAGOS_HOARDING_STATIONS } from "./interlagosReal.js";
import { INDIANAPOLIS_SCENERY } from "./indianapolisScenery.js";

export const BETA_SCENERY = {
  interlagos: {
    stands: INTERLAGOS_STANDS,
    brakingStations: [255, 1085, 2215, 2920, 3655],
    cameraStations: [420, 1340, 2460, 3480],
    fences: [{
      from: Math.min(-700, ...INTERLAGOS_STANDS.map((stand) => stand.start - 20)),
      to: Math.max(470, ...INTERLAGOS_STANDS.map((stand) => stand.end + 20)),
      sides: [-1, 1],
    }],
    continuousSponsorZones: INTERLAGOS_CONTINUOUS_SPONSOR_ZONES,
    hoardingStations: INTERLAGOS_HOARDING_STATIONS,
    house: "interlagos",
  },
  indianapolis: INDIANAPOLIS_SCENERY,
};
