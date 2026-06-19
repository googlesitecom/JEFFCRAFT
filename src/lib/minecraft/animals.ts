// Animals: pig, cow, chicken with simple AI
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, isSolid } from "./blocks";
import { ItemType } from "./items";

export type AnimalType = "pig" | "cow" | "chicken";

export interface AnimalDef {
  type: AnimalType;
  maxHealth: number;
  speed: number;
  // Drops on death
  drops: { id: number; min: number; max: number }[];
  // Texture name in atlas
  texture: string;
  // Body dimensions
  width: number;
  height: number;
}

export const ANIMALS: Record<AnimalType, AnimalDef> = {
  pig: {
    type: "pig",
    maxHealth: 10,
    speed: 1.2,
    drops: [{ id: ItemType.RawPorkchop, min: 1, max: 3 }],
    texture: "pig",
    width: 0.9,
    height: 0.9,
  },
  cow: {
    type: "cow",
    maxHealth: 10,
    speed: 1.0,
    drops: [
      { id: ItemType.RawBeef, min: 1, max: 3 },
      { id: BlockType.Leaves, min: 0, max: 0 }, // would be leather, but we don't have it
    ],
    texture: "cow",
    width: 0.9,
    height: 1.2,
  },
  chicken: {
    type: "chicken",
    maxHealth: 4,
    speed: 1.4,
    drops: [{ id: ItemType.RawChicken, min: 1, max: 1 }],
    texture: "chicken",
    width: 0.6,
    height: 0.7,
  },
};

export class Animal {
  type: AnimalType;
  def: AnimalDef;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number = 0;
  health: number;
  world: World;
  mesh: THREE.Sprite | null = null;
  // AI state
  directionChangeTime: number = 0;
  isDead: boolean = false;

  constructor(type: AnimalType, world: World, position: THREE.Vector3) {
    this.type = type;
    this.def = ANIMALS[type];
    this.world = world;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.health = this.def.maxHealth;
    this.yaw = Math.random() * Math.PI * 2;
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    if (this.health <= 0) {
      this.isDead = true;
      return true; // died
    }
    return false;
  }

  // Get dropped items when killed
  getDrops(): { id: number; count: number }[] {
    const drops: { id: number; count: number }[] = [];
    for (const d of this.def.drops) {
      if (d.max > 0) {
        const count = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        if (count > 0) drops.push({ id: d.id, count });
      }
    }
    return drops;
  }

  update(dt: number) {
    if (this.isDead) return;

    // Simple AI: wander randomly
    this.directionChangeTime -= dt;
    if (this.directionChangeTime <= 0) {
      // Pick new direction
      if (Math.random() < 0.5) {
        this.yaw = Math.random() * Math.PI * 2;
        this.directionChangeTime = 2 + Math.random() * 3;
      } else {
        // Stop
        this.directionChangeTime = 1 + Math.random() * 2;
      }
    }

    // Move forward based on yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const moveSpeed = this.def.speed;
    this.velocity.x = forward.x * moveSpeed;
    this.velocity.z = forward.z * moveSpeed;

    // Gravity
    this.velocity.y -= 20 * dt;

    // Apply movement with simple collision (just ground)
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // Ground collision
    const blockX = Math.floor(this.position.x);
    const blockY = Math.floor(this.position.y);
    const blockZ = Math.floor(this.position.z);
    const groundBlock = this.world.getBlock(blockX, blockY - 1, blockZ);
    if (isSolid(groundBlock) || groundBlock === BlockType.Water) {
      // On ground - if water, float
      if (groundBlock === BlockType.Water) {
        this.position.y = blockY + 0.5;
        this.velocity.y = 0;
      } else {
        this.position.y = blockY;
        this.velocity.y = 0;
      }
    } else {
      // Check if there's a block we should stand on
      for (let dy = 0; dy < 3; dy++) {
        const b = this.world.getBlock(blockX, blockY - dy, blockZ);
        if (isSolid(b)) {
          this.position.y = blockY - dy + 1;
          this.velocity.y = 0;
          break;
        }
      }
    }

    // Update mesh position
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.position.y += this.def.height / 2;
    }
  }

  // Distance to a point
  distanceTo(x: number, y: number, z: number): number {
    return Math.sqrt(
      (this.position.x - x) ** 2 +
      (this.position.y - y) ** 2 +
      (this.position.z - z) ** 2
    );
  }
}

// Animal manager - spawns and updates animals
export class AnimalManager {
  animals: Animal[] = [];
  world: World;
  scene: THREE.Scene;
  textureLoader: (name: string) => THREE.Texture | null;
  spawnTimer: number = 0;
  maxAnimals: number = 30; // increased from 12 to 30
  initialSpawnDone: boolean = false;

  constructor(
    world: World,
    scene: THREE.Scene,
    textureLoader: (name: string) => THREE.Texture | null
  ) {
    this.world = world;
    this.scene = scene;
    this.textureLoader = textureLoader;
  }

  // Spawn multiple animals at start so player sees them immediately
  initialSpawn(centerX: number, centerZ: number) {
    if (this.initialSpawnDone) return;
    this.initialSpawnDone = true;
    // Spawn 8 animals around the player
    for (let i = 0; i < 8; i++) {
      this.spawnRandom(centerX, centerZ, 3 + Math.random() * 8);
    }
  }

  spawnRandom(centerX: number, centerZ: number, maxDist: number = 20) {
    if (this.animals.length >= this.maxAnimals) return;

    // Pick random offset within maxDist blocks
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * maxDist;
    const x = Math.floor(centerX + Math.cos(angle) * dist);
    const z = Math.floor(centerZ + Math.sin(angle) * dist);

    // Find surface - search from top down
    // First, ensure the chunk is loaded
    let surfaceY = -1;
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
      const block = this.world.getBlock(x, y, z);
      if (isSolid(block) && block !== BlockType.Water && block !== BlockType.Bedrock) {
        const topBlock = this.world.getBlock(x, y + 1, z);
        if (topBlock === BlockType.Air) {
          surfaceY = y;
          break;
        }
      }
    }
    if (surfaceY < 0) return; // no valid surface found

    // Spawn here
    const types: AnimalType[] = ["pig", "cow", "chicken"];
    const type = types[Math.floor(Math.random() * types.length)];
    const animal = new Animal(
      type,
      this.world,
      new THREE.Vector3(x + 0.5, surfaceY + 1, z + 0.5)
    );
    // Create sprite - always create it, even if texture isn't loaded yet
    const tex = this.textureLoader(animal.def.texture);
    // Use a fallback canvas texture if the real one isn't available
    let spriteTex = tex;
    if (!spriteTex) {
      // Create a simple colored canvas as fallback
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext("2d")!;
      const colors: Record<string, string> = {
        pig: "#e89b9b",
        cow: "#6b4226",
        chicken: "#fafafa",
      };
      ctx.fillStyle = colors[animal.type] || "#ff00ff";
      ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = "#000000";
      ctx.fillRect(6, 6, 2, 2); // eye
      spriteTex = new THREE.CanvasTexture(canvas);
      spriteTex.magFilter = THREE.NearestFilter;
      spriteTex.minFilter = THREE.NearestFilter;
    }
    const mat = new THREE.SpriteMaterial({
      map: spriteTex,
      transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    // Make sprites bigger so they're clearly visible
    sprite.scale.set(animal.def.width * 2.5, animal.def.height * 2.5, 1);
    this.scene.add(sprite);
    animal.mesh = sprite;
    this.animals.push(animal);
  }

  update(dt: number, playerX: number, playerZ: number) {
    // Initial spawn burst
    if (!this.initialSpawnDone) {
      this.initialSpawn(playerX, playerZ);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1; // try spawn every 1 second (more frequent)
      // Try to spawn up to 2 animals per tick to populate faster
      this.spawnRandom(playerX, playerZ, 15);
      if (this.animals.length < this.maxAnimals * 0.7) {
        this.spawnRandom(playerX, playerZ, 12);
      }
    }

    // Update all animals
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const animal = this.animals[i];
      animal.update(dt);

      // Remove dead or too-far animals
      if (animal.isDead) {
        if (animal.mesh) {
          this.scene.remove(animal.mesh);
          (animal.mesh.material as THREE.Material).dispose();
        }
        this.animals.splice(i, 1);
      } else if (animal.distanceTo(playerX, animal.position.y, playerZ) > 60) {
        // Despawn far animals
        if (animal.mesh) {
          this.scene.remove(animal.mesh);
          (animal.mesh.material as THREE.Material).dispose();
        }
        this.animals.splice(i, 1);
      }
    }
  }

  // Find the closest animal to a point, within maxDist
  findClosest(x: number, y: number, z: number, maxDist: number): Animal | null {
    let closest: Animal | null = null;
    let closestDist = maxDist;
    for (const animal of this.animals) {
      if (animal.isDead) continue;
      const d = animal.distanceTo(x, y, z);
      if (d < closestDist) {
        closestDist = d;
        closest = animal;
      }
    }
    return closest;
  }

  // Remove an animal (after killing and dropping loot)
  removeAnimal(animal: Animal) {
    if (animal.mesh) {
      this.scene.remove(animal.mesh);
      (animal.mesh.material as THREE.Material).dispose();
    }
    const idx = this.animals.indexOf(animal);
    if (idx >= 0) this.animals.splice(idx, 1);
  }

  dispose() {
    for (const animal of this.animals) {
      if (animal.mesh) {
        this.scene.remove(animal.mesh);
        (animal.mesh.material as THREE.Material).dispose();
      }
    }
    this.animals = [];
  }
}
