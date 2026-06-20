// Animals: pig, cow, chicken loaded from GLB models with improved AI
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, isSolid } from "./blocks";
import { ItemType } from "./items";

export type AnimalType = "pig" | "cow" | "chicken";

export interface AnimalDef {
  type: AnimalType;
  maxHealth: number;
  speed: number;
  drops: { id: number; min: number; max: number }[];
  width: number;
  height: number;
  depth: number;
  fleeDistance: number;
  modelPath: string;
  modelScale: number;
  modelYOffset: number;
  // Rotation offset to fix GLB model orientation (radians around Y axis)
  // 0 = model faces -Z, PI/2 = faces +X, PI = faces +Z, -PI/2 = faces -X
  modelRotationOffset: number;
}

export const ANIMALS: Record<AnimalType, AnimalDef> = {
  pig: {
    type: "pig",
    maxHealth: 10,
    speed: 1.2,
    drops: [{ id: ItemType.RawPorkchop, min: 1, max: 3 }],
    width: 0.8,
    height: 0.8,
    depth: 1.1,
    fleeDistance: 4,
    modelPath: "/pig.glb",
    modelScale: 0.09,
    modelYOffset: 0,
    modelRotationOffset: Math.PI,
  },
  cow: {
    type: "cow",
    maxHealth: 10,
    speed: 1.0,
    drops: [{ id: ItemType.RawBeef, min: 1, max: 3 }],
    width: 1.0,
    height: 1.2,
    depth: 1.5,
    fleeDistance: 4,
    modelPath: "/cow.glb",
    modelScale: 0.1275,
    modelYOffset: 0,
    modelRotationOffset: Math.PI,
  },
  chicken: {
    type: "chicken",
    maxHealth: 4,
    speed: 1.4,
    drops: [{ id: ItemType.RawChicken, min: 1, max: 1 }],
    width: 0.35,
    height: 0.45,
    depth: 0.4,
    fleeDistance: 3,
    modelPath: "/chicken.glb",
    modelScale: 0.0525,
    modelYOffset: 0,
    modelRotationOffset: Math.PI,
  },
};

// Cache for loaded GLB models
const modelCache: Map<string, THREE.Group> = new Map();
const gltfLoader = new GLTFLoader();

// Load a GLB model asynchronously
export function loadAnimalModel(path: string): Promise<THREE.Group> {
  if (modelCache.has(path)) {
    return Promise.resolve(modelCache.get(path)!.clone());
  }
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        modelCache.set(path, model);
        resolve(model.clone());
      },
      undefined,
      (error) => reject(error)
    );
  });
}

// Fallback: simple box model if GLB fails to load
function buildFallbackModel(def: AnimalDef): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    color: def.type === "pig" ? 0xe89b9b : def.type === "cow" ? 0x5a3520 : 0xffffff,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.width, def.height * 0.6, def.depth * 0.7), mat);
  body.position.y = def.height * 0.4;
  group.add(body);
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
  state: "wander" | "flee" | "idle" = "wander";
  stateTimer: number = 0;
  walkAnimTime: number = 0;
  isDead: boolean = false;
  modelLoaded: boolean = false;
  damageFlashTime: number = 0; // seconds of red tint remaining

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

  // Load the GLB model asynchronously
  async loadModel() {
    try {
      const model = await loadAnimalModel(this.def.modelPath);
      model.scale.set(this.def.modelScale, this.def.modelScale, this.def.modelScale);
      model.position.y = this.def.modelYOffset;
      // Models face -Z by convention; we rotate so they face their movement direction
      // The yaw rotation is applied in update(), so we add an offset here if needed
      this.model = model;
      this.modelLoaded = true;
    } catch (e) {
      console.error("Failed to load animal model:", this.def.modelPath, e);
      this.model = buildFallbackModel(this.def);
      this.modelLoaded = true;
    }
  }

  takeDamage(amount: number, playerPos?: THREE.Vector3): boolean {
    this.health -= amount;
    this.damageFlashTime = 0.4; // red tint for 0.4 seconds
    if (playerPos) {
      this.state = "flee";
      this.stateTimer = 3 + Math.random() * 2;
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

    const distToPlayer = Math.sqrt(
      (this.position.x - playerX) ** 2 + (this.position.z - playerZ) ** 2
    );

    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      if (this.state === "flee") {
        this.state = "wander";
        this.stateTimer = 2 + Math.random() * 3;
      } else if (this.state === "wander") {
        if (Math.random() < 0.4) {
          this.state = "idle";
          this.stateTimer = 1 + Math.random() * 2;
        } else {
          this.yaw = Math.random() * Math.PI * 2;
          this.stateTimer = 2 + Math.random() * 3;
        }
      } else {
        this.state = "wander";
        this.yaw = Math.random() * Math.PI * 2;
        this.stateTimer = 2 + Math.random() * 3;
      }
    }

    if (distToPlayer < this.def.fleeDistance && this.state !== "flee") {
      this.state = "flee";
      this.stateTimer = 2 + Math.random() * 2;
      const dx = this.position.x - playerX;
      const dz = this.position.z - playerZ;
      this.yaw = Math.atan2(-dx, -dz);
    }

    let moveSpeed = 0;
    if (this.state === "wander") {
      moveSpeed = this.def.speed * 0.5;
    } else if (this.state === "flee") {
      moveSpeed = this.def.speed * 1.8;
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.velocity.x = forward.x * moveSpeed;
    this.velocity.z = forward.z * moveSpeed;

    // Gravity
    this.velocity.y -= 25 * dt;

    // === MOVEMENT WITH COLLISION (per-axis) ===
    const halfW = this.def.width / 2;
    const bodyHeight = this.def.height;

    // --- X axis ---
    const oldX = this.position.x;
    this.position.x += this.velocity.x * dt;
    if (this.checkBodyCollision(halfW, bodyHeight)) {
      this.position.x = oldX;
      this.velocity.x = 0;
      // Try to step up 1 block
      if (this.canStepUpFrom(halfW, bodyHeight)) {
        this.velocity.y = 7;
      } else {
        this.yaw += Math.PI / 2 + Math.random() * Math.PI;
      }
    }

    // --- Z axis ---
    const oldZ = this.position.z;
    this.position.z += this.velocity.z * dt;
    if (this.checkBodyCollision(halfW, bodyHeight)) {
      this.position.z = oldZ;
      this.velocity.z = 0;
      if (this.canStepUpFrom(halfW, bodyHeight)) {
        this.velocity.y = 7;
      } else {
        this.yaw += Math.PI / 2 + Math.random() * Math.PI;
      }
    }

    // --- Y axis (gravity + ground) ---
    this.position.y += this.velocity.y * dt;

    // Ensure chunk is loaded
    const cx = Math.floor(this.position.x / CHUNK_SIZE);
    const cz = Math.floor(this.position.z / CHUNK_SIZE);
    this.world.getOrCreateChunk(cx, cz);

    // Ground collision: find the highest solid block below the animal
    // The animal's feet are at position.y. We check the block AT the feet
    // and the block BELOW the feet.
    const feetX = Math.floor(this.position.x);
    const feetZ = Math.floor(this.position.z);
    const feetY = Math.floor(this.position.y);

    // Check if feet are inside a solid block
    if (isSolid(this.world.getBlock(feetX, feetY, feetZ))) {
      // Push up to stand on top
      this.position.y = feetY + 1;
      this.velocity.y = 0;
    } else if (this.velocity.y <= 0) {
      // Falling: check the block below feet
      const belowY = feetY - 1;
      if (isSolid(this.world.getBlock(feetX, belowY, feetZ))) {
        // Land on top of the block below
        this.position.y = feetY;
        this.velocity.y = 0;
      } else if (this.position.y < -10) {
        // Fell out of world - respawn high
        this.position.y = 40;
        this.velocity.y = 0;
      }
    }

    if (moveSpeed > 0) {
      this.walkAnimTime += dt * 8;
    }

    // Update model position and rotation
    if (this.model) {
      this.model.position.copy(this.position);
      // Apply yaw + rotation offset to fix GLB orientation
      this.model.rotation.y = this.yaw + this.def.modelRotationOffset;

      // Walk animation: bob up and down slightly
      if (moveSpeed > 0) {
        const bob = Math.abs(Math.sin(this.walkAnimTime)) * 0.05;
        this.model.position.y += bob;
      }

      // Damage flash: tint the model red for 0.4 seconds after taking damage
      if (this.damageFlashTime > 0) {
        this.damageFlashTime -= dt;
        this.applyRedTint(0.8);
      } else {
        this.applyRedTint(0);
      }
    }
  }

  // Check if the animal's body collides with any solid block
  private checkBodyCollision(halfW: number, bodyHeight: number): boolean {
    // Use a small margin to prevent entities from getting stuck in walls
    const margin = 0.01;
    const minX = Math.floor(this.position.x - halfW - margin);
    const maxX = Math.floor(this.position.x + halfW + margin);
    const minY = Math.floor(this.position.y + margin);
    const maxY = Math.floor(this.position.y + bodyHeight - margin);
    const minZ = Math.floor(this.position.z - halfW - margin);
    const maxZ = Math.floor(this.position.z + halfW + margin);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (isSolid(this.world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  // Check if the animal can step up 1 block (jump)
  private canStepUpFrom(halfW: number, bodyHeight: number): boolean {
    // Check if there's space 1 block above current position
    const minX = Math.floor(this.position.x - halfW);
    const maxX = Math.floor(this.position.x + halfW);
    const minY = Math.floor(this.position.y) + 1;
    const maxY = Math.floor(this.position.y + bodyHeight) + 1;
    const minZ = Math.floor(this.position.z - halfW);
    const maxZ = Math.floor(this.position.z + halfW);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (isSolid(this.world.getBlock(x, y, z))) return false;
        }
      }
    }
    return true;
  }

  // Apply red tint to the model (for damage flash)
  private applyRedTint(intensity: number) {
    if (!this.model) return;
    this.model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshLambertMaterial;
        if (mat && mat.emissive !== undefined) {
          mat.emissive.setRGB(intensity, 0, 0);
        }
      }
    });
  }

  // 3D distance for despawn checks
  distanceTo3D(x: number, y: number, z: number): number {
    return Math.sqrt(
      (this.position.x - x) ** 2 +
      (this.position.y - y) ** 2 +
      (this.position.z - z) ** 2
    );
  }

  distanceTo(x: number, y: number, z: number): number {
    // Use horizontal distance (XZ plane) for better hit detection
    return Math.sqrt(
      (this.position.x - x) ** 2 +
      (this.position.z - z) ** 2
    );
  }
}

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

    // Load model asynchronously
    animal.loadModel().then(() => {
      if (!animal.isDead && this.scene) {
        this.scene.add(animal.model!);
      }
    });

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
        this.disposeAnimal(animal);
        this.animals.splice(i, 1);
      } else if (animal.distanceTo3D(playerX, animal.position.y, playerZ) > 60) {
        this.disposeAnimal(animal);
        this.animals.splice(i, 1);
      }
    }
  }

  private disposeAnimal(animal: Animal) {
    if (animal.model) {
      this.scene.remove(animal.model);
      animal.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            (obj.material as THREE.Material).dispose();
          }
        }
      });
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
    this.disposeAnimal(animal);
    const idx = this.animals.indexOf(animal);
    if (idx >= 0) this.animals.splice(idx, 1);
  }

  dispose() {
    for (const animal of this.animals) {
      this.disposeAnimal(animal);
    }
    this.animals = [];
  }
}
