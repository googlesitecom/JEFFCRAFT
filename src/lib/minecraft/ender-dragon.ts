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

  constructor(world: World, position: THREE.Vector3) {
    this.world = world;
    this.position = position.clone();
    this.loadModel();
  }

  private async loadModel() {
    try {
      const gltf = await gltfLoader.loadAsync("/EnderDragon.glb");
      const model = gltf.scene;
      model.scale.set(2.0, 2.0, 2.0);
      this.model = model;
    } catch (e) {
      console.error("Failed to load EnderDragon.glb:", e);
      // Fallback: large black dragon
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(3, 2, 6),
        new THREE.MeshLambertMaterial({ color: 0x1a1a2a })
      );
      body.position.y = 1;
      group.add(body);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.5, 1.5),
        new THREE.MeshLambertMaterial({ color: 0x1a1a2a })
      );
      head.position.set(0, 1.5, -3.5);
      group.add(head);
      // Eyes (purple)
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xaa00ff });
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat);
      eyeL.position.set(-0.4, 1.7, -4.2);
      group.add(eyeL);
      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat);
      eyeR.position.set(0.4, 1.7, -4.2);
      group.add(eyeR);
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

    // Update model
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.rotation.y = this.yaw;
    }

    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= dt;
    }

    return null;
  }

  distanceTo(x: number, y: number, z: number): number {
    return Math.sqrt(
      (this.position.x - x) ** 2 +
      (this.position.y - y) ** 2 +
      (this.position.z - z) ** 2
    );
  }
}
