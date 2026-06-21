// Dragon pet: loaded from Dragon.glb, can be mounted and flown in third-person.
// Mount/dismount with M key. Dragon follows player when not mounted.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, isSolid } from "./blocks";

const DRAGON_MODEL_PATH = "/Dragon.glb";
// Scale tuned to feel like a big rideable Minecraft dragon (about 4 blocks long).
// The base Dragon.glb model is roughly 6 units long, so 0.7 scale ≈ 4 blocks.
const DRAGON_SCALE = 0.7;
// How high the player sits above the dragon's feet when mounted
const RIDER_EYE_HEIGHT = 3.5;

const DRAGON_FLY_SPEED = 18;       // blocks per second
const DRAGON_TURN_RATE = 2.2;      // radians per second
const DRAGON_VERTICAL_SPEED = 10;  // blocks per second up/down
const GRAVITY = 12;                // when not flying actively (used to settle on ground)

export class DragonPet {
  world: World;
  scene: THREE.Scene;
  model: THREE.Group | null = null;
  modelLoaded: boolean = false;
  position: THREE.Vector3;
  velocity: THREE.Vector3 = new THREE.Vector3();
  yaw: number = 0;
  pitch: number = 0;
  mixer: THREE.AnimationMixer | null = null;
  flyAction: THREE.AnimationAction | null = null;
  isMounted: boolean = false;
  // Visual bobbing during flight
  private flightTime: number = 0;

  constructor(world: World, scene: THREE.Scene, position: THREE.Vector3) {
    this.world = world;
    this.scene = scene;
    this.position = position.clone();
    this.loadModel();
  }

  private async loadModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(DRAGON_MODEL_PATH);
      const model = gltf.scene;
      model.scale.set(DRAGON_SCALE, DRAGON_SCALE, DRAGON_SCALE);
      // The model's "forward" axis is -Z by Three.js convention; we may need to rotate it.
      // After testing, this orientation looks right.
      this.model = model;

      // Setup animation mixer
      if (gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(model);
        const flyClip = gltf.animations.find((a) => a.name === "fly") || gltf.animations[0];
        this.flyAction = this.mixer.clipAction(flyClip);
        this.flyAction.play();
      }

      // Improve materials (enable shadows look)
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.frustumCulled = false;
          const mat = o.material as THREE.MeshStandardMaterial;
          if (mat && mat.map) {
            mat.map.magFilter = THREE.NearestFilter;
            mat.map.minFilter = THREE.NearestFilter;
            mat.map.needsUpdate = true;
          }
        }
      });

      this.scene.add(model);
      this.modelLoaded = true;
    } catch (e) {
      console.error("Failed to load Dragon.glb:", e);
      // Fallback: simple box
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1, 3),
        new THREE.MeshLambertMaterial({ color: 0x4a2a8a })
      );
      body.position.y = 1;
      group.add(body);
      this.model = group;
      this.scene.add(group);
      this.modelLoaded = true;
    }
  }

  // Toggle mount state. Returns true if now mounted.
  toggleMount(playerPos: THREE.Vector3): boolean {
    if (this.isMounted) {
      // Dismount: drop player off near the dragon
      this.isMounted = false;
      return false;
    } else {
      // Mount: teleport dragon to be just under the player so the camera doesn't jump
      this.position.set(playerPos.x, playerPos.y - 1, playerPos.z);
      this.velocity.set(0, 0, 0);
      this.isMounted = true;
      return true;
    }
  }

  // Update the dragon. When mounted, playerInput drives it.
  // Returns the eye position + yaw/pitch for the camera when mounted.
  update(
    dt: number,
    playerPos: THREE.Vector3,
    keys: Record<string, boolean>,
    cameraYaw: number,
    cameraPitch: number
  ): { eyeX: number; eyeY: number; eyeZ: number; yaw: number; pitch: number } | null {
    // Always update animation
    if (this.mixer) this.mixer.update(dt);
    this.flightTime += dt;

    if (this.isMounted) {
      // === Mounted: dragon follows camera direction ===
      this.yaw = cameraYaw;
      this.pitch = cameraPitch;

      // Forward direction in XZ plane based on yaw
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

      let moveX = 0;
      let moveZ = 0;
      if (keys["KeyW"]) { moveX += forward.x; moveZ += forward.z; }
      if (keys["KeyS"]) { moveX -= forward.x; moveZ -= forward.z; }
      if (keys["KeyD"]) { moveX += right.x; moveZ += right.z; }
      if (keys["KeyA"]) { moveX -= right.x; moveZ -= right.z; }

      const moveLen = Math.hypot(moveX, moveZ);
      let vy = 0;
      if (keys["Space"]) vy = DRAGON_VERTICAL_SPEED;
      else if (keys["ControlLeft"] || keys["KeyQ"] || keys["ShiftLeft"]) vy = -DRAGON_VERTICAL_SPEED;

      if (moveLen > 0) {
        moveX = (moveX / moveLen) * DRAGON_FLY_SPEED;
        moveZ = (moveZ / moveLen) * DRAGON_FLY_SPEED;
      }

      // Smooth velocity transitions (feels more "dragon-like" than instant)
      this.velocity.x += (moveX - this.velocity.x) * Math.min(1, dt * 4);
      this.velocity.z += (moveZ - this.velocity.z) * Math.min(1, dt * 4);
      this.velocity.y += (vy - this.velocity.y) * Math.min(1, dt * 6);

      // Move with simple collision (don't fly through ground)
      this.moveAxis("x", this.velocity.x * dt);
      this.moveAxis("y", this.velocity.y * dt);
      this.moveAxis("z", this.velocity.z * dt);

      // Keep above Y=0 (don't fly into the void)
      if (this.position.y < 1) {
        this.position.y = 1;
        this.velocity.y = 0;
      }
      // Keep below world height
      if (this.position.y > WORLD_HEIGHT - 5) {
        this.position.y = WORLD_HEIGHT - 5;
        this.velocity.y = 0;
      }

      // Update model
      if (this.model) {
        this.model.position.copy(this.position);
        // Face direction of yaw. In Three.js the forward axis is -Z by convention,
        // but the Dragon.glb model's "forward" (head) actually points to +Z,
        // so we add Math.PI to make the head face the direction of motion.
        // Forward direction used for movement is (-sin(yaw), 0, -cos(yaw)).
        // For the head to face the same way: rotate yaw + Math.PI.
        // NOTE: Testing showed the model was flying backwards (head away from camera),
        // so we use yaw WITHOUT the +Math.PI offset. This makes the head point forward.
        this.model.rotation.set(0, this.yaw, 0);
        // Bank into turns (roll left/right based on lateral velocity)
        const lateralDir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
        const bankAmount = lateralDir.dot(right) / Math.max(1, DRAGON_FLY_SPEED);
        this.model.rotation.z = -bankAmount * 0.3;
        // Pitch up/down based on vertical velocity (dive/climb feel)
        this.model.rotation.x = -(this.velocity.y / DRAGON_VERTICAL_SPEED) * 0.25;
        // Subtle wing bobbing (visual flourish on top of GLB animation)
        this.model.position.y += Math.sin(this.flightTime * 4) * 0.08;
      }

      // Third-person camera: positioned behind and above the dragon, looking forward
      // Forward direction in full 3D (including pitch)
      const forward3D = new THREE.Vector3(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch)
      );
      // Camera distance behind the dragon
      const camDist = 7;
      const camHeight = 2.5;
      const eyeX = this.position.x - forward3D.x * camDist;
      const eyeY = this.position.y + camHeight - forward3D.y * camDist;
      const eyeZ = this.position.z - forward3D.z * camDist;
      return { eyeX, eyeY, eyeZ, yaw: this.yaw, pitch: this.pitch };
    } else {
      // === Not mounted: dragon follows player by flying ===
      const dx = playerPos.x - this.position.x;
      const dy = playerPos.y - this.position.y;
      const dz = playerPos.z - this.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > 4) {
        // Fly toward the player
        const speed = Math.min(DRAGON_FLY_SPEED * 0.7, dist * 1.5);
        this.velocity.x = (dx / dist) * speed;
        this.velocity.y = (dy / dist) * speed;
        this.velocity.z = (dz / dist) * speed;
        // Face direction of motion
        this.yaw = Math.atan2(-dx, -dz);
      } else {
        // Hover near the player
        this.velocity.multiplyScalar(0.8);
        // Gentle hover bob
        this.velocity.y = Math.sin(this.flightTime * 2) * 0.8;
      }

      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.z += this.velocity.z * dt;

      if (this.position.y < 2) this.position.y = 2;
      if (this.position.y > WORLD_HEIGHT - 5) this.position.y = WORLD_HEIGHT - 5;

      if (this.model) {
        this.model.position.copy(this.position);
        // Same orientation fix as mounted mode: head faces direction of motion
        this.model.rotation.set(0, this.yaw, 0);
        this.model.position.y += Math.sin(this.flightTime * 4) * 0.08;
      }
      return null;
    }
  }

  private moveAxis(axis: "x" | "y" | "z", amount: number) {
    if (amount === 0) return;
    this.position[axis] += amount;
    // Skip collision for now - dragons fly through everything (simpler, more fun)
  }

  dispose() {
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const mat = o.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      this.model = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
  }
}

export class DragonManager {
  world: World;
  scene: THREE.Scene;
  dragons: DragonPet[] = [];

  constructor(world: World, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
  }

  spawn(x: number, y: number, z: number): DragonPet {
    const dragon = new DragonPet(this.world, this.scene, new THREE.Vector3(x, y, z));
    this.dragons.push(dragon);
    return dragon;
  }

  // Get the first tamed dragon (only one allowed per player for simplicity)
  getActiveDragon(): DragonPet | null {
    return this.dragons[0] || null;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    keys: Record<string, boolean>,
    cameraYaw: number,
    cameraPitch: number
  ): { eyeX: number; eyeY: number; eyeZ: number; yaw: number; pitch: number } | null {
    let camResult: { eyeX: number; eyeY: number; eyeZ: number; yaw: number; pitch: number } | null = null;
    for (const dragon of this.dragons) {
      const r = dragon.update(dt, playerPos, keys, cameraYaw, cameraPitch);
      if (r && dragon.isMounted) camResult = r;
    }
    return camResult;
  }

  dispose() {
    for (const dragon of this.dragons) dragon.dispose();
    this.dragons = [];
  }
}
