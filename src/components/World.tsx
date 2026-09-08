import { WorldState } from '../game/useWorld';
import { ChunkMesh } from './ChunkMesh';

interface WorldProps {
  world: WorldState;
}

export function World({ world }: WorldProps) {
  const chunkEntries = Array.from(world.chunks.entries()).map(([key, blocks]) => {
    const [cx, cz] = key.split(',').map(Number);
    return { key, cx, cz, blocks };
  });

  return (
    <group>
      {chunkEntries.map(({ key, cx, cz, blocks }) => (
        <ChunkMesh
          key={key}
          chunkX={cx}
          chunkZ={cz}
          blocks={blocks}
        />
      ))}
    </group>
  );
}
