// Item drops: physical items that fall to the ground and can be picked up
import * as THREE from "three";
import { World, CHUNK_SIZE } from "./world";
import { BlockType, BLOCKS, isSolid } from "./blocks";
import { ItemType, ITEMS } from "./items";
import { TextureAtlas } from "./atlas";

export interface DroppedItem {
  id: number; // BlockType or ItemType
  count: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mesh: THREE.Mesh | null;
  pickupDelay: number; // seconds before it can be picked up
  lifetime: number; // seconds alive
}

export class DropManager {
  drops: DroppedItem[] = [];
  scene: THREE.Scene;
  world: World;
  atlas: TextureAtlas;

  constructor(scene: THREE.Scene, world: World, atlas: TextureAtlas) {
    this.scene = scene;
    this.world = world;
    this.atlas = atlas;
  }

  // Spawn a dropped item at a position with a small random velocity
  spawnDrop(id: number, count: number, x: number, y: number, z: number) {
    const drop: DroppedItem = {
      id,
      count,
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        4 + Math.random() * 2, // pop up
        (Math.random() - 0.5) * 2
      ),
      mesh: null,
      pickupDelay: 0.5, // can't pick up for 0.5s
      lifetime: 0,
    };

    // Create mesh
    let mesh: THREE.Mesh;
    if (id < 100) {
      // Block: small 3D cube
      const def = BLOCKS[id as BlockType];
      if (!def) return;
      const mat = new THREE.MeshLambertMaterial({ map: this.atlas.texture });
      const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const tile = this.atlas.tiles[def.textures.side] || this.atlas.tiles[def.textures.top];
      if (tile) {
        const uvs = geo.attributes.uv;
        const topTile = this.atlas.tiles[def.textures.top];
        const bottomTile = this.atlas.tiles[def.textures.bottom];
        const faces = [tile, tile, topTile || tile, bottomTile || tile, tile, tile];
        for (let f = 0; f < 6; f++) {
          const base = f * 4;
          uvs.setXY(base + 0, faces[f].u0, faces[f].v1);
          uvs.setXY(base + 1, faces[f].u1, faces[f].v1);
          uvs.setXY(base + 2, faces[f].u0, faces[f].v0);
          uvs.setXY(base + 3, faces[f].u1, faces[f].v0);
        }
        uvs.needsUpdate = true;
      }
      mesh = new THREE.Mesh(geo, mat);
    } else {
      // Item: flat plane
      const def = ITEMS[id as ItemType];
      if (!def) return;
      const tile = this.atlas.tiles[def.icon];
      const mat = new THREE.MeshLambertMaterial({
        map: this.atlas.texture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide,
      });
      const geo = new THREE.PlaneGeometry(0.3, 0.3);
      if (tile) {
        const uvs = geo.attributes.uv;
        uvs.setXY(0, tile.u0, tile.v1);
        uvs.setXY(1, tile.u1, tile.v1);
        uvs.setXY(2, tile.u0, tile.v0);
        uvs.setXY(3, tile.u1, tile.v0);
        uvs.needsUpdate = true;
      }
      mesh = new THREE.Mesh(geo, mat);
    }

    mesh.position.copy(drop.position);
    this.scene.add(mesh);
    drop.mesh = mesh;
    this.drops.push(drop);
  }

  update(dt: number, playerX: number, playerY: number, playerZ: number): { id: number; count: number }[] {
    const pickedUp: { id: number; count: number }[] = [];

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.lifetime += dt;
      drop.pickupDelay -= dt;

      // Physics: gravity
      drop.velocity.y -= 20 * dt;

      // Move X
      const oldX = drop.position.x;
      drop.position.x += drop.velocity.x * dt;
      drop.velocity.x *= 0.9; // friction
      if (this.checkSolidAt(drop.position.x, drop.position.y, drop.position.z)) {
        drop.position.x = oldX;
        drop.velocity.x = 0;
      }

      // Move Z
      const oldZ = drop.position.z;
      drop.position.z += drop.velocity.z * dt;
      drop.velocity.z *= 0.9;
      if (this.checkSolidAt(drop.position.x, drop.position.y, drop.position.z)) {
        drop.position.z = oldZ;
        drop.velocity.z = 0;
      }

      // Move Y
      drop.position.y += drop.velocity.y * dt;
      // Ground collision
      if (this.checkSolidAt(drop.position.x, drop.position.y - 0.15, drop.position.z)) {
        drop.position.y = Math.floor(drop.position.y) + 1;
        drop.velocity.y = 0;
        // Small bounce
        if (drop.velocity.y < -1) drop.velocity.y = 1;
      }

      // Update mesh position
      if (drop.mesh) {
        drop.mesh.position.copy(drop.position);
        // Rotate slowly for visual effect
        drop.mesh.rotation.y += dt * 2;
        // Bob up and down when on ground
        if (drop.velocity.y === 0) {
          drop.mesh.position.y += Math.sin(drop.lifetime * 3) * 0.05;
        }
      }

      // Check pickup
      if (drop.pickupDelay <= 0) {
        const dist = Math.sqrt(
          (drop.position.x - playerX) ** 2 +
          (drop.position.y - playerY) ** 2 +
          (drop.position.z - playerZ) ** 2
        );
        if (dist < 1.5) {
          // Pick up
          pickedUp.push({ id: drop.id, count: drop.count });
          // Remove mesh
          if (drop.mesh) {
            this.scene.remove(drop.mesh);
            drop.mesh.geometry.dispose();
            (drop.mesh.material as THREE.Material).dispose();
          }
          this.drops.splice(i, 1);
          continue;
        }
      }

      // Despawn after 5 minutes (300 seconds)
      if (drop.lifetime > 300) {
        if (drop.mesh) {
          this.scene.remove(drop.mesh);
          drop.mesh.geometry.dispose();
          (drop.mesh.material as THREE.Material).dispose();
        }
        this.drops.splice(i, 1);
      }
    }

    return pickedUp;
  }

  private checkSolidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  dispose() {
    for (const drop of this.drops) {
      if (drop.mesh) {
        this.scene.remove(drop.mesh);
        drop.mesh.geometry.dispose();
        (drop.mesh.material as THREE.Material).dispose();
      }
    }
    this.drops = [];
  }
}
