// Monsters: zombies and spiders that spawn at night
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, isSolid } from "./blocks";
import { ItemType } from "./items";

export type MonsterType = "zombie" | "spider";

export interface MonsterDef {
  type: MonsterType;
  maxHealth: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  drops: { id: number; min: number; max: number }[];
  width: number;
  height: number;
  modelScale: number;
  modelYOffset: number;
  modelRotationOffset: number;
  burnsInSunlight: boolean;
}

export const MONSTERS: Record<MonsterType, MonsterDef> = {
  zombie: {
    type: "zombie",
    maxHealth: 20,
    speed: 0.8,
    damage: 3,
    attackRange: 1.5,
    attackCooldown: 1.0,
    drops: [{ id: ItemType.RawBeef, min: 0, max: 1 }, { id: ItemType.Coal, min: 0, max: 1 }],
    width: 0.6,
    height: 1.8,
    // Zombie.glb: feet at Y=-4 in model space, scale 0.08 → feet at Y=-0.32. Offset +0.32.
    modelScale: 0.13,
    modelYOffset: 0.45,
    modelRotationOffset: Math.PI,
    burnsInSunlight: true,
  },
  spider: {
    type: "spider",
    maxHealth: 16,
    speed: 1.6,
    damage: 2,
    attackRange: 1.5,
    attackCooldown: 0.8,
    drops: [{ id: ItemType.RawChicken, min: 0, max: 1 }, { id: ItemType.Stick, min: 0, max: 2 }],
    width: 1.0,
    height: 0.6,
    // Spider.glb: feet at Y=-4 in model space, scale 0.06 → feet at Y=-0.24. Offset +0.24.
    modelScale: 0.10,
    modelYOffset: 0.35,
    modelRotationOffset: Math.PI,
    burnsInSunlight: false,
  },
};

// Build fallback 3D model if no GLB
function buildMonsterModel(def: MonsterDef): THREE.Group {
  const group = new THREE.Group();
  if (def.type === "zombie") {
    // Zombie: green humanoid
    const skinMat = new THREE.MeshLambertMaterial({ color: 0x4a7a3a });
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0x3a5a8a });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.6;
    group.add(head);
    // Eyes (red)
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0x440000 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), eyeMat);
    eyeL.position.set(-0.12, 1.65, 0.26);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), eyeMat);
    eyeR.position.set(0.12, 1.65, 0.26);
    group.add(eyeR);
    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), shirtMat);
    body.position.y = 1.0;
    group.add(body);
    // Arms (extended forward like zombie)
    const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    const armL = new THREE.Mesh(armGeo, skinMat);
    armL.position.set(-0.35, 1.1, 0.3);
    armL.rotation.x = -1.4;
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, skinMat);
    armR.position.set(0.35, 1.1, 0.3);
    armR.rotation.x = -1.4;
    group.add(armR);
    // Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.13, 0.35, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.13, 0.35, 0);
    group.add(legR);
    (group as any).legs = [legL, legR];
    (group as any).arms = [armL, armR];
  } else {
    // Spider: dark body with 8 legs
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a1a1a });
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0x660000 });

    // Body (two segments)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.8), bodyMat);
    body.position.y = 0.35;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.4), bodyMat);
    head.position.set(0, 0.35, 0.5);
    group.add(head);
    // Eyes (8 red dots - 4 visible)
    for (let i = 0; i < 4; i++) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), eyeMat);
      eye.position.set(-0.12 + i * 0.08, 0.42, 0.7);
      group.add(eye);
    }
    // 8 legs (4 per side)
    const legGeo = new THREE.BoxGeometry(0.05, 0.05, 0.5);
    const legs: THREE.Mesh[] = [];
    const legPositions = [
      [-0.3, 0.3, 0.3, 0.8], [-0.3, 0.3, 0, 0.6], [-0.3, 0.3, -0.2, -0.6], [-0.3, 0.3, -0.4, -0.8],
      [0.3, 0.3, 0.3, -0.8], [0.3, 0.3, 0, -0.6], [0.3, 0.3, -0.2, 0.6], [0.3, 0.3, -0.4, 0.8],
    ];
    for (const [x, y, z, rotY] of legPositions) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(x, y, z);
      leg.rotation.y = rotY;
      legs.push(leg);
      group.add(leg);
    }
    (group as any).legs = legs;
  }
  return group;
}

// Cache for loaded GLB models
const monsterModelCache: Map<string, THREE.Group> = new Map();
const monsterGltfLoader = new GLTFLoader();

export function loadMonsterModel(path: string): Promise<THREE.Group> {
  if (monsterModelCache.has(path)) {
    return Promise.resolve(monsterModelCache.get(path)!.clone());
  }
  return new Promise((resolve, reject) => {
    monsterGltfLoader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        monsterModelCache.set(path, model);
        resolve(model.clone());
      },
      undefined,
      (error) => reject(error)
    );
  });
}

export class Monster {
  type: MonsterType;
  def: MonsterDef;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number = 0;
  health: number;
  world: World;
  model: THREE.Group | null = null;
  walkAnimTime: number = 0;
  isDead: boolean = false;
  attackTimer: number = 0;
  damageFlashTime: number = 0;
  onFire: boolean = false;
  fireTimer: number = 0;
  // Detected arm/head bones for procedural animations on GLB models
  armBones: THREE.Object3D[] = [];
  headBone: THREE.Object3D | null = null;
  idleTime: number = 0;
  attackAnimTime: number = 0; // > 0 means attack swing in progress

  constructor(type: MonsterType, world: World, position: THREE.Vector3) {
    this.type = type;
    this.def = MONSTERS[type];
    this.world = world;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.health = this.def.maxHealth;
  }

  async loadModel() {
    const path = this.type === "zombie" ? "/Zombie.glb" : "/Spider.glb";
    try {
      const model = await loadMonsterModel(path);
      model.scale.set(this.def.modelScale, this.def.modelScale, this.def.modelScale);
      this.model = model;
      // Detect bones for procedural animations (zombie arms for attack, head for tracking)
      this.detectBones();
    } catch (e) {
      // Fallback to procedural model
      const model = buildMonsterModel(this.def);
      model.scale.set(this.def.modelScale, this.def.modelScale, this.def.modelScale);
      this.model = model;
    }
  }

  // Detect arm and head bones (for GLB models) so we can animate attacks and head tracking
  private detectBones() {
    if (!this.model) return;
    this.armBones = [];
    this.headBone = null;
    const armKeywords = ["arm", "Arm", "ARM", "hand", "Hand"];
    const headKeywords = ["head", "Head", "HEAD"];
    this.model.traverse((obj) => {
      const name = obj.name || "";
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Bone) {
        const isArm = armKeywords.some(k => name.includes(k));
        const isHead = headKeywords.some(k => name.includes(k));
        if (isArm) this.armBones.push(obj);
        else if (isHead && this.headBone === null) this.headBone = obj;
      }
    });
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.damageFlashTime = 0.4;
    if (this.health <= 0) {
      this.isDead = true;
      return true;
    }
    return false;
  }

  // Apply knockback to the monster (pushed away from attacker).
  knockback(fromX: number, fromZ: number, strength: number = 4) {
    const dx = this.position.x - fromX;
    const dz = this.position.z - fromZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.001) {
      this.velocity.x = (dx / dist) * strength;
      this.velocity.z = (dz / dist) * strength;
    }
    this.velocity.y = Math.max(this.velocity.y, 3);
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

  update(dt: number, playerX: number, playerY: number, playerZ: number, isNight: boolean): { damage: number } | null {
    if (this.isDead) return null;

    // Burn in sunlight
    if (this.def.burnsInSunlight && !isNight) {
      this.onFire = true;
      this.fireTimer += dt;
      if (this.fireTimer > 0.5) {
        this.health -= 1;
        this.fireTimer = 0;
        if (this.health <= 0) {
          this.isDead = true;
          return null;
        }
      }
    }

    // Distance to player (3D)
    const dx = playerX - this.position.x;
    const dy = playerY - this.position.y;
    const dz = playerZ - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Face the player (only XZ, not Y, so monsters don't tilt)
    this.yaw = Math.atan2(-dx, -dz);

    // === MOVEMENT: stop if in attack range, otherwise move toward player ===
    let moveSpeed = this.def.speed;
    if (dist < this.def.attackRange) {
      moveSpeed = 0; // Stop to attack
    }
    // Only chase within a reasonable range (don't path across the world)
    if (dist > 24) {
      moveSpeed = 0; // Too far, give up
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.velocity.x = forward.x * moveSpeed;
    this.velocity.z = forward.z * moveSpeed;
    this.velocity.y -= 25 * dt;
    if (this.velocity.y < -25) this.velocity.y = -25;

    // === Move with per-axis collision ===
    const halfW = this.def.width / 2;
    const bodyHeight = this.def.height;

    // --- X axis ---
    const oldX = this.position.x;
    this.position.x += this.velocity.x * dt;
    if (this.checkCollision(halfW, bodyHeight)) {
      this.position.x = oldX;
      this.velocity.x = 0;
      // Try to jump over the obstacle
      if (this.velocity.y <= 0 && this.canStepUp(halfW, bodyHeight)) {
        this.velocity.y = 8;
      }
    }

    // --- Z axis ---
    const oldZ = this.position.z;
    this.position.z += this.velocity.z * dt;
    if (this.checkCollision(halfW, bodyHeight)) {
      this.position.z = oldZ;
      this.velocity.z = 0;
      if (this.velocity.y <= 0 && this.canStepUp(halfW, bodyHeight)) {
        this.velocity.y = 8;
      }
    }

    // --- Y axis ---
    this.position.y += this.velocity.y * dt;

    // Ground collision
    const fx = Math.floor(this.position.x);
    const fy = Math.floor(this.position.y);
    const fz = Math.floor(this.position.z);
    const cx = Math.floor(fx / CHUNK_SIZE);
    const cz = Math.floor(fz / CHUNK_SIZE);
    this.world.getOrCreateChunk(cx, cz);

    // Check if feet are inside a solid block
    if (isSolid(this.world.getBlock(fx, fy, fz))) {
      this.position.y = fy + 1;
      this.velocity.y = 0;
    } else if (this.velocity.y <= 0) {
      // Falling: check block below
      if (isSolid(this.world.getBlock(fx, fy - 1, fz))) {
        this.position.y = fy;
        this.velocity.y = 0;
      } else if (this.position.y < -10) {
        this.position.y = 40;
        this.velocity.y = 0;
      }
    }

    // === AVOID walking off cliffs (so monsters don't fall into caves while chasing) ===
    if (moveSpeed > 0 && this.velocity.y === 0) {
      const aheadX = Math.floor(this.position.x + forward.x * 1.2);
      const aheadZ = Math.floor(this.position.z + forward.z * 1.2);
      const belowAheadY = Math.floor(this.position.y) - 1;
      if (!isSolid(this.world.getBlock(aheadX, belowAheadY, aheadZ)) && !isSolid(this.world.getBlock(aheadX, Math.floor(this.position.y), aheadZ))) {
        // Cliff ahead: stop, don't fall
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    // Attack player (only if close enough in 3D)
    this.attackTimer -= dt;
    if (dist < this.def.attackRange && Math.abs(dy) < 2 && this.attackTimer <= 0) {
      this.attackTimer = this.def.attackCooldown;
      this.attackAnimTime = 0.4; // 400ms attack swing animation
      return { damage: this.def.damage };
    }

    // Walk animation
    if (moveSpeed > 0) {
      this.walkAnimTime += dt * 6;
    }
    this.idleTime += dt;
    if (this.attackAnimTime > 0) this.attackAnimTime -= dt;

    // Update model
    if (this.model) {
      // Apply modelYOffset so the model's feet rest on the ground (not buried)
      this.model.position.set(this.position.x, this.position.y + this.def.modelYOffset, this.position.z);
      this.model.rotation.y = this.yaw + this.def.modelRotationOffset;

      // === WALK ANIMATION ===
      // Procedural fallback models: use the assigned `legs` array
      const legs = (this.model as any).legs as THREE.Mesh[];
      if (legs) {
        const swing = Math.sin(this.walkAnimTime) * 0.4;
        if (this.type === "zombie" && legs.length === 2) {
          legs[0].rotation.x = swing;
          legs[1].rotation.x = -swing;
        } else if (legs.length === 8) {
          for (let i = 0; i < 4; i++) {
            legs[i].rotation.x = Math.sin(this.walkAnimTime + i * 0.5) * 0.3;
            legs[i + 4].rotation.x = -Math.sin(this.walkAnimTime + i * 0.5) * 0.3;
          }
        }
      }

      // GLB models: traverse for leg bones by name (when no procedural legs set)
      if (!legs) {
        const legBones: THREE.Object3D[] = [];
        this.model.traverse((obj) => {
          const name = obj.name || "";
          if ((obj instanceof THREE.Mesh || obj instanceof THREE.Bone) &&
              (name.toLowerCase().includes("leg") || name.toLowerCase().includes("limb"))) {
            legBones.push(obj);
          }
        });
        for (let i = 0; i < legBones.length; i++) {
          const phase = (i % 2 === 0) ? 0 : Math.PI;
          const swing = Math.sin(this.walkAnimTime + phase) * 0.5;
          legBones[i].rotation.x = swing;
        }
      }

      // Body bob while walking
      if (moveSpeed > 0) {
        const bob = Math.abs(Math.sin(this.walkAnimTime)) * 0.05;
        this.model.position.y += bob;
      }

      // === ATTACK ANIMATION (zombie arms swing forward) ===
      if (this.attackAnimTime > 0 && this.armBones.length > 0) {
        const t = 1 - (this.attackAnimTime / 0.4); // 0 → 1
        // Swing arms forward and back
        const armSwing = Math.sin(t * Math.PI) * 1.4; // peaks at t=0.5
        for (const arm of this.armBones) {
          arm.rotation.x = -armSwing; // negative = forward
        }
      } else if (this.type === "zombie" && this.armBones.length > 0) {
        // Default zombie pose: arms extended forward (classic Minecraft zombie)
        for (const arm of this.armBones) {
          arm.rotation.x = -1.4; // ~80 degrees forward
        }
      }

      // === HEAD TRACKING (look at player when hostile) ===
      if (this.headBone) {
        if (dist < 8) {
          // Slight head tilt toward player
          this.headBone.rotation.x = Math.max(-0.3, Math.min(0.3, dy * 0.1));
        } else if (moveSpeed === 0) {
          // Idle: subtle head movement
          this.headBone.rotation.y = Math.sin(this.idleTime * 0.6) * 0.2;
        }
      }

      // Damage flash
      if (this.damageFlashTime > 0) {
        this.damageFlashTime -= dt;
        this.applyTint(0.8, 0, 0);
      } else if (this.onFire) {
        this.applyTint(0.5, 0.2, 0);
      } else {
        this.applyTint(0, 0, 0);
      }
    }

    return null;
  }

  private checkCollision(halfW: number, bodyHeight?: number): boolean {
    const h = bodyHeight ?? this.def.height;
    const margin = 0.01;
    const minX = Math.floor(this.position.x - halfW - margin);
    const maxX = Math.floor(this.position.x + halfW + margin);
    const minY = Math.floor(this.position.y + margin);
    const maxY = Math.floor(this.position.y + h - margin);
    const minZ = Math.floor(this.position.z - halfW - margin);
    const maxZ = Math.floor(this.position.z + halfW + margin);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (isSolid(this.world.getBlock(x, y, z))) return true;
    return false;
  }

  private canStepUp(halfW: number, bodyHeight?: number): boolean {
    const h = bodyHeight ?? this.def.height;
    const minX = Math.floor(this.position.x - halfW);
    const maxX = Math.floor(this.position.x + halfW);
    const minY = Math.floor(this.position.y) + 1;
    const maxY = Math.floor(this.position.y + h) + 1;
    const minZ = Math.floor(this.position.z - halfW);
    const maxZ = Math.floor(this.position.z + halfW);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (isSolid(this.world.getBlock(x, y, z))) return false;
    return true;
  }

  private applyTint(r: number, g: number, b: number) {
    if (!this.model) return;
    this.model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshLambertMaterial;
        if (mat && mat.emissive) mat.emissive.setRGB(r, g, b);
      }
    });
  }

  distanceTo(x: number, y: number, z: number): number {
    // Use horizontal distance for attack detection, 3D for despawn
    return Math.sqrt((this.position.x - x) ** 2 + (this.position.z - z) ** 2);
  }

  distanceTo3D(x: number, y: number, z: number): number {
    return Math.sqrt((this.position.x - x) ** 2 + (this.position.y - y) ** 2 + (this.position.z - z) ** 2);
  }
}

export class MonsterManager {
  monsters: Monster[] = [];
  world: World;
  scene: THREE.Scene;
  spawnTimer: number = 0;
  maxMonsters: number = 8; // reduced from 15 — too many were spawning

  constructor(world: World, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
  }

  update(dt: number, playerX: number, playerY: number, playerZ: number, isNight: boolean): { damage: number; fromX: number; fromZ: number }[] {
    const damages: { damage: number; fromX: number; fromZ: number }[] = [];

    // Spawn at night — slower rate (was 2-5s, now 5-10s)
    if (isNight) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.monsters.length < this.maxMonsters) {
        this.spawnTimer = 5 + Math.random() * 5;
        this.spawnMonster(playerX, playerZ);
      }
    }

    // Update monsters
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      const result = m.update(dt, playerX, playerY, playerZ, isNight);
      if (result) damages.push({ damage: result.damage, fromX: m.position.x, fromZ: m.position.z });

      if (m.isDead) {
        this.disposeMonster(m);
        this.monsters.splice(i, 1);
      } else if (m.distanceTo3D(playerX, playerY, playerZ) > 80) {
        // Despawn if too far
        this.disposeMonster(m);
        this.monsters.splice(i, 1);
      } else if (!isNight && m.def.burnsInSunlight && m.health <= 0) {
        this.disposeMonster(m);
        this.monsters.splice(i, 1);
      }
    }

    return damages;
  }

  private spawnMonster(playerX: number, playerZ: number) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 12 + Math.random() * 16;
    const x = Math.floor(playerX + Math.cos(angle) * dist);
    const z = Math.floor(playerZ + Math.sin(angle) * dist);

    // Find surface
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    this.world.getOrCreateChunk(cx, cz);
    let surfaceY = -1;
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
      const block = this.world.getBlock(x, y, z);
      if (isSolid(block) && block !== BlockType.Water && block !== BlockType.Bedrock) {
        if (this.world.getBlock(x, y + 1, z) === BlockType.Air) {
          surfaceY = y;
          break;
        }
      }
    }
    if (surfaceY < 0) return;

    // === TREE AVOIDANCE ===
    const surfaceBlock = this.world.getBlock(x, surfaceY, z);
    if (surfaceBlock === BlockType.Wood || surfaceBlock === BlockType.Leaves) return;
    // Require 2 blocks of air above spawn point
    if (this.world.getBlock(x, surfaceY + 2, z) !== BlockType.Air) return;
    // No leaves in 3x3 area above
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 1; dy <= 2; dy++) {
          if (this.world.getBlock(x + dx, surfaceY + dy, z + dz) === BlockType.Leaves) return;
        }
      }
    }

    const types: MonsterType[] = ["zombie", "zombie", "spider"]; // zombies more common
    const type = types[Math.floor(Math.random() * types.length)];
    const monster = new Monster(type, this.world, new THREE.Vector3(x + 0.5, surfaceY + 1, z + 0.5));
    this.monsters.push(monster);
    // Load model asynchronously
    monster.loadModel().then(() => {
      if (!monster.isDead && this.scene) {
        this.scene.add(monster.model!);
      }
    });
  }

  findClosest(x: number, y: number, z: number, maxDist: number): Monster | null {
    let closest: Monster | null = null;
    let closestDist = maxDist;
    for (const m of this.monsters) {
      if (m.isDead) continue;
      const d = m.distanceTo(x, y, z);
      if (d < closestDist) { closestDist = d; closest = m; }
    }
    return closest;
  }

  removeMonster(m: Monster) {
    this.disposeMonster(m);
    const idx = this.monsters.indexOf(m);
    if (idx >= 0) this.monsters.splice(idx, 1);
  }

  private disposeMonster(m: Monster) {
    if (m.model) {
      this.scene.remove(m.model);
      m.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
  }

  // Clear all monsters (when day comes)
  clearAll() {
    for (const m of this.monsters) this.disposeMonster(m);
    this.monsters = [];
  }

  dispose() {
    this.clearAll();
  }
}
