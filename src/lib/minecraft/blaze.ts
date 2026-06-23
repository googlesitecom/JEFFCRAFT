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
  // Detected rod particles (for spinning animation)
  rodParts: THREE.Object3D[] = [];
  // Glow pulse state
  glowIntensity: number = 1;
  attackAnimTime: number = 0;

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
      // Detect rod-like parts (anything that's not the central body) for spinning
      this.detectRods();
    } catch (e) {
      console.error("Failed to load Blaze.glb:", e);
      // Fallback: simple floating box with rods
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.2, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 0.6 })
      );
      body.position.y = 0.6;
      body.castShadow = true;
      group.add(body);
      // 4 rods orbiting the body
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const rod = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.5, 0.12),
          new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff4400, emissiveIntensity: 0.8 })
        );
        rod.position.set(Math.cos(angle) * 0.7, 0.7, Math.sin(angle) * 0.7);
        rod.castShadow = true;
        group.add(rod);
        this.rodParts.push(rod);
      }
      this.model = group;
    }
  }

  // Detect rod-like mesh parts in the GLB (named "rod", "ring", "particle", etc.)
  private detectRods() {
    if (!this.model) return;
    this.rodParts = [];
    this.model.traverse((obj) => {
      const name = obj.name.toLowerCase();
      if (obj instanceof THREE.Mesh && (name.includes("rod") || name.includes("ring") || name.includes("particle") || name.includes("smoke"))) {
        this.rodParts.push(obj);
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
    if (this.attackAnimTime > 0) this.attackAnimTime -= dt;

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
      this.attackAnimTime = 0.6; // 600ms fire burst
      return { damage: 4 };
    }

    // Update model
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.rotation.y = this.yaw + Math.PI;

      // === ROD SPINNING ANIMATION ===
      // Orbit rods around the blaze body
      if (this.rodParts.length > 0) {
        const spinSpeed = this.attackAnimTime > 0 ? 8 : 3; // spin faster when attacking
        const angle = this.floatTime * spinSpeed;
        for (let i = 0; i < this.rodParts.length; i++) {
          const offset = (i / this.rodParts.length) * Math.PI * 2;
          const r = 0.7;
          // Preserve original Y, just orbit on XZ plane around the model origin
          const origY = this.rodParts[i].position.y;
          this.rodParts[i].position.x = Math.cos(angle + offset) * r;
          this.rodParts[i].position.z = Math.sin(angle + offset) * r;
          this.rodParts[i].position.y = origY + Math.sin(this.floatTime * 4 + i) * 0.05;
        }
      }

      // === GLOW PULSE ===
      // Pulsate emissive intensity (breathing fire effect)
      this.glowIntensity = 0.6 + Math.sin(this.floatTime * 5) * 0.3 + (this.attackAnimTime > 0 ? 0.6 : 0);
      this.applyGlow(this.glowIntensity);
    }

    // Damage flash
    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= dt;
      this.applyTint(0.8, 0.2, 0);
    }

    return null;
  }

  // Apply pulsing glow to all emissive materials in the model
  private applyGlow(intensity: number) {
    if (!this.model) return;
    this.model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
        if (mat && "emissiveIntensity" in mat) {
          (mat as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
        }
      }
    });
  }

  // Apply tint (for damage flash)
  private applyTint(r: number, g: number, b: number) {
    if (!this.model) return;
    this.model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
        if (mat && mat.emissive) {
          // Blend tint over the emissive
          const baseGlow = this.glowIntensity * 0.3;
          mat.emissive.setRGB(Math.max(r, baseGlow * 1.0), Math.max(g, baseGlow * 0.4), Math.max(b, 0));
        }
      }
    });
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
