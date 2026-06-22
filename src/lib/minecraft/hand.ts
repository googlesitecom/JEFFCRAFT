// First-person hand view: Minecraft-style hand at bottom-right
// Tools are rendered as 3D models (handle + head) instead of flat sprites.
import * as THREE from "three";
import { BlockType, BLOCKS } from "./blocks";
import { ItemType, ITEMS, ToolType } from "./items";
import { TextureAtlas } from "./atlas";

export type HandAction = "idle" | "swing" | "eat" | "place" | "break";

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class HandView {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  pivot: THREE.Group;        // The hand + arm pivot (for swing animations)
  itemPivot: THREE.Group;    // The held item pivot (positioned in front of hand)
  atlas: TextureAtlas;
  action: HandAction = "idle";
  actionTime: number = 0;
  idleTime: number = 0;
  currentItem: number | null = null;

  constructor(atlas: TextureAtlas) {
    this.atlas = atlas;
    this.scene = new THREE.Scene();
    const aspect = 16 / 9;
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff0e0, 0.55);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);
    // Fill light from below for softer shading
    const fill = new THREE.DirectionalLight(0xa0c0ff, 0.25);
    fill.position.set(-2, -3, 3);
    this.scene.add(fill);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.itemPivot = new THREE.Group();
    this.pivot.add(this.itemPivot);

    this.buildHand();
  }

  private buildHand() {
    // Minecraft-style first-person hand: arm comes from bottom-right of screen.
    // Skin tones
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b896 });
    const skinShadeMat = new THREE.MeshLambertMaterial({ color: 0xc89878 });
    const skinHighlightMat = new THREE.MeshLambertMaterial({ color: 0xf8c8a6 });
    // Sleeve (Steve-style teal shirt)
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x4a8a8a });
    const sleeveShadeMat = new THREE.MeshLambertMaterial({ color: 0x3a6a6a });

    // === Arm (sleeve) === — comes from below screen, going up to wrist
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.14), sleeveMat);
    arm.position.set(0, -0.25, 0);
    this.pivot.add(arm);
    // Sleeve shading: darker bottom edge
    const armShade = new THREE.Mesh(new THREE.BoxGeometry(0.141, 0.06, 0.141), sleeveShadeMat);
    armShade.position.set(0, -0.42, 0);
    this.pivot.add(armShade);

    // Cuff (where sleeve meets hand)
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.15), sleeveShadeMat);
    cuff.position.set(0, -0.06, 0);
    this.pivot.add(cuff);

    // === Wrist ===
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.12), skinShadeMat);
    wrist.position.set(0, -0.02, 0);
    this.pivot.add(wrist);

    // === Palm === — main visible block, we see the back (dorsal view)
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.11), skinMat);
    palm.position.set(0, 0.06, 0);
    this.pivot.add(palm);
    // Palm highlight on top edge
    const palmHighlight = new THREE.Mesh(new THREE.BoxGeometry(0.141, 0.02, 0.111), skinHighlightMat);
    palmHighlight.position.set(0, 0.13, 0);
    this.pivot.add(palmHighlight);

    // === Knuckles === — bumps on the back of the hand
    const knuckleMat = skinShadeMat;
    for (let i = 0; i < 4; i++) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.025, 0.06), knuckleMat);
      k.position.set(-0.045 + i * 0.03, 0.13, -0.02);
      this.pivot.add(k);
    }

    // === Fingers === — pointing forward into screen (-Z)
    // Index, middle, ring, pinky
    const fingerMat = skinMat;
    const fingerLen = [0.07, 0.075, 0.065, 0.055]; // middle longest
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(
        new THREE.BoxGeometry(0.024, fingerLen[i], 0.05),
        fingerMat
      );
      f.position.set(-0.045 + i * 0.03, 0.16 + fingerLen[i] / 2 - 0.04, -0.02);
      this.pivot.add(f);
      // Fingertip (slightly darker)
      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.015, 0.051),
        skinShadeMat
      );
      tip.position.set(-0.045 + i * 0.03, 0.16 + fingerLen[i] - 0.04, -0.02);
      this.pivot.add(tip);
    }

    // === Thumb === — on the right side, angled
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.045), skinMat);
    thumb.position.set(0.085, 0.07, 0.01);
    thumb.rotation.z = -0.7;
    thumb.rotation.y = 0.3;
    this.pivot.add(thumb);
    // Thumb tip
    const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.046), skinShadeMat);
    thumbTip.position.set(0.11, 0.11, 0.015);
    thumbTip.rotation.z = -0.7;
    thumbTip.rotation.y = 0.3;
    this.pivot.add(thumbTip);

    // Position: bottom-right corner, angled so we see the back/top of hand
    this.pivot.position.set(0.85, -0.55, 0);
    this.pivot.rotation.x = 0.35;
    this.pivot.rotation.y = -0.45;
    this.pivot.rotation.z = 0.05;
    this.pivot.scale.set(1.0, 1.0, 1.0);
  }

  updateItem(itemId: number | null) {
    if (itemId === this.currentItem) return;
    this.currentItem = itemId;

    // Clear previous item
    while (this.itemPivot.children.length > 0) {
      const child = this.itemPivot.children[0];
      this.itemPivot.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }

    if (itemId === null || itemId === undefined) return;

    if (itemId < 100) {
      // === Block: render as 3D cube ===
      const def = BLOCKS[itemId as BlockType];
      if (!def) return;
      const mat = new THREE.MeshLambertMaterial({ map: this.atlas.texture });
      const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const tile = this.atlas.tiles[def.textures.side] || this.atlas.tiles[def.textures.top];
      if (tile) {
        const uvs = geo.attributes.uv;
        const topTile = this.atlas.tiles[def.textures.top];
        const bottomTile = this.atlas.tiles[def.textures.bottom];
        const faces = [tile, tile, topTile || tile, bottomTile || tile, tile, tile];
        for (let f = 0; f < 6; f++) {
          const base = f * 4;
          uvs.setXY(base + 0, faces[f].u0, faces[f].v1);
          uvs.setXY(base + 1, faces[f].u1, faces[f].v1);
          uvs.setXY(base + 2, faces[f].u0, faces[f].v0);
          uvs.setXY(base + 3, faces[f].u1, faces[f].v0);
        }
        uvs.needsUpdate = true;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.08, -0.14);
      this.itemPivot.add(mesh);
    } else {
      const def = ITEMS[itemId as ItemType];
      if (!def) return;

      // === Tools: render as 3D model (handle + head) ===
      if (def.toolType) {
        const toolMesh = this.buildToolModel(def.toolType, def.toolTier || "wood");
        if (toolMesh) {
          toolMesh.position.set(0, 0.05, -0.14);
          // Angle the tool so the handle is in the hand and head points forward
          toolMesh.rotation.x = -1.1;
          toolMesh.rotation.y = -0.2;
          this.itemPivot.add(toolMesh);
          return;
        }
      }

      // === Food / materials: render as flat sprite (billboard) ===
      const tile = this.atlas.tiles[def.icon];
      const mat = new THREE.MeshLambertMaterial({
        map: this.atlas.texture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide,
      });
      const geo = new THREE.PlaneGeometry(0.2, 0.2);
      if (tile) {
        const uvs = geo.attributes.uv;
        uvs.setXY(0, tile.u0, tile.v1);
        uvs.setXY(1, tile.u1, tile.v1);
        uvs.setXY(2, tile.u0, tile.v0);
        uvs.setXY(3, tile.u1, tile.v0);
        uvs.needsUpdate = true;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.08, -0.14);
      this.itemPivot.add(mesh);
    }
  }

  // Build a 3D tool model: handle (stick) + head (colored box with texture per tier)
  private buildToolModel(toolType: ToolType | undefined, tier: string): THREE.Group | null {
    if (!toolType) return null;
    const group = new THREE.Group();

    // Tier colors for the tool head
    const tierColors: Record<string, number> = {
      wood: 0x8b6a3a,
      stone: 0x888888,
      iron: 0xe0e0e0,
      diamond: 0x5edcdc,
      gold: 0xffdd44,
    };
    const headColor = tierColors[tier] || 0x8b6a3a;
    const handleColor = 0x6e4d28; // brown stick
    const handleMat = new THREE.MeshLambertMaterial({ color: handleColor });
    const headMat = new THREE.MeshLambertMaterial({ color: headColor });
    const headShadeMat = new THREE.MeshLambertMaterial({ color: this.darken(headColor, 0.3) });

    // Handle (vertical stick)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.2, 0.025), handleMat);
    handle.position.set(0, 0, 0);
    group.add(handle);

    if (toolType === "pickaxe") {
      // Pickaxe head: a horizontal bar across the top of the handle
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), headMat);
      head.position.set(0, 0.1, 0);
      group.add(head);
      // Pointed ends (darker)
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.045), headShadeMat);
      left.position.set(-0.08, 0.1, 0);
      group.add(left);
      const right = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.045), headShadeMat);
      right.position.set(0.08, 0.1, 0);
      group.add(right);
    } else if (toolType === "axe") {
      // Axe head: a box on one side of the top
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.04), headMat);
      head.position.set(0.04, 0.1, 0);
      group.add(head);
      // Blade edge (lighter)
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.041), headShadeMat);
      edge.position.set(0.09, 0.1, 0);
      group.add(edge);
    } else if (toolType === "sword") {
      // Sword: long blade going up from the handle
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.015), headMat);
      blade.position.set(0, 0.13, 0);
      group.add(blade);
      // Blade tip (darker point)
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.03, 0.016), headShadeMat);
      tip.position.set(0, 0.25, 0);
      group.add(tip);
      // Crossguard
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.04), handleMat);
      guard.position.set(0, 0.02, 0);
      group.add(guard);
    } else if (toolType === "shovel") {
      // Shovel: a square blade at the top of the handle
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), headMat);
      head.position.set(0, 0.11, 0);
      group.add(head);
      // Blade edge
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.061, 0.015, 0.031), headShadeMat);
      edge.position.set(0, 0.075, 0);
      group.add(edge);
    }

    return group;
  }

  private darken(color: number, amount: number): number {
    const r = Math.max(0, Math.floor(((color >> 16) & 0xff) * (1 - amount)));
    const g = Math.max(0, Math.floor(((color >> 8) & 0xff) * (1 - amount)));
    const b = Math.max(0, Math.floor((color & 0xff) * (1 - amount)));
    return (r << 16) | (g << 8) | b;
  }

  triggerAction(action: HandAction) {
    this.action = action;
    this.actionTime = 0;
  }

  update(dt: number) {
    this.idleTime += dt;
    this.actionTime += dt;

    let extraRotX = 0, extraRotZ = 0, itemOffsetZ = 0, itemOffsetY = 0;

    if (this.action === "swing") {
      const t = this.actionTime / 0.35;
      if (t >= 1) { this.action = "idle"; }
      else {
        const s = Math.sin(t * Math.PI);
        const e = easeInOutCubic(s);
        extraRotX = -e * 0.6; // swing down
      }
    } else if (this.action === "place") {
      const t = this.actionTime / 0.3;
      if (t >= 1) { this.action = "idle"; }
      else {
        const s = Math.sin(t * Math.PI);
        extraRotX = -s * 0.4;
        itemOffsetZ = -s * 0.08;
      }
    } else if (this.action === "eat") {
      const t = this.actionTime / 1.7;
      if (t >= 1) { this.action = "idle"; }
      else {
        const bite = Math.sin(t * Math.PI * 6);
        const biteAmount = Math.max(0, bite);
        itemOffsetZ = biteAmount * 0.1;
        itemOffsetY = -biteAmount * 0.05;
        extraRotX = -biteAmount * 0.15;
      }
    } else {
      extraRotX = Math.sin(this.idleTime * 1.2) * 0.01;
      extraRotZ = Math.sin(this.idleTime * 0.7) * 0.005;
    }

    this.pivot.rotation.x = 0.35 + extraRotX;
    this.pivot.rotation.y = -0.45;
    this.pivot.rotation.z = 0.05 + extraRotZ;
    this.itemPivot.position.set(0, itemOffsetY, itemOffsetZ);
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }

  dispose() {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}
