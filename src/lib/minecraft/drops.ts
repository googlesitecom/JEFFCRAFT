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
  isXp: boolean; // true if this is an XP orb (id holds the xp amount)
}

export class DropManager {
  drops: DroppedItem[] = [];
  scene: THREE.Scene;
  world: World;
  atlas: TextureAtlas;
  // Shared green orb material/mesh for XP orbs
  private xpOrbGeometry: THREE.SphereGeometry;
  private xpOrbMaterials: Map<number, THREE.MeshBasicMaterial> = new Map();

  constructor(scene: THREE.Scene, world: World, atlas: TextureAtlas) {
    this.scene = scene;
    this.world = world;
    this.atlas = atlas;
    this.xpOrbGeometry = new THREE.SphereGeometry(0.16, 8, 8);
  }

  private getXpOrbMaterial(amount: number): THREE.MeshBasicMaterial {
    // Larger orbs = brighter green, like Minecraft (small/large XP orbs)
    let key = 1;
    if (amount >= 10) key = 3;
    else if (amount >= 5) key = 2;
    let mat = this.xpOrbMaterials.get(key);
    if (!mat) {
      const colors: Record<number, number> = {
        1: 0x90ff60, // small: light green
        2: 0x60e040, // medium: green
        3: 0x30c020, // large: dark green
      };
      mat = new THREE.MeshBasicMaterial({ color: colors[key] || 0x90ff60 });
      this.xpOrbMaterials.set(key, mat);
    }
    return mat;
  }

  // Spawn an XP orb at a position with a small random velocity
  spawnXpOrb(amount: number, x: number, y: number, z: number) {
    if (amount <= 0) return;
    const drop: DroppedItem = {
      id: amount, // for XP orbs, id stores the xp amount
      count: 1,
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        4 + Math.random() * 2,
        (Math.random() - 0.5) * 2
      ),
      mesh: null,
      pickupDelay: 0.4,
      lifetime: 0,
      isXp: true,
    };

    const mesh = new THREE.Mesh(this.xpOrbGeometry, this.getXpOrbMaterial(amount));
    mesh.position.copy(drop.position);
    this.scene.add(mesh);
    drop.mesh = mesh;
    this.drops.push(drop);
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
      isXp: false,
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

  update(dt: number, playerX: number, playerY: number, playerZ: number): { id: number; count: number; isXp: boolean }[] {
    const pickedUp: { id: number; count: number; isXp: boolean }[] = [];

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.lifetime += dt;
      drop.pickupDelay -= dt;

      // Distance to player (used for XP magnetism + pickup)
      const dx = playerX - drop.position.x;
      const dy = playerY - drop.position.y;
      const dz = playerZ - drop.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(distSq);

      // XP orbs magnetize toward the player when within ~6 blocks (like Minecraft)
      if (drop.isXp && drop.pickupDelay <= 0 && dist < 6 && dist > 0.001) {
        const pull = 8.0 * dt; // acceleration toward player
        // Stronger pull when closer so it actually reaches the player
        const strength = 1.0 + (1.0 - dist / 6.0) * 2.0;
        drop.velocity.x += (dx / dist) * pull * strength;
        drop.velocity.y += (dy / dist) * pull * strength;
        drop.velocity.z += (dz / dist) * pull * strength;
        // Slight damping so it doesn't oscillate
        drop.velocity.multiplyScalar(0.92);
      } else {
        // Physics: gravity (regular items only)
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
      }

      // Move Y (XP orbs move freely; items obey gravity + ground)
      drop.position.y += drop.velocity.y * dt;
      // Ground collision (skip for orbs being magnetized - they can fly)
      if (!drop.isXp || dist > 1.5) {
        if (this.checkSolidAt(drop.position.x, drop.position.y - 0.15, drop.position.z)) {
          drop.position.y = Math.floor(drop.position.y) + 1;
          drop.velocity.y = 0;
          // Small bounce
          if (drop.velocity.y < -1) drop.velocity.y = 1;
        }
      }

      // Update mesh position
      if (drop.mesh) {
        drop.mesh.position.copy(drop.position);
        // Rotate slowly for visual effect
        drop.mesh.rotation.y += dt * 2;
        // Bob up and down when on ground (items only)
        if (!drop.isXp && drop.velocity.y === 0) {
          drop.mesh.position.y += Math.sin(drop.lifetime * 3) * 0.05;
        }
      }

      // Check pickup (XP orbs use a slightly larger pickup radius)
      const pickupRadius = drop.isXp ? 1.5 : 1.5;
      if (drop.pickupDelay <= 0 && dist < pickupRadius) {
        // Pick up
        pickedUp.push({ id: drop.id, count: drop.count, isXp: drop.isXp });
        // Remove mesh (XP orbs share geometry/material, don't dispose them)
        if (drop.mesh) {
          this.scene.remove(drop.mesh);
          if (!drop.isXp) {
            drop.mesh.geometry.dispose();
            (drop.mesh.material as THREE.Material).dispose();
          }
        }
        this.drops.splice(i, 1);
        continue;
      }

      // Despawn after 5 minutes (300 seconds)
      if (drop.lifetime > 300) {
        if (drop.mesh) {
          this.scene.remove(drop.mesh);
          if (!drop.isXp) {
            drop.mesh.geometry.dispose();
            (drop.mesh.material as THREE.Material).dispose();
          }
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
        if (!drop.isXp) {
          drop.mesh.geometry.dispose();
          (drop.mesh.material as THREE.Material).dispose();
        }
      }
    }
    this.drops = [];
    // Dispose shared XP orb resources
    this.xpOrbGeometry.dispose();
    for (const mat of this.xpOrbMaterials.values()) mat.dispose();
    this.xpOrbMaterials.clear();
  }
}
