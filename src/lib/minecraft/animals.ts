// Animals: pig, cow, chicken with 3D models and improved AI
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, isSolid } from "./blocks";
import { ItemType } from "./items";

export type AnimalType = "pig" | "cow" | "chicken";

export interface AnimalDef {
  type: AnimalType;
  maxHealth: number;
  speed: number;
  drops: { id: number; min: number; max: number }[];
  // Body dimensions
  width: number;
  height: number;
  depth: number;
  // Colors
  bodyColor: number;
  headColor: number;
  legColor: number;
  // Behavior
  fleeDistance: number; // distance at which animal flees from player
}

export const ANIMALS: Record<AnimalType, AnimalDef> = {
  pig: {
    type: "pig",
    maxHealth: 10,
    speed: 1.2,
    drops: [{ id: ItemType.RawPorkchop, min: 1, max: 3 }],
    width: 0.9,
    height: 0.8,
    depth: 1.2,
    bodyColor: 0xff9090, // bright pink
    headColor: 0xffa0a0,
    legColor: 0xc47878,
    fleeDistance: 4,
  },
  cow: {
    type: "cow",
    maxHealth: 10,
    speed: 1.0,
    drops: [{ id: ItemType.RawBeef, min: 1, max: 3 }],
    width: 0.9,
    height: 1.1,
    depth: 1.4,
    bodyColor: 0x3a2010, // dark brown
    headColor: 0x5a3520,
    legColor: 0x2a1500,
    fleeDistance: 4,
  },
  chicken: {
    type: "chicken",
    maxHealth: 4,
    speed: 1.4,
    drops: [{ id: ItemType.RawChicken, min: 1, max: 1 }],
    width: 0.5,
    height: 0.6,
    depth: 0.6,
    bodyColor: 0xffffff, // pure white
    headColor: 0xffffff,
    legColor: 0xff8800,
    fleeDistance: 3,
  },
};

// Build a 3D model for an animal using box geometries
function buildAnimalModel(def: AnimalDef): THREE.Group {
  const group = new THREE.Group();
  const w = def.width;
  const h = def.height;
  const d = def.depth;

  // Body (main box) - centered at origin, we'll position the group
  const bodyGeo = new THREE.BoxGeometry(w, h * 0.6, d * 0.7);
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.bodyColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = h * 0.45;
  group.add(body);

  // Head (smaller box at front)
  const headSize = Math.min(w, h) * 0.7;
  const headGeo = new THREE.BoxGeometry(headSize, headSize, headSize);
  const headMat = new THREE.MeshLambertMaterial({ color: def.headColor });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0, h * 0.6, d * 0.5);
  group.add(head);

  // Legs (4 boxes)
  const legW = w * 0.2;
  const legH = h * 0.4;
  const legGeo = new THREE.BoxGeometry(legW, legH, legW);
  const legMat = new THREE.MeshLambertMaterial({ color: def.legColor });
  const legPositions = [
    [-w * 0.3, h * 0.2, d * 0.25],
    [w * 0.3, h * 0.2, d * 0.25],
    [-w * 0.3, h * 0.2, -d * 0.25],
    [w * 0.3, h * 0.2, -d * 0.25],
  ];
  const legs: THREE.Mesh[] = [];
  for (const pos of legPositions) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(pos[0], pos[1], pos[2]);
    legs.push(leg);
    group.add(leg);
  }

  // Store legs for animation
  (group as any).legs = legs;
  (group as any).def = def;

  return group;
}

export class Animal {
  type: AnimalType;
  def: AnimalDef;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number = 0;
  health: number;
  world: World;
  model: THREE.Group | null = null;
  // AI state
  state: "wander" | "flee" | "idle" = "wander";
  stateTimer: number = 0;
  walkAnimTime: number = 0;
  isDead: boolean = false;

  constructor(type: AnimalType, world: World, position: THREE.Vector3) {
    this.type = type;
    this.def = ANIMALS[type];
    this.world = world;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.health = this.def.maxHealth;
    this.yaw = Math.random() * Math.PI * 2;
    this.stateTimer = 1 + Math.random() * 3;
  }

  takeDamage(amount: number, playerPos?: THREE.Vector3): boolean {
    this.health -= amount;
    // Flee from player when hit
    if (playerPos) {
      this.state = "flee";
      this.stateTimer = 3 + Math.random() * 2;
      // Face away from player
      const dx = this.position.x - playerPos.x;
      const dz = this.position.z - playerPos.z;
      this.yaw = Math.atan2(-dx, -dz);
    }
    if (this.health <= 0) {
      this.isDead = true;
      return true;
    }
    return false;
  }

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

  update(dt: number, playerX: number, playerZ: number) {
    if (this.isDead) return;

    // Distance to player
    const distToPlayer = Math.sqrt(
      (this.position.x - playerX) ** 2 + (this.position.z - playerZ) ** 2
    );

    // State machine
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      if (this.state === "flee") {
        // After fleeing, go back to wandering
        this.state = "wander";
        this.stateTimer = 2 + Math.random() * 3;
      } else if (this.state === "wander") {
        // Randomly switch between wander and idle
        if (Math.random() < 0.4) {
          this.state = "idle";
          this.stateTimer = 1 + Math.random() * 2;
        } else {
          // Pick new direction
          this.yaw = Math.random() * Math.PI * 2;
          this.stateTimer = 2 + Math.random() * 3;
        }
      } else {
        // idle -> wander
        this.state = "wander";
        this.yaw = Math.random() * Math.PI * 2;
        this.stateTimer = 2 + Math.random() * 3;
      }
    }

    // Check if player is too close -> flee
    if (distToPlayer < this.def.fleeDistance && this.state !== "flee") {
      this.state = "flee";
      this.stateTimer = 2 + Math.random() * 2;
      const dx = this.position.x - playerX;
      const dz = this.position.z - playerZ;
      this.yaw = Math.atan2(-dx, -dz);
    }

    // Movement based on state
    let moveSpeed = 0;
    if (this.state === "wander") {
      moveSpeed = this.def.speed * 0.5;
    } else if (this.state === "flee") {
      moveSpeed = this.def.speed * 1.8;
    } else {
      moveSpeed = 0; // idle
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.velocity.x = forward.x * moveSpeed;
    this.velocity.z = forward.z * moveSpeed;

    // Gravity
    this.velocity.y -= 25 * dt;

    // Try to move - check for obstacles and step up
    const oldX = this.position.x;
    const oldZ = this.position.z;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // Check if blocked - try to step up (jump)
    const blockX = Math.floor(this.position.x);
    const blockY = Math.floor(this.position.y);
    const blockZ = Math.floor(this.position.z);
    if (isSolid(this.world.getBlock(blockX, blockY, blockZ)) || isSolid(this.world.getBlock(blockX, blockY + 1, blockZ))) {
      // Try to step up 1 block
      if (!isSolid(this.world.getBlock(blockX, blockY + 1, blockZ)) && !isSolid(this.world.getBlock(blockX, blockY + 2, blockZ))) {
        // Step up
        this.velocity.y = 6; // jump
      } else {
        // Blocked - revert and change direction
        this.position.x = oldX;
        this.position.z = oldZ;
        this.yaw += Math.PI / 2 + Math.random() * Math.PI;
      }
    }

    // Vertical movement
    this.position.y += this.velocity.y * dt;

    // Ground collision - check the block at the animal's feet
    const feetBlockY = Math.floor(this.position.y);
    const feetBlockX = Math.floor(this.position.x);
    const feetBlockZ = Math.floor(this.position.z);
    // Force chunk generation to get accurate block data (peekBlock doesn't know about caves)
    const cx = Math.floor(feetBlockX / CHUNK_SIZE);
    const cz = Math.floor(feetBlockZ / CHUNK_SIZE);
    this.world.getOrCreateChunk(cx, cz);
    const feetBlock = this.world.getBlock(feetBlockX, feetBlockY, feetBlockZ);
    const belowBlock = this.world.getBlock(feetBlockX, feetBlockY - 1, feetBlockZ);
    if (isSolid(feetBlock)) {
      // Inside a solid block - push up
      this.position.y = feetBlockY + 1;
      this.velocity.y = 0;
    } else if (isSolid(belowBlock)) {
      // Standing on top of the block below
      this.position.y = feetBlockY;
      this.velocity.y = 0;
    } else if (belowBlock === BlockType.Water) {
      // Float on water
      this.position.y = feetBlockY;
      this.velocity.y = 0;
    } else {
      // Not on ground - keep falling but log if falling too far
      if (this.position.y < -10) {
        // Reset to a safe height
        this.position.y = 40;
        this.velocity.y = 0;
      }
    }

    // Walk animation
    if (moveSpeed > 0) {
      this.walkAnimTime += dt * 8;
    }

    // Update model
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.position.y += 0;
      this.model.rotation.y = this.yaw + Math.PI / 2;
      // Animate legs (swing back and forth)
      const legs = (this.model as any).legs as THREE.Mesh[];
      if (legs) {
        const swing = Math.sin(this.walkAnimTime) * 0.3;
        legs[0].rotation.x = swing;
        legs[3].rotation.x = swing;
        legs[1].rotation.x = -swing;
        legs[2].rotation.x = -swing;
      }
    }
  }

  distanceTo(x: number, y: number, z: number): number {
    return Math.sqrt(
      (this.position.x - x) ** 2 +
      (this.position.y - y) ** 2 +
      (this.position.z - z) ** 2
    );
  }
}

// Animal manager
export class AnimalManager {
  animals: Animal[] = [];
  world: World;
  scene: THREE.Scene;
  spawnTimer: number = 0;
  maxAnimals: number = 30;
  initialSpawnDone: boolean = false;

  constructor(world: World, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
  }

  initialSpawn(centerX: number, centerZ: number) {
    if (this.initialSpawnDone) return;
    this.initialSpawnDone = true;
    for (let i = 0; i < 8; i++) {
      this.spawnRandom(centerX, centerZ, 3 + Math.random() * 8);
    }
  }

  spawnRandom(centerX: number, centerZ: number, maxDist: number = 20) {
    if (this.animals.length >= this.maxAnimals) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * maxDist;
    const x = Math.floor(centerX + Math.cos(angle) * dist);
    const z = Math.floor(centerZ + Math.sin(angle) * dist);

    // Find surface - force chunk generation first
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    this.world.getOrCreateChunk(cx, cz);
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
    if (surfaceY < 0) return;

    const types: AnimalType[] = ["pig", "cow", "chicken"];
    const type = types[Math.floor(Math.random() * types.length)];
    const animal = new Animal(
      type,
      this.world,
      new THREE.Vector3(x + 0.5, surfaceY + 1, z + 0.5)
    );

    // Build 3D model and scale it up for visibility
    const model = buildAnimalModel(animal.def);
    model.scale.set(2.5, 2.5, 2.5);
    animal.model = model;
    this.scene.add(model);
    this.animals.push(animal);
  }

  update(dt: number, playerX: number, playerZ: number) {
    if (!this.initialSpawnDone) {
      this.initialSpawn(playerX, playerZ);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1;
      this.spawnRandom(playerX, playerZ, 15);
      if (this.animals.length < this.maxAnimals * 0.7) {
        this.spawnRandom(playerX, playerZ, 12);
      }
    }

    for (let i = this.animals.length - 1; i >= 0; i--) {
      const animal = this.animals[i];
      animal.update(dt, playerX, playerZ);

      if (animal.isDead) {
        if (animal.model) {
          this.scene.remove(animal.model);
          animal.model.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.geometry.dispose();
              (obj.material as THREE.Material).dispose();
            }
          });
        }
        this.animals.splice(i, 1);
      } else if (animal.distanceTo(playerX, animal.position.y, playerZ) > 60) {
        if (animal.model) {
          this.scene.remove(animal.model);
          animal.model.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.geometry.dispose();
              (obj.material as THREE.Material).dispose();
            }
          });
        }
        this.animals.splice(i, 1);
      }
    }
  }

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

  removeAnimal(animal: Animal) {
    if (animal.model) {
      this.scene.remove(animal.model);
      animal.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    const idx = this.animals.indexOf(animal);
    if (idx >= 0) this.animals.splice(idx, 1);
  }

  dispose() {
    for (const animal of this.animals) {
      if (animal.model) {
        this.scene.remove(animal.model);
        animal.model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        });
      }
    }
    this.animals = [];
  }
}
