import { WorldState } from '../game/useWorld';
import { ChunkMesh } from './ChunkMesh';

interface WorldProps {
  world: WorldState;
  night: boolean;
}

export function World({ world, night }: WorldProps) {
  // Render ONLY the active window. Chunks outside it are not in world.chunks,
  // so React unmounts their ChunkMesh (which disposes its GPU resources).
  const chunkEntries = Array.from(world.chunks.entries()).map(([key, blocks]) => {
    const [cx, cz] = key.split(',').map(Number);
    return { key, cx, cz, blocks, rev: world.getRevision(cx, cz) };
  });

  return (
    <group>
      {chunkEntries.map(({ key, cx, cz, blocks, rev }) => (
        <ChunkMesh
          // Keying on the mesh revision forces a fresh mount (and disposal of
          // the old geometry) when an edit changes this chunk's geometry.
          key={`${key}:${rev}`}
          chunkX={cx}
          chunkZ={cz}
          blocks={blocks}
          // Passing the world lookup lets the mesher cull faces and bake
          // ambient occlusion across chunk seams instead of stopping at the
          // chunk edge, which otherwise leaves bright unshaded borders.
          getBlock={world.getBlock}
          night={night}
        />
      ))}
    </group>
  );
}
