// Player controller: physics, collision, pointer-lock mouse look, WASD movement
import * as THREE from "three";
import { World, WORLD_HEIGHT } from "./world";
import { BlockType, isSolid } from "./blocks";
import { ArmorSlots, applyArmorReduction, emptyArmor, damageArmor } from "./armor";

const PLAYER_HEIGHT = 1.7;
const PLAYER_WIDTH = 0.6; // half-width = 0.3
const EYE_OFFSET = 1.5; // eye height from feet
const GRAVITY = 28;
const JUMP_SPEED = 9.2;
const WALK_SPEED = 4.7;
const SPRINT_SPEED = 7.5;
const FLY_SPEED = 9;
const MAX_FALL = 50;

// Water physics
const WATER_GRAVITY = 4; // slower fall in water
const WATER_BUOYANCY = 8; // upward force when in water (submerged feet)
const WATER_SWIM_SPEED = 3.5; // horizontal speed in water
const WATER_SWIM_UP = 4; // upward speed when pressing space in water
const MAX_AIR = 10; // seconds of air
const DROWN_DAMAGE = 2; // damage per second when drowning

export type GameMode = "creative" | "survival";

export class Player {
  position: THREE.Vector3; // feet position (center bottom)
  velocity: THREE.Vector3;
  yaw: number = 0; // around Y axis
  pitch: number = 0; // around X axis
  onGround: boolean = false;
  flying: boolean = false;
  world: World;
  camera: THREE.PerspectiveCamera;
  mode: GameMode;

  // Survival stats
  health: number = 20;
  maxHealth: number = 20;
  hunger: number = 20;
  maxHunger: number = 20;
  air: number = MAX_AIR; // seconds of air remaining
  fallStartY: number = 0;

  // Armor slots (helmet, chestplate, leggings, boots)
  armor: ArmorSlots = emptyArmor();

  // Damage shake: when the player takes damage, the camera shakes briefly (like Minecraft).
  private damageShakeTime: number = 0;
  private damageShakeIntensity: number = 0;
  private static readonly DAMAGE_SHAKE_DURATION = 0.4;
  private static readonly DAMAGE_SHAKE_MAX_INTENSITY = 0.06;

  // Water state
  inWater: boolean = false;
  headInWater: boolean = false;

  // Input state
  keys: Record<string, boolean> = {};
  mouseDeltaX: number = 0;
  mouseDeltaY: number = 0;

  constructor(world: World, camera: THREE.PerspectiveCamera, mode: GameMode = "creative") {
    this.world = world;
    this.camera = camera;
    this.mode = mode;
    if (mode === "creative") {
      this.flying = true;
    }
    const spawn = world.getSpawnPoint();
    this.position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.fallStartY = this.position.y;
    this.updateCamera();
  }

  setKey(code: string, down: boolean) {
    this.keys[code] = down;
  }

  addMouseDelta(dx: number, dy: number) {
    this.mouseDeltaX += dx;
    this.mouseDeltaY += dy;
  }

  toggleFly() {
    if (this.mode === "survival") return;
    this.flying = !this.flying;
    this.velocity.y = 0;
  }

  damage(amount: number) {
    if (this.mode === "creative") return;
    // Apply armor reduction (Minecraft formula: defense / (defense + 25))
    const reduced = applyArmorReduction(amount, this.armor);
    this.health = Math.max(0, this.health - reduced);
    // Consume armor durability (1 per piece per hit)
    this.armor = damageArmor(this.armor, amount);
    // Trigger camera shake
    this.damageShakeTime = Player.DAMAGE_SHAKE_DURATION;
    this.damageShakeIntensity = Math.min(
      Player.DAMAGE_SHAKE_MAX_INTENSITY,
      Player.DAMAGE_SHAKE_MAX_INTENSITY * (reduced / 5)
    );
    if (this.damageShakeIntensity < 0.02) this.damageShakeIntensity = 0.02;
  }

  // Apply knockback to the player (pushed away from a source position).
  knockback(fromX: number, fromZ: number, strength: number = 6) {
    if (this.mode === "creative") return;
    const dx = this.position.x - fromX;
    const dz = this.position.z - fromZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.001) {
      this.velocity.x = (dx / dist) * strength;
      this.velocity.z = (dz / dist) * strength;
    }
    this.velocity.y = Math.max(this.velocity.y, 4);
  }

  heal(amount: number) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  isDead(): boolean {
    return this.health <= 0;
  }

  respawn() {
    const spawn = this.world.getSpawnPoint();
    this.position.set(spawn.x, spawn.y, spawn.z);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.air = MAX_AIR;
    this.fallStartY = this.position.y;
  }

  // Check if a given Y level (relative to feet) is in water
  private isYInWater(y: number): boolean {
    const x = Math.floor(this.position.x);
    const z = Math.floor(this.position.z);
    const blockY = Math.floor(y);
    return this.world.getBlock(x, blockY, z) === BlockType.Water;
  }

  // Get water current at player position (based on neighboring water heights)
  private getWaterCurrent(): THREE.Vector3 {
    // Simplified: no horizontal current in this version
    return new THREE.Vector3(0, 0, 0);
  }

  update(dt: number) {
    // Decay damage shake timer
    if (this.damageShakeTime > 0) {
      this.damageShakeTime -= dt;
      if (this.damageShakeTime < 0) this.damageShakeTime = 0;
    }
    // Apply mouse look
    const sensitivity = 0.0022;
    this.yaw -= this.mouseDeltaX * sensitivity;
    this.pitch -= this.mouseDeltaY * sensitivity;
    const maxPitch = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Determine movement direction relative to yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // Check water state - feet and head positions
    this.inWater = this.isYInWater(this.position.y + 0.2);
    this.headInWater = this.isYInWater(this.position.y + EYE_OFFSET);

    const sprint = this.keys["ShiftLeft"] || this.keys["ShiftRight"];

    let speed: number;
    if (this.flying) {
      speed = FLY_SPEED;
    } else if (this.inWater) {
      speed = WATER_SWIM_SPEED;
    } else if (sprint) {
      speed = SPRINT_SPEED;
    } else {
      speed = WALK_SPEED;
    }

    let moveX = 0;
    let moveZ = 0;
    if (this.keys["KeyW"]) {
      moveX += forward.x;
      moveZ += forward.z;
    }
    if (this.keys["KeyS"]) {
      moveX -= forward.x;
      moveZ -= forward.z;
    }
    if (this.keys["KeyD"]) {
      moveX += right.x;
      moveZ += right.z;
    }
    if (this.keys["KeyA"]) {
      moveX -= right.x;
      moveZ -= right.z;
    }
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0) {
      moveX = (moveX / moveLen) * speed;
      moveZ = (moveZ / moveLen) * speed;
    }

    if (this.flying) {
      // Creative flying
      this.velocity.x = moveX;
      this.velocity.z = moveZ;
      let vy = 0;
      if (this.keys["Space"]) vy = FLY_SPEED;
      else if (this.keys["ControlLeft"] || this.keys["KeyQ"]) vy = -FLY_SPEED;
      else vy = 0;
      this.velocity.y = vy;
    } else if (this.inWater) {
      // Water physics: buoyancy + horizontal swim
      this.velocity.x = moveX;
      this.velocity.z = moveZ;
      // Upward swim with Space
      if (this.keys["Space"]) {
        this.velocity.y = WATER_SWIM_UP;
      } else {
        // Slower gravity in water, with mild buoyancy
        this.velocity.y -= WATER_GRAVITY * dt;
        // If feet are in water, apply slight buoyancy (float up slowly)
        if (this.velocity.y < -2) this.velocity.y = -2;
      }
      // Damping
      this.velocity.y *= 0.95;
    } else {
      // Normal land physics
      this.velocity.x = moveX;
      this.velocity.z = moveZ;

      if (this.keys["Space"] && this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }

      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -MAX_FALL) this.velocity.y = -MAX_FALL;
    }

    // Track fall start for fall damage (only when not in water)
    if (this.mode === "survival" && !this.flying && !this.inWater) {
      if (this.onGround || this.velocity.y >= 0) {
        this.fallStartY = this.position.y;
      }
    }

    // Move with collision per-axis
    this.moveAxis("x", this.velocity.x * dt);
    this.moveAxis("y", this.velocity.y * dt);
    this.moveAxis("z", this.velocity.z * dt);

    // Apply fall damage when landing (no fall damage in water)
    if (this.mode === "survival" && !this.flying && !this.inWater && this.onGround) {
      const fallDist = this.fallStartY - this.position.y;
      if (fallDist > 3) {
        const dmg = Math.floor(fallDist - 3);
        if (dmg > 0) this.damage(dmg);
      }
      this.fallStartY = this.position.y;
    }

    // Air / drowning
    if (this.mode === "survival") {
      if (this.headInWater) {
        this.air -= dt;
        if (this.air <= 0) {
          this.damage(DROWN_DAMAGE * dt);
        }
      } else {
        this.air = Math.min(MAX_AIR, this.air + dt * 2);
      }
    }

    // Hunger drain and regen
    if (this.mode === "survival") {
      this.hunger = Math.max(0, this.hunger - dt * 0.1);
      if (this.hunger > 17 && this.health < this.maxHealth) {
        this.heal(dt * 1.0);
      }
      // Starvation damage when hunger reaches 0
      if (this.hunger <= 0) {
        this.damage(dt * 0.5);
      }
    }

    this.updateCamera();
  }

  private moveAxis(axis: "x" | "y" | "z", amount: number) {
    if (amount === 0) return;
    this.position[axis] += amount;
    this.resolveCollision(axis, amount);
  }

  private resolveCollision(axis: "x" | "y" | "z", amount: number) {
    const half = PLAYER_WIDTH / 2;
    const minX = Math.floor(this.position.x - half);
    const maxX = Math.floor(this.position.x + half);
    const minY = Math.floor(this.position.y);
    const maxY = Math.floor(this.position.y + PLAYER_HEIGHT);
    const minZ = Math.floor(this.position.z - half);
    const maxZ = Math.floor(this.position.z + half);

    let collided = false;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const b = this.world.getBlock(x, y, z);
          if (!isSolid(b)) continue;
          collided = true;
          if (axis === "y") {
            if (amount > 0) {
              this.position.y = y - PLAYER_HEIGHT - 0.001;
              this.velocity.y = 0;
            } else {
              this.position.y = y + 1 + 0.001;
              this.velocity.y = 0;
              this.onGround = true;
            }
          } else if (axis === "x") {
            if (amount > 0) {
              this.position.x = x - half - 0.001;
            } else {
              this.position.x = x + 1 + half + 0.001;
            }
            this.velocity.x = 0;
          } else if (axis === "z") {
            if (amount > 0) {
              this.position.z = z - half - 0.001;
            } else {
              this.position.z = z + 1 + half + 0.001;
            }
            this.velocity.z = 0;
          }
          return;
        }
      }
    }
    if (axis === "y" && !collided && amount < 0) {
      this.onGround = false;
    }
  }

  private updateCamera() {
    let camX = this.position.x;
    let camY = this.position.y + EYE_OFFSET;
    let camZ = this.position.z;
    let rotX = this.pitch;
    let rotY = this.yaw;
    let rotZ = 0;

    // Damage shake: vibrate the camera when recently hit
    if (this.damageShakeTime > 0) {
      const t = 1 - (this.damageShakeTime / Player.DAMAGE_SHAKE_DURATION);
      const decay = 1 - t;
      const intensity = this.damageShakeIntensity * decay;
      const shake = (Math.random() * 2 - 1) * intensity;
      const shake2 = (Math.random() * 2 - 1) * intensity;
      rotY += shake;
      rotX += shake2;
      camX += (Math.random() * 2 - 1) * intensity * 0.3;
      camY += (Math.random() * 2 - 1) * intensity * 0.3;
    }

    this.camera.position.set(camX, camY, camZ);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = rotY;
    this.camera.rotation.x = rotX;
    this.camera.rotation.z = rotZ;
  }

  raycast(maxDist: number = 6): {
    hit: boolean;
    block: { x: number; y: number; z: number } | null;
    normal: { x: number; y: number; z: number } | null;
  } {
    const origin = new THREE.Vector3(
      this.position.x,
      this.position.y + EYE_OFFSET,
      this.position.z
    );
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = dir.x !== 0 ? (stepX > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(dir.x) : Infinity;
    let tMaxY = dir.y !== 0 ? (stepY > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(dir.y) : Infinity;
    let tMaxZ = dir.z !== 0 ? (stepZ > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(dir.z) : Infinity;

    let lastStep: "x" | "y" | "z" | null = null;
    let lastStepDir: number = 0;
    let dist = 0;

    while (dist < maxDist) {
      if (y >= 0 && y < WORLD_HEIGHT) {
        const b = this.world.getBlock(x, y, z);
        if (b !== BlockType.Air && b !== BlockType.Water) {
          const normal = { x: 0, y: 0, z: 0 };
          if (lastStep === "x") normal.x = -lastStepDir;
          else if (lastStep === "y") normal.y = -lastStepDir;
          else if (lastStep === "z") normal.z = -lastStepDir;
          return { hit: true, block: { x, y, z }, normal };
        }
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          dist = tMaxX;
          tMaxX += tDeltaX;
          lastStep = "x";
          lastStepDir = stepX;
        } else {
          z += stepZ;
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          lastStep = "z";
          lastStepDir = stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          dist = tMaxY;
          tMaxY += tDeltaY;
          lastStep = "y";
          lastStepDir = stepY;
        } else {
          z += stepZ;
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          lastStep = "z";
          lastStepDir = stepZ;
        }
      }
    }

    return { hit: false, block: null, normal: null };
  }
}
