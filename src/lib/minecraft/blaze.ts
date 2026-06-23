// Blaze: floating fire mob from the Nether that drops Blaze Rods.
// Loads Blaze.glb model. Spawns in blaze fortresses in the Nether.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, isSolid } from "./blocks";
import { ItemType } from "./items";

const blazeModelCache: THREE.Group | null = null;
const gltfLoader = new GLTFLoader();

export class Blaze {
  position: THREE.Vector3;
  velocity: THREE.Vector3 = new THREE.Vector3();
  yaw: number = 0;
  health: number = 20;
  maxHealth: number = 20;
  world: World;
  model: THREE.Group | null = null;
  isDead: boolean = false;
  damageFlashTime: number = 0;
  attackTimer: number = 0;
  floatTime: number = 0;

  constructor(world: World, position: THREE.Vector3) {
    this.world = world;
    this.position = position.clone();
    this.loadModel();
  }

  private async loadModel() {
    try {
      const gltf = await gltfLoader.loadAsync("/Blaze.glb");
      const model = gltf.scene;
      model.scale.set(0.5, 0.5, 0.5);
      this.model = model;
      this.world; // just to suppress unused warning
    } catch (e) {
      console.error("Failed to load Blaze.glb:", e);
      // Fallback: simple floating box
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.2, 0.8),
        new THREE.MeshLambertMaterial({ color: 0xffaa00, emissive: 0x664400 })
      );
      body.position.y = 0.6;
      group.add(body);
      this.model = group;
    }
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

  knockback(fromX: number, fromZ: number, strength: number = 3) {
    const dx = this.position.x - fromX;
    const dz = this.position.z - fromZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.001) {
      this.velocity.x = (dx / dist) * strength;
      this.velocity.z = (dz / dist) * strength;
    }
  }

  getDrops(): { id: number; count: number }[] {
    const count = 1 + Math.floor(Math.random() * 2); // 1-2 blaze rods
    return [{ id: ItemType.BlazeRod, count }];
  }

  update(dt: number, playerX: number, playerY: number, playerZ: number): { damage: number } | null {
    if (this.isDead) return null;
    this.floatTime += dt;

    const dx = playerX - this.position.x;
    const dy = playerY - this.position.y;
    const dz = playerZ - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Face the player
    this.yaw = Math.atan2(-dx, -dz);

    // Float toward player slowly (blazes hover)
    let moveSpeed = 0;
    if (dist > 2 && dist < 16) {
      moveSpeed = 1.5;
    }
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.velocity.x = forward.x * moveSpeed;
    this.velocity.z = forward.z * moveSpeed;
    // Hover: sin wave vertical movement
    this.velocity.y = Math.sin(this.floatTime * 2) * 0.5;

    // Move with collision
    const halfW = 0.4;
    const oldX = this.position.x;
    this.position.x += this.velocity.x * dt;
    if (this.checkCollision(halfW)) { this.position.x = oldX; this.velocity.x = 0; }
    const oldZ = this.position.z;
    this.position.z += this.velocity.z * dt;
    if (this.checkCollision(halfW)) { this.position.z = oldZ; this.velocity.z = 0; }
    this.position.y += this.velocity.y * dt;

    // Attack: shoot fireballs (simplified as direct damage)
    this.attackTimer -= dt;
    if (dist < 6 && Math.abs(dy) < 3 && this.attackTimer <= 0) {
      this.attackTimer = 2.0;
      return { damage: 4 };
    }

    // Update model
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.rotation.y = this.yaw + Math.PI;
    }

    // Damage flash
    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= dt;
    }

    return null;
  }

  private checkCollision(halfW: number): boolean {
    const margin = 0.01;
    const minX = Math.floor(this.position.x - halfW - margin);
    const maxX = Math.floor(this.position.x + halfW + margin);
    const minY = Math.floor(this.position.y + margin);
    const maxY = Math.floor(this.position.y + 1.2 - margin);
    const minZ = Math.floor(this.position.z - halfW - margin);
    const maxZ = Math.floor(this.position.z + halfW + margin);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (isSolid(this.world.getBlock(x, y, z))) return true;
    return false;
  }

  distanceTo(x: number, y: number, z: number): number {
    return Math.sqrt((this.position.x - x) ** 2 + (this.position.y - y) ** 2 + (this.position.z - z) ** 2);
  }
}

export class BlazeManager {
  blazes: Blaze[] = [];
  world: World;
  scene: THREE.Scene;
  spawnTimer: number = 0;
  maxBlazes: number = 5;

  constructor(world: World, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
  }

  spawn(x: number, y: number, z: number) {
    if (this.blazes.length >= this.maxBlazes) return;
    const b = new Blaze(this.world, new THREE.Vector3(x, y, z));
    this.blazes.push(b);
    // Add model to scene when loaded
    b["loadModel"]().then(() => {
      if (!b.isDead && this.scene) {
        if (b.model) this.scene.add(b.model);
      }
    }).catch(() => {});
  }

  update(dt: number, playerX: number, playerY: number, playerZ: number, isNight: boolean): { damage: number }[] {
    const damages: { damage: number }[] = [];
    for (let i = this.blazes.length - 1; i >= 0; i--) {
      const b = this.blazes[i];
      const result = b.update(dt, playerX, playerY, playerZ);
      if (result) damages.push(result);
      if (b.model && b.model.parent !== this.scene) {
        this.scene.add(b.model);
      }
      if (b.isDead) {
        if (b.model) this.scene.remove(b.model);
        this.blazes.splice(i, 1);
      } else if (b.distanceTo(playerX, playerY, playerZ) > 60) {
        if (b.model) this.scene.remove(b.model);
        this.blazes.splice(i, 1);
      }
    }
    return damages;
  }

  findClosest(x: number, y: number, z: number, maxDist: number): Blaze | null {
    let closest: Blaze | null = null;
    let closestDist = maxDist;
    for (const b of this.blazes) {
      if (b.isDead) continue;
      const d = b.distanceTo(x, y, z);
      if (d < closestDist) { closestDist = d; closest = b; }
    }
    return closest;
  }

  removeBlaze(b: Blaze) {
    if (b.model) this.scene.remove(b.model);
    const idx = this.blazes.indexOf(b);
    if (idx >= 0) this.blazes.splice(idx, 1);
  }

  dispose() {
    for (const b of this.blazes) {
      if (b.model) this.scene.remove(b.model);
    }
    this.blazes = [];
  }
}
