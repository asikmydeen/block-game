// Gameplay multipliers read by Player/combat/cars/zombies each frame.
// These used to be modified by the removed "secret numbers" powers feature;
// they are now fixed at their neutral baseline values but kept as a single
// tuning point for game balance.
export const powerState = {
  speedMult: 1,
  jumpMult: 1,
  gravityMult: 1,
  damageMult: 1,
  damageTakenMult: 1,
  fastRegen: false,
  reachMult: 1,
  carSpeedMult: 1,
  carDamageTakenMult: 1,
  fullRepair: false,
  doubleJump: false,
  zombieSpeedMult: 1,
  critChance: 0,
  maxHealth: 10,
  lootLuck: false,
  rangeMult: 1,
  zombieDetectMult: 1,
};
