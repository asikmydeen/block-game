// Time limits must match src/game/missions.ts.
export const LEVEL_TIME = {
  l01: 60,
  l02: 75,
  l03: 90,
  l04: 80,
  l05: 90,
  l06: 80,
  l07: 70,
  l08: 40,
  l09: 100,
  l10: 90,
  l11: 110,
  l12: 90,
  l13: 90,
  l14: 85,
  l15: 50,
  l16: 80,
  l17: 100,
  l18: 90,
  l19: 70,
  l20: 110,
  l21: 100,
  l22: 120,
  l23: 60,
  l24: 120,
  l25: 90,
};

export function isLevelId(id) {
  return Object.prototype.hasOwnProperty.call(LEVEL_TIME, id);
}
