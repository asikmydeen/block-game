import * as THREE from 'three';

export type CarKind = 'sedan' | 'sports' | 'truck';

export interface CarSpec {
  name: string;
  maxSpeed: number;
  accel: number;
  maxHealth: number;
  turnRate: number;
}

export const CAR_SPECS: Record<CarKind, CarSpec> = {
  sedan: { name: 'Sedan', maxSpeed: 11, accel: 8, maxHealth: 10, turnRate: 1.9 },
  sports: { name: 'Sports Car', maxSpeed: 17, accel: 13, maxHealth: 8, turnRate: 2.3 },
  truck: { name: 'Truck', maxSpeed: 8, accel: 6, maxHealth: 16, turnRate: 1.5 },
};

export interface CarInfo {
  kind: CarKind;
  health: number;
  maxHealth: number;
  speed: number;
  broken: boolean;
}

// Shared flag so the Player component knows when to hand control to the car
export const drivingState = { active: false, justExited: false };

export interface CarsRegistry {
  toggleDrive: ((playerPos: THREE.Vector3) => 'entered' | 'exited' | 'occupied' | null) | null;
  repairNear: ((playerPos: THREE.Vector3) => { kind: CarKind; health: number; maxHealth: number; wasBroken: boolean } | null) | null;
  hitCar: ((origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, damage: number) => THREE.Vector3 | null) | null;
}

export const carsRegistry: CarsRegistry = {
  toggleDrive: null,
  repairNear: null,
  hitCar: null,
};
