// Player controller: physics, collision, pointer-lock mouse look, WASD movement
import * as THREE from "three";
import { World, WORLD_HEIGHT } from "./world";
import { BlockType, isSolid } from "./blocks";

const PLAYER_HEIGHT = 1.7;
const PLAYER_WIDTH = 0.6; // half-width = 0.3
const EYE_OFFSET = 1.5; // eye height from feet
const GRAVITY = 28;
const JUMP_SPEED = 9.2;
const WALK_SPEED = 4.7;
const SPRINT_SPEED = 7.5;
const FLY_SPEED = 9;
const MAX_FALL = 50;

export class Player {
  position: THREE.Vector3; // feet position (center bottom)
  velocity: THREE.Vector3;
  yaw: number = 0; // around Y axis
  pitch: number = 0; // around X axis
  onGround: boolean = false;
  flying: boolean = false;
  world: World;
  camera: THREE.PerspectiveCamera;

  // Input state
  keys: Record<string, boolean> = {};
  // Mouse move delta accumulated
  mouseDeltaX: number = 0;
  mouseDeltaY: number = 0;

  constructor(world: World, camera: THREE.PerspectiveCamera) {
    this.world = world;
    this.camera = camera;
    const spawn = world.getSpawnPoint();
    this.position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.velocity = new THREE.Vector3(0, 0, 0);
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
    this.flying = !this.flying;
    this.velocity.y = 0;
  }

  update(dt: number) {
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

    const sprint = this.keys["ShiftLeft"] || this.keys["ShiftRight"];
    const speed = this.flying ? FLY_SPEED : sprint ? SPRINT_SPEED : WALK_SPEED;

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
      this.velocity.x = moveX;
      this.velocity.z = moveZ;
      let vy = 0;
      if (this.keys["Space"]) vy += FLY_SPEED;
      if (this.keys["ShiftLeft"] || this.keys["ShiftRight"]) vy -= FLY_SPEED;
      // For flying up, sprint should not apply downward. Use Space to ascend.
      // Reset sprint if shift is used for descending
      if (this.keys["Space"]) vy = FLY_SPEED;
      else if (this.keys["ControlLeft"] || this.keys["KeyQ"]) vy = -FLY_SPEED;
      else vy = 0;
      this.velocity.y = vy;
    } else {
      // Horizontal: instant set (arcade-like)
      this.velocity.x = moveX;
      this.velocity.z = moveZ;

      // Jump
      if (this.keys["Space"] && this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }

      // Gravity
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -MAX_FALL) this.velocity.y = -MAX_FALL;
    }

    // Move with collision per-axis
    this.moveAxis("x", this.velocity.x * dt);
    this.moveAxis("y", this.velocity.y * dt);
    this.moveAxis("z", this.velocity.z * dt);

    this.updateCamera();
  }

  private moveAxis(axis: "x" | "y" | "z", amount: number) {
    if (amount === 0) return;
    this.position[axis] += amount;
    this.resolveCollision(axis, amount);
  }

  // Check collision against the world. If colliding, push back along the axis we just moved.
  private resolveCollision(axis: "x" | "y" | "z", amount: number) {
    // Player AABB: width PLAYER_WIDTH (so half = 0.3), height PLAYER_HEIGHT
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
          // Collision detected
          collided = true;
          if (axis === "y") {
            if (amount > 0) {
              // Moving up: hit ceiling
              this.position.y = y - PLAYER_HEIGHT - 0.001;
              this.velocity.y = 0;
            } else {
              // Moving down: hit floor
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
    this.camera.position.set(
      this.position.x,
      this.position.y + EYE_OFFSET,
      this.position.z
    );
    // Build rotation from yaw and pitch (YXZ order)
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  // Raycast for block selection (DDA voxel traversal)
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
    // Direction from yaw/pitch
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
      if (
        y >= 0 && y < WORLD_HEIGHT
      ) {
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
