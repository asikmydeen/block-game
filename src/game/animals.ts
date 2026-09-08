import * as THREE from 'three';

// Shared state for riding animals — mirrors the drivingState/carsRegistry
// pattern used for cars, so the Player component can hand over control.

export type RideableKind = 'pig' | 'chicken' | 'deer';

export interface RideSpec {
  name: string;
  maxSpeed: number;
  turnRate: number;
  camDist: number;
  saddleY: number;
}

// saddleY is where the rider's HIPS sit (just above the animal's back).
export const RIDE_SPECS: Record<RideableKind, RideSpec> = {
  pig: { name: 'Pig', maxSpeed: 5, turnRate: 2.5, camDist: 5, saddleY: 0.84 },
  chicken: { name: 'Chicken', maxSpeed: 7, turnRate: 3.5, camDist: 4.5, saddleY: 0.63 },
  deer: { name: 'Deer', maxSpeed: 11, turnRate: 2.8, camDist: 6, saddleY: 1.14 },
};

// Player relinquishes movement/camera control while riding.
export const ridingState = { active: false, justExited: false };

// Set by the Player when attacking from animal-back so the rider avatar
// swings its arm (the first-person viewmodel is hidden while mounted).
export const riderCombat = { swingTimer: 0 };

export interface AnimalsRegistry {
  toggleRide: ((playerPos: THREE.Vector3) => 'mounted' | 'dismounted' | null) | null;
}

export const animalsRegistry: AnimalsRegistry = {
  toggleRide: null,
};
