// Time limits must match src/game/missions.ts.
export const LEVEL_TIME = {
  l01: 90,
  l02: 75,
  l03: 80,
  l04: 90,
  l05: 90,
  l06: 70,
  l07: 100,
  l08: 40,
  l09: 90,
  l10: 90,
  l11: 120,
  l12: 90,
  l13: 110,
  l14: 90,
  l15: 50,
  l16: 100,
  l17: 100,
  l18: 100,
  l19: 120,
  l20: 110,
  l21: 120,
  l22: 120,
  l23: 60,
  l24: 120,
  l25: 90,
};

export function isLevelId(id) {
  return Object.prototype.hasOwnProperty.call(LEVEL_TIME, id);
}
