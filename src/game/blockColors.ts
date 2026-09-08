import { BlockType } from './terrain';

export const BLOCK_COLORS: Record<BlockType, string> = {
  air: 'transparent',
  grass: '#5D8A3C',
  dirt: '#8B6340',
  stone: '#808080',
  sand: '#C2B280',
  wood: '#7D5A2A',
  leaves: '#2D7A2D',
  water: '#1A6EA8',
  snow: '#E8E8FF',
  coal: '#2A2A2A',
  iron: '#C87137',
  bedrock: '#1A1A1A',
  glass: '#A8D8E8',
  metal: '#B0B8C0',
  concrete: '#D8D5CE',
  neon: '#39FFCB',
  chest: '#8B6914',
  door: '#5C3317',
  bed: '#C84040',
  road: '#3A3A3E',
};

export const BLOCK_TOP_COLORS: Record<BlockType, string> = {
  air: 'transparent',
  grass: '#4CAF50',
  dirt: '#8B6340',
  stone: '#909090',
  sand: '#D4C490',
  wood: '#8B6914',
  leaves: '#3D8B3D',
  water: '#2196F3',
  snow: '#FFFFFF',
  coal: '#333333',
  iron: '#D4844A',
  bedrock: '#222222',
  glass: '#BFE3F0',
  metal: '#C8D0D8',
  concrete: '#E5E2DC',
  neon: '#5BFFE0',
  chest: '#D4AF37',
  door: '#7A4520',
  bed: '#F5F0E8',
  road: '#46464A',
};

export const BLOCK_EMISSIVE: Partial<Record<BlockType, string>> = {
  water: '#0A3D6E',
  neon: '#1FFFB0',
};

export const BLOCK_OPACITY: Partial<Record<BlockType, number>> = {
  water: 0.7,
  leaves: 0.9,
  glass: 0.35,
};

export const BLOCK_NAMES: Record<BlockType, string> = {
  air: 'Air',
  grass: 'Grass',
  dirt: 'Dirt',
  stone: 'Stone',
  sand: 'Sand',
  wood: 'Wood',
  leaves: 'Leaves',
  water: 'Water',
  snow: 'Snow',
  coal: 'Coal Ore',
  iron: 'Iron Ore',
  bedrock: 'Bedrock',
  glass: 'Glass',
  metal: 'Metal',
  concrete: 'Concrete',
  neon: 'Neon',
  chest: 'Chest',
  door: 'Door',
  bed: 'Bed',
  road: 'Road',
};

export const TRANSPARENT_BLOCKS: Set<BlockType> = new Set(['water', 'glass']);

export const PLACEABLE_BLOCKS: BlockType[] = [
  'dirt', 'stone', 'wood', 'glass', 'concrete', 'metal', 'neon', 'leaves', 'door',
];

export const INTERACTIVE_BLOCKS: Set<BlockType> = new Set<BlockType>(['chest', 'door', 'bed']);
