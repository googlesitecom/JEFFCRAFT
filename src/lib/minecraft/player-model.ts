// Procedural Steve-like player model for rendering remote multiplayer players.
// Since no Steve.glb asset exists, we build a blocky character from Three.js primitives
// that resembles Minecraft's Steve: brown hair, skin face, cyan shirt, blue pants.
import * as THREE from "three";

export class PlayerModel {
  group: THREE.Group;
  // Body parts (for future animation: arm/leg swing)
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  head: THREE.Mesh;
  // Optional name tag (sprite above head)
  nameSprite: THREE.Sprite | null = null;

  constructor(name?: string) {
    this.group = new THREE.Group();

    // === Materials (Steve palette) ===
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xb8845c });
    const skinLightMat = new THREE.MeshLambertMaterial({ color: 0xd4a378 });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x4a3020 });
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0x3a8a8a }); // cyan/teal
    const shirtLightMat = new THREE.MeshLambertMaterial({ color: 0x5aaaaa });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x3a3a6a }); // dark blue
    const pantsLightMat = new THREE.MeshLambertMaterial({ color: 0x5a5a8a });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x4a7aaa });

    // === Head (8x8x8 cube at top) ===
    // Steve's head: 0.5x0.5x0.5 (scaled), positioned at y=1.5
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.set(0, 1.5, 0);
    head.castShadow = true;
    this.head = head;
    this.group.add(head);

    // Hair (top and back of head — slightly larger box)
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.52), hairMat);
    hair.position.set(0, 1.66, -0.02);
    hair.castShadow = true;
    this.group.add(hair);
    // Hair sides (back of head)
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.3, 0.08), hairMat);
    hairBack.position.set(0, 1.55, -0.24);
    this.group.add(hairBack);

    // Eyes (front of head)
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), eyeMat);
    eyeL.position.set(-0.12, 1.5, 0.26);
    this.group.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), eyeMat);
    eyeR.position.set(0.12, 1.5, 0.26);
    this.group.add(eyeR);
    // Pupils
    const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.01), pupilMat);
    pupilL.position.set(-0.1, 1.5, 0.27);
    this.group.add(pupilL);
    const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.01), pupilMat);
    pupilR.position.set(0.14, 1.5, 0.27);
    this.group.add(pupilR);

    // === Body (torso: cyan shirt) ===
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), shirtMat);
    body.position.set(0, 0.95, 0);
    body.castShadow = true;
    this.group.add(body);
    // Shirt highlight (top edge)
    const bodyTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.25), shirtLightMat);
    bodyTop.position.set(0, 1.22, 0);
    this.group.add(bodyTop);

    // === Arms (skin-colored, 0.25 wide) ===
    const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    this.leftArm = new THREE.Mesh(armGeo, skinMat);
    this.leftArm.position.set(-0.35, 0.95, 0);
    this.leftArm.castShadow = true;
    this.group.add(this.leftArm);
    // Left sleeve (top half of arm = shirt color)
    const sleeveL = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.3, 0.21), shirtMat);
    sleeveL.position.set(-0.35, 1.1, 0);
    this.group.add(sleeveL);

    this.rightArm = new THREE.Mesh(armGeo, skinMat);
    this.rightArm.position.set(0.35, 0.95, 0);
    this.rightArm.castShadow = true;
    this.group.add(this.rightArm);
    const sleeveR = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.3, 0.21), shirtMat);
    sleeveR.position.set(0.35, 1.1, 0);
    this.group.add(sleeveR);

    // === Legs (blue pants) ===
    const legGeo = new THREE.BoxGeometry(0.22, 0.65, 0.22);
    this.leftLeg = new THREE.Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.12, 0.32, 0);
    this.leftLeg.castShadow = true;
    this.group.add(this.leftLeg);
    const legHighlightL = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.04, 0.22), pantsLightMat);
    legHighlightL.position.set(-0.12, 0.62, 0);
    this.group.add(legHighlightL);

    this.rightLeg = new THREE.Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.12, 0.32, 0);
    this.rightLeg.castShadow = true;
    this.group.add(this.rightLeg);
    const legHighlightR = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.04, 0.22), pantsLightMat);
    legHighlightR.position.set(0.12, 0.62, 0);
    this.group.add(legHighlightR);

    // === Name tag (sprite above head) ===
    if (name) {
      this.nameSprite = this.createNameSprite(name);
      this.nameSprite.position.set(0, 2.0, 0);
      this.group.add(this.nameSprite);
    }
  }

  private createNameSprite(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    // Background (semi-transparent dark)
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Text
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Shadow
    ctx.fillStyle = "#000";
    ctx.fillText(text, canvas.width / 2 + 2, canvas.height / 2 + 2);
    // Main text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.5, 0.4, 1);
    return sprite;
  }

  // Update pose: position (interpolated), yaw (interpolated), pitch, walk animation
  // Uses lerp for smooth movement — remote players receive 20 Hz updates and we
  // interpolate between them to avoid visible stutter.
  private targetPos = new THREE.Vector3();
  private targetYaw = 0;
  private hasTarget = false;
  private prevPos = new THREE.Vector3();

  update(position: THREE.Vector3, yaw: number, pitch: number, walkAnimTime: number, isMoving: boolean) {
    if (!this.hasTarget) {
      // First update — snap immediately
      this.group.position.copy(position);
      this.group.rotation.y = yaw;
      this.targetPos.copy(position);
      this.targetYaw = yaw;
      this.prevPos.copy(position);
      this.hasTarget = true;
    } else {
      // Store new target
      this.targetPos.copy(position);
      this.targetYaw = yaw;
      // Lerp current position toward target (smooth interpolation)
      this.group.position.lerp(this.targetPos, 0.25);
      // Lerp yaw (handle wraparound)
      let dy = this.targetYaw - this.group.rotation.y;
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      this.group.rotation.y += dy * 0.25;
    }
    // Head pitch (look up/down)
    this.head.rotation.x = Math.max(-0.6, Math.min(0.6, pitch));

    // Walk animation: detect movement by comparing position delta
    const moveDelta = this.targetPos.distanceTo(this.prevPos);
    this.prevPos.copy(this.targetPos);
    const actuallyMoving = isMoving && moveDelta > 0.001;

    if (actuallyMoving) {
      const swing = Math.sin(walkAnimTime) * 0.5;
      this.leftArm.rotation.x = swing;
      this.rightArm.rotation.x = -swing;
      this.leftLeg.rotation.x = -swing;
      this.rightLeg.rotation.x = swing;
    } else {
      // Ease back to neutral
      this.leftArm.rotation.x *= 0.85;
      this.rightArm.rotation.x *= 0.85;
      this.leftLeg.rotation.x *= 0.85;
      this.rightLeg.rotation.x *= 0.85;
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    if (this.nameSprite) {
      (this.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
      (this.nameSprite.material as THREE.SpriteMaterial).dispose();
    }
  }
}
