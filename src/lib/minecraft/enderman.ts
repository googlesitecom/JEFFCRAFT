// Enderman: tall black mob that spawns in the Nether and drops Ender Pearls.
// Ender Pearls + Blaze Rods → Ender Eyes (crafted at a crafting table).
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, isSolid } from "./blocks";
import { ItemType } from "./items";

export class Enderman {
  position: THREE.Vector3;
  velocity: THREE.Vector3 = new THREE.Vector3();
  yaw: number = 0;
  health: number = 40;
  maxHealth: number = 40;
  world: World;
  model: THREE.Group;
  isDead: boolean = false;
  walkAnimTime: number = 0;
  damageFlashTime: number = 0;
  idleTime: number = 0;
  teleportAnimTime: number = 0; // > 0 means teleport fade in progress
  // References to body parts for procedural animation
  legL!: THREE.Mesh;
  legR!: THREE.Mesh;
  armL!: THREE.Mesh;
  armR!: THREE.Mesh;
  head!: THREE.Mesh;
  eyeL!: THREE.Mesh;
  eyeR!: THREE.Mesh;
  // Enderman AI: wanders, teleports occasionally, becomes hostile if looked at
  state: "wander" | "hostile" | "idle" = "wander";
  stateTimer: number = 2;
  teleportTimer: number = 5;

  constructor(world: World, position: THREE.Vector3) {
    this.world = world;
    this.position = position.clone();
    this.model = this.buildModel();
  }

  private buildModel(): THREE.Group {
    const group = new THREE.Group();
    // Enderman: tall (3 blocks), thin, black with purple eyes
    const black = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.8 });
    const darkBlack = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 });
    // Magenta eyes with emissive glow
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 2.0, roughness: 0.3
    });

    // Body (tall thin)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.3), black);
    body.position.y = 1.4;
    body.castShadow = true;
    group.add(body);
    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), black);
    head.position.y = 2.4;
    head.castShadow = true;
    group.add(head);
    this.head = head;
    // Eyes (magenta, glowing)
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), eyeMat);
    eyeL.position.set(-0.12, 2.4, 0.26);
    group.add(eyeL);
    this.eyeL = eyeL;
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), eyeMat);
    eyeR.position.set(0.12, 2.4, 0.26);
    group.add(eyeR);
    this.eyeR = eyeR;
    // Arms (long, thin)
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), black);
    armL.position.set(-0.45, 1.4, 0);
    armL.castShadow = true;
    group.add(armL);
    this.armL = armL;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), black);
    armR.position.set(0.45, 1.4, 0);
    armR.castShadow = true;
    group.add(armR);
    this.armR = armR;
    // Legs (long)
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), darkBlack);
    legL.position.set(-0.15, 0.7, 0);
    legL.castShadow = true;
    group.add(legL);
    this.legL = legL;
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), darkBlack);
    legR.position.set(0.15, 0.7, 0);
    legR.castShadow = true;
    group.add(legR);
    this.legR = legR;

    return group;
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.damageFlashTime = 0.4;
    // Enderman teleports away when hit
    this.teleportAway();
    if (this.health <= 0) {
      this.isDead = true;
      return true;
    }
    return false;
  }

  // Teleport to a random nearby position with fade effect
  private teleportAway() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 5 + Math.random() * 8;
    const newX = this.position.x + Math.cos(angle) * dist;
    const newZ = this.position.z + Math.sin(angle) * dist;
    // Find a safe Y (on top of solid block)
    let newY = this.position.y;
    for (let y = Math.floor(this.position.y) + 5; y >= Math.floor(this.position.y) - 5; y--) {
      if (isSolid(this.world.getBlock(Math.floor(newX), y, Math.floor(newZ))) &&
          !isSolid(this.world.getBlock(Math.floor(newX), y + 1, Math.floor(newZ)))) {
        newY = y + 1;
        break;
      }
    }
    this.position.set(newX, newY, newZ);
    this.velocity.set(0, 0, 0);
    this.teleportAnimTime = 0.5; // 500ms fade-in
  }

  getDrops(): { id: number; count: number }[] {
    // Enderman drops 0-1 ender pearls
    const count = Math.random() < 0.5 ? 1 : 0;
    return count > 0 ? [{ id: ItemType.EnderPearl, count }] : [];
  }

  update(dt: number, playerX: number, playerY: number, playerZ: number): { damage: number } | null {
    if (this.isDead) return null;

    const dx = playerX - this.position.x;
    const dy = playerY - this.position.y;
    const dz = playerZ - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // State machine
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      if (this.state === "wander") {
        if (Math.random() < 0.3) {
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

    // Teleport occasionally
    this.teleportTimer -= dt;
    if (this.teleportTimer <= 0) {
      this.teleportTimer = 8 + Math.random() * 10;
      this.teleportAway();
    }

    // Movement
    let moveSpeed = 0;
    if (this.state === "wander") {
      moveSpeed = 0.6;
    }
    // Face direction
    if (moveSpeed > 0) {
      this.model.rotation.y = this.yaw + Math.PI;
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.velocity.x = forward.x * moveSpeed;
    this.velocity.z = forward.z * moveSpeed;
    this.velocity.y -= 25 * dt;
    if (this.velocity.y < -25) this.velocity.y = -25;

    // Move with collision (per-axis, simplified)
    const halfW = 0.3;
    const bodyHeight = 2.8;
    const oldX = this.position.x;
    this.position.x += this.velocity.x * dt;
    if (this.checkCollision(halfW, bodyHeight)) {
      this.position.x = oldX;
      this.velocity.x = 0;
      this.yaw += Math.PI / 2;
    }
    const oldZ = this.position.z;
    this.position.z += this.velocity.z * dt;
    if (this.checkCollision(halfW, bodyHeight)) {
      this.position.z = oldZ;
      this.velocity.z = 0;
      this.yaw += Math.PI / 2;
    }
    this.position.y += this.velocity.y * dt;

    // Ground collision
    const fx = Math.floor(this.position.x);
    const fy = Math.floor(this.position.y);
    const fz = Math.floor(this.position.z);
    const cx = Math.floor(fx / CHUNK_SIZE);
    const cz = Math.floor(fz / CHUNK_SIZE);
    this.world.getOrCreateChunk(cx, cz);
    if (isSolid(this.world.getBlock(fx, fy, fz))) {
      this.position.y = fy + 1;
      this.velocity.y = 0;
    } else if (this.velocity.y <= 0 && isSolid(this.world.getBlock(fx, fy - 1, fz))) {
      this.position.y = fy;
      this.velocity.y = 0;
    } else if (this.position.y < -10) {
      this.position.y = 30;
      this.velocity.y = 0;
    }

    // Update model
    this.model.position.copy(this.position);
    if (moveSpeed > 0) {
      this.walkAnimTime += dt * 5;
    }
    this.idleTime += dt;
    if (this.teleportAnimTime > 0) this.teleportAnimTime -= dt;

    // === WALK ANIMATION ===
    if (moveSpeed > 0) {
      const legSwing = Math.sin(this.walkAnimTime) * 0.5;
      this.legL.rotation.x = legSwing;
      this.legR.rotation.x = -legSwing;
      // Body bob
      this.model.position.y += Math.abs(Math.sin(this.walkAnimTime)) * 0.05;
      // Arms sway gently
      const armSway = Math.sin(this.walkAnimTime) * 0.15;
      this.armL.rotation.x = armSway;
      this.armR.rotation.x = -armSway;
    } else {
      // Idle: legs ease to neutral, gentle sway
      this.legL.rotation.x *= 0.85;
      this.legR.rotation.x *= 0.85;
      const sway = Math.sin(this.idleTime * 0.6) * 0.05;
      this.armL.rotation.x = sway;
      this.armR.rotation.x = sway;
      // Head occasionally looks around
      this.head.rotation.y = Math.sin(this.idleTime * 0.4) * 0.3;
    }

    // === TELEPORT FADE ===
    // Just teleported: model is transparent and scales up
    if (this.teleportAnimTime > 0) {
      const t = 1 - (this.teleportAnimTime / 0.5); // 0 → 1
      this.model.scale.setScalar(0.5 + t * 0.5); // grow from 0.5 to 1.0
      // Fade in opacity
      this.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          mat.transparent = true;
          mat.opacity = t;
        }
      });
    } else {
      this.model.scale.setScalar(1);
      // Reset opacity (only if was transparent)
      this.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          if (mat.transparent) {
            mat.transparent = false;
            mat.opacity = 1;
          }
        }
      });
    }

    // === EYE GLOW PULSE ===
    // Magenta eyes pulse subtly
    const eyePulse = 1.5 + Math.sin(this.idleTime * 3) * 0.5;
    const eyeMatL = this.eyeL.material as THREE.MeshStandardMaterial;
    const eyeMatR = this.eyeR.material as THREE.MeshStandardMaterial;
    eyeMatL.emissiveIntensity = eyePulse;
    eyeMatR.emissiveIntensity = eyePulse;

    // === DAMAGE FLASH ===
    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= dt;
      this.applyTint(0.8, 0.2, 0.8);
    } else {
      this.applyTint(0, 0, 0);
    }

    // Enderman doesn't attack aggressively (passive unless provoked)
    return null;
  }

  // Apply tint (for damage flash)
  private applyTint(r: number, g: number, b: number) {
    this.model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat && mat.emissive) {
          // Don't tint eyes (they keep their magenta glow)
          if (obj === this.eyeL || obj === this.eyeR) return;
          mat.emissive.setRGB(r, g, b);
        }
      }
    });
  }

  private checkCollision(halfW: number, bodyHeight: number): boolean {
    const margin = 0.01;
    const minX = Math.floor(this.position.x - halfW - margin);
    const maxX = Math.floor(this.position.x + halfW + margin);
    const minY = Math.floor(this.position.y + margin);
    const maxY = Math.floor(this.position.y + bodyHeight - margin);
    const minZ = Math.floor(this.position.z - halfW - margin);
    const maxZ = Math.floor(this.position.z + halfW + margin);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (isSolid(this.world.getBlock(x, y, z))) return true;
    return false;
  }

  distanceTo(x: number, y: number, z: number): number {
    return Math.sqrt(
      (this.position.x - x) ** 2 +
      (this.position.y - y) ** 2 +
      (this.position.z - z) ** 2
    );
  }
}

export class EndermanManager {
  endermen: Enderman[] = [];
  world: World;
  scene: THREE.Scene;
  spawnTimer: number = 0;
  maxEndermen: number = 5;

  constructor(world: World, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
  }

  spawn(x: number, y: number, z: number) {
    if (this.endermen.length >= this.maxEndermen) return;
    const e = new Enderman(this.world, new THREE.Vector3(x, y, z));
    this.scene.add(e.model);
    this.endermen.push(e);
  }

  update(dt: number, playerX: number, playerY: number, playerZ: number, isNight: boolean): { damage: number }[] {
    const damages: { damage: number }[] = [];
    // Spawn endermen at night (rare)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 10;
      if (isNight && this.endermen.length < this.maxEndermen && Math.random() < 0.3) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 15 + Math.random() * 20;
        const x = Math.floor(playerX + Math.cos(angle) * dist);
        const z = Math.floor(playerZ + Math.sin(angle) * dist);
        // Find surface
        let y = -1;
        for (let yy = WORLD_HEIGHT - 1; yy >= 1; yy--) {
          const b = this.world.getBlock(x, yy, z);
          if (isSolid(b) && b !== BlockType.Water) { y = yy + 1; break; }
        }
        if (y > 0) this.spawn(x + 0.5, y, z + 0.5);
      }
    }

    for (let i = this.endermen.length - 1; i >= 0; i--) {
      const e = this.endermen[i];
      const result = e.update(dt, playerX, playerY, playerZ);
      if (result) damages.push(result);
      if (e.isDead) {
        this.scene.remove(e.model);
        this.endermen.splice(i, 1);
      } else if (e.distanceTo(playerX, playerY, playerZ) > 80) {
        this.scene.remove(e.model);
        this.endermen.splice(i, 1);
      }
    }
    return damages;
  }

  findClosest(x: number, y: number, z: number, maxDist: number): Enderman | null {
    let closest: Enderman | null = null;
    let closestDist = maxDist;
    for (const e of this.endermen) {
      if (e.isDead) continue;
      const d = e.distanceTo(x, y, z);
      if (d < closestDist) {
        closestDist = d;
        closest = e;
      }
    }
    return closest;
  }

  removeEnderman(e: Enderman) {
    this.scene.remove(e.model);
    const idx = this.endermen.indexOf(e);
    if (idx >= 0) this.endermen.splice(idx, 1);
  }

  dispose() {
    for (const e of this.endermen) {
      this.scene.remove(e.model);
    }
    this.endermen = [];
  }
}
