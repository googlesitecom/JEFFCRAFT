// Ender Dragon: final boss of the End dimension.
// Loads EnderDragon.glb model. Flies around the central island, attacks the player.
// When defeated, the game is "won" and the dragon drops lots of XP.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World } from "./world";

const gltfLoader = new GLTFLoader();

export class EnderDragon {
  position: THREE.Vector3;
  velocity: THREE.Vector3 = new THREE.Vector3();
  yaw: number = 0;
  health: number = 200;
  maxHealth: number = 200;
  world: World;
  model: THREE.Group | null = null;
  isDead: boolean = false;
  damageFlashTime: number = 0;
  attackTimer: number = 0;
  flightTime: number = 0;
  // Circle pattern around the center
  circleAngle: number = 0;
  circleRadius: number = 30;
  circleHeight: number = 55;
  // Animation mixer for GLB animations (fly, idle, etc.)
  mixer: THREE.AnimationMixer | null = null;
  // Detected wings for procedural flap (fallback if GLB has no animations)
  wingParts: THREE.Object3D[] = [];
  headPart: THREE.Object3D | null = null;
  // Banking/pitch for smooth flight attitude
  prevYaw: number = 0;
  bankAngle: number = 0;

  constructor(world: World, position: THREE.Vector3, scene?: THREE.Scene) {
    this.world = world;
    this.position = position.clone();
    this.loadModel(scene);
  }

  private async loadModel(scene?: THREE.Scene) {
    try {
      const gltf = await gltfLoader.loadAsync("/EnderDragon.glb");
      const model = gltf.scene;
      model.scale.set(2.0, 2.0, 2.0);
      this.model = model;
      // Set up AnimationMixer if the GLB has animations
      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(model);
        // Play all animations (typically "fly", "idle") — fly takes priority
        for (const clip of gltf.animations) {
          const action = this.mixer.clipAction(clip);
          action.play();
        }
      }
      // Detect wing and head parts for procedural animation overlay
      this.detectWingsAndHead();
      // Enable shadows on all meshes
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      // Add to scene if provided (async — model is now ready)
      if (scene) scene.add(this.model);
    } catch (e) {
      console.error("Failed to load EnderDragon.glb:", e);
      // Fallback: large black dragon with simple wings
      const group = new THREE.Group();
      const dragonMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.7 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 6), dragonMat);
      body.position.y = 1;
      body.castShadow = true;
      group.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), dragonMat);
      head.position.set(0, 1.5, -3.5);
      head.castShadow = true;
      group.add(head);
      this.headPart = head;
      // Eyes (purple, glowing)
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xaa00ff, emissive: 0xaa00ff, emissiveIntensity: 2.5
      });
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat);
      eyeL.position.set(-0.4, 1.7, -4.2);
      group.add(eyeL);
      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat);
      eyeR.position.set(0.4, 1.7, -4.2);
      group.add(eyeR);
      // Wings (2 large flat boxes that will flap procedurally)
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.7, side: THREE.DoubleSide });
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 3), wingMat);
      wingL.position.set(-3, 2, 0);
      wingL.castShadow = true;
      group.add(wingL);
      this.wingParts.push(wingL);
      const wingR = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 3), wingMat);
      wingR.position.set(3, 2, 0);
      wingR.castShadow = true;
      group.add(wingR);
      this.wingParts.push(wingR);
      this.model = group;
      if (scene) scene.add(this.model);
    }
  }

  // Detect wing and head meshes by name for procedural flap/look animations
  private detectWingsAndHead() {
    if (!this.model) return;
    this.wingParts = [];
    this.headPart = null;
    this.model.traverse((obj) => {
      const name = obj.name.toLowerCase();
      if (obj instanceof THREE.Mesh) {
        if (name.includes("wing") || name.includes("arm")) {
          this.wingParts.push(obj);
        } else if (name.includes("head") || name.includes("neck")) {
          if (this.headPart === null) this.headPart = obj;
        }
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

  knockback(_fromX: number, _fromZ: number, _strength: number = 3) {
    // Dragon is too big to knock back
  }

  getDrops(): { id: number; count: number }[] {
    // Dragon drops lots of XP (handled by caller)
    return [];
  }

  getXpDrop(): number {
    return 500; // massive XP for killing the dragon
  }

  update(dt: number, playerX: number, playerY: number, playerZ: number): { damage: number } | null {
    if (this.isDead) return null;
    this.flightTime += dt;

    // Circle around the center island, occasionally diving at the player
    this.circleAngle += dt * 0.3;
    const targetX = Math.cos(this.circleAngle) * this.circleRadius;
    const targetZ = Math.sin(this.circleAngle) * this.circleRadius;
    const targetY = this.circleHeight + Math.sin(this.flightTime * 0.5) * 5;

    // Smooth movement toward target
    this.position.x += (targetX - this.position.x) * dt * 1.5;
    this.position.y += (targetY - this.position.y) * dt * 1.5;
    this.position.z += (targetZ - this.position.z) * dt * 1.5;

    // Face direction of movement
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.001) {
      this.yaw = Math.atan2(-dx, -dz);
    }

    // Attack: dragon breath (damage when close)
    this.attackTimer -= dt;
    const distToPlayer = Math.sqrt(
      (this.position.x - playerX) ** 2 +
      (this.position.y - playerY) ** 2 +
      (this.position.z - playerZ) ** 2
    );
    if (distToPlayer < 8 && this.attackTimer <= 0) {
      this.attackTimer = 1.5;
      return { damage: 6 };
    }

    // Update animation mixer (GLB clips)
    if (this.mixer) this.mixer.update(dt);

    // Update model
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.rotation.y = this.yaw;

      // === PROCEDURAL FLIGHT ANIMATION OVERLAY ===
      // Banking: tilt based on yaw change rate
      const yawDelta = this.yaw - this.prevYaw;
      this.prevYaw = this.yaw;
      // Smooth bank
      this.bankAngle += (yawDelta * 1.5 - this.bankAngle) * 0.1;
      this.model.rotation.z = -this.bankAngle;
      // Pitch up/down with vertical velocity
      const vy = (targetY - this.position.y) * 1.5;
      this.model.rotation.x = -vy * 0.05;

      // === WING FLAP (if no AnimationMixer or as overlay) ===
      if (this.wingParts.length > 0) {
        const flap = Math.sin(this.flightTime * 4) * 0.6;
        for (let i = 0; i < this.wingParts.length; i++) {
          // Alternate wings: left wing flaps +z, right wing -z (or up/down depending on orientation)
          const sign = (i % 2 === 0) ? 1 : -1;
          this.wingParts[i].rotation.z = flap * sign;
        }
      }

      // === HEAD TRACKING ===
      if (this.headPart) {
        // Look toward player
        const dxh = playerX - this.position.x;
        const dyh = playerY - this.position.y;
        const dzh = playerZ - this.position.z;
        const distH = Math.sqrt(dxh * dxh + dzh * dzh);
        if (distH > 0.001) {
          // Subtle head yaw toward player (limited)
          const targetHeadYaw = Math.atan2(-dxh, -dzh) - this.yaw;
          // Normalize and clamp
          let hyd = targetHeadYaw;
          while (hyd > Math.PI) hyd -= Math.PI * 2;
          while (hyd < -Math.PI) hyd += Math.PI * 2;
          this.headPart.rotation.y = Math.max(-0.5, Math.min(0.5, hyd));
          this.headPart.rotation.x = Math.max(-0.3, Math.min(0.3, dyh * 0.05));
        }
      }
    }

    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= dt;
      this.applyTint(0.8, 0.2, 0.8);
    } else {
      this.applyTint(0, 0, 0);
    }

    return null;
  }

  // Apply tint (for damage flash)
  private applyTint(r: number, g: number, b: number) {
    if (!this.model) return;
    this.model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat && mat.emissive) {
          mat.emissive.setRGB(r, g, b);
        }
      }
    });
  }

  distanceTo(x: number, y: number, z: number): number {
    return Math.sqrt(
      (this.position.x - x) ** 2 +
      (this.position.y - y) ** 2 +
      (this.position.z - z) ** 2
    );
  }

  dispose() {
    if (this.model) {
      this.model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          (obj.material as THREE.Material)?.dispose();
        }
      });
      // Remove from parent scene
      if (this.model.parent) this.model.parent.remove(this.model);
      this.model = null;
    }
    if (this.mixer) this.mixer = null;
  }
}
