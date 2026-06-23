// First-person hand view: Minecraft-style 3D arm (no fingers, just a thick skin-colored block).
// Based on reference image: a simple 3D rectangular arm coming from the bottom-right corner,
// skin-toned, with subtle shading. No individual fingers or knuckles.
// Tools are rendered as 3D models (handle + head) held in front of the hand.
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
  pivot: THREE.Group;
  itemPivot: THREE.Group;
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

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff0e0, 0.45);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0xa0c0ff, 0.2);
    fill.position.set(-2, -3, 3);
    this.scene.add(fill);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.itemPivot = new THREE.Group();
    this.pivot.add(this.itemPivot);

    this.buildHand();
  }

  private buildHand() {
    // Minecraft-style first-person arm: a single thick 3D block, skin-toned, no fingers.
    // Colors based on the reference image: warm tan/skin tone (~#92654E).
    const skinMat = new THREE.MeshLambertMaterial({ color: 0x92654e });
    const skinLightMat = new THREE.MeshLambertMaterial({ color: 0xb07d62 });
    const skinDarkMat = new THREE.MeshLambertMaterial({ color: 0x6e4a38 });

    const armW = 0.28;
    const armH = 0.7;
    const armD = 0.28;
    const off = 0.005; // offset to prevent z-fighting

    // Main arm block (skin colored)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, armD), skinMat);
    arm.position.set(0, -0.15, 0);
    this.pivot.add(arm);

    // Highlight on the left side (offset outward)
    const leftHighlight = new THREE.Mesh(new THREE.BoxGeometry(0.012, armH - 0.02, armD - 0.02), skinLightMat);
    leftHighlight.position.set(-armW / 2 - off, -0.15, 0);
    this.pivot.add(leftHighlight);

    // Highlight on top
    const topHighlight = new THREE.Mesh(new THREE.BoxGeometry(armW - 0.02, 0.012, armD - 0.02), skinLightMat);
    topHighlight.position.set(0, -0.15 + armH / 2 + off, 0);
    this.pivot.add(topHighlight);

    // Shadow on right side
    const rightShadow = new THREE.Mesh(new THREE.BoxGeometry(0.012, armH - 0.02, armD - 0.02), skinDarkMat);
    rightShadow.position.set(armW / 2 + off, -0.15, 0);
    this.pivot.add(rightShadow);

    // Shadow on bottom
    const bottomShadow = new THREE.Mesh(new THREE.BoxGeometry(armW - 0.02, 0.012, armD - 0.02), skinDarkMat);
    bottomShadow.position.set(0, -0.15 - armH / 2 - off, 0);
    this.pivot.add(bottomShadow);

    // Fist cap at the top (lighter shade, slightly forward)
    const fistCap = new THREE.Mesh(new THREE.BoxGeometry(armW - 0.01, 0.14, armD - 0.01), skinLightMat);
    fistCap.position.set(0, -0.15 + armH / 2 - 0.07, 0.002);
    this.pivot.add(fistCap);

    // Position: bottom-right corner, angled like Minecraft first-person
    this.pivot.position.set(1.2, -0.75, 0);
    this.pivot.rotation.x = 0.3;
    this.pivot.rotation.y = -0.6;
    this.pivot.rotation.z = 0.1;
    this.pivot.scale.set(1.2, 1.2, 1.2);
  }

  updateItem(itemId: number | null) {
    if (itemId === this.currentItem) return;
    this.currentItem = itemId;

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
      const def = BLOCKS[itemId as BlockType];
      if (!def) return;
      const mat = new THREE.MeshLambertMaterial({ map: this.atlas.texture });
      const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
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
      mesh.position.set(0, 0.1, -0.16);
      this.itemPivot.add(mesh);
    } else {
      const def = ITEMS[itemId as ItemType];
      if (!def) return;

      if (def.toolType) {
        const toolMesh = this.buildToolModel(def.toolType, def.toolTier || "wood");
        if (toolMesh) {
          toolMesh.position.set(0, 0.07, -0.16);
          toolMesh.rotation.x = -1.1;
          toolMesh.rotation.y = -0.2;
          this.itemPivot.add(toolMesh);
          return;
        }
      }

      const tile = this.atlas.tiles[def.icon];
      const mat = new THREE.MeshLambertMaterial({
        map: this.atlas.texture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide,
      });
      const geo = new THREE.PlaneGeometry(0.22, 0.22);
      if (tile) {
        const uvs = geo.attributes.uv;
        uvs.setXY(0, tile.u0, tile.v1);
        uvs.setXY(1, tile.u1, tile.v1);
        uvs.setXY(2, tile.u0, tile.v0);
        uvs.setXY(3, tile.u1, tile.v0);
        uvs.needsUpdate = true;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.1, -0.16);
      this.itemPivot.add(mesh);
    }
  }

  private buildToolModel(toolType: ToolType | undefined, tier: string): THREE.Group | null {
    if (!toolType) return null;
    const group = new THREE.Group();

    const tierColors: Record<string, number> = {
      wood: 0x8b6638,
      stone: 0x7d7d7d,
      iron: 0xe8e8e8,
      diamond: 0x4ee0e0,
      gold: 0xfdd848,
    };
    const headColor = tierColors[tier] || 0x8b6638;
    const handleColor = 0x8a5a2a;
    const handleLightColor = 0xa87038;
    const handleMat = new THREE.MeshLambertMaterial({ color: handleColor });
    const handleLightMat = new THREE.MeshLambertMaterial({ color: handleLightColor });
    const headMat = new THREE.MeshLambertMaterial({ color: headColor });
    const headShadeMat = new THREE.MeshLambertMaterial({ color: this.darken(headColor, 0.35) });
    const headLightMat = new THREE.MeshLambertMaterial({ color: this.lighten(headColor, 0.2) });

    if (toolType === "pickaxe") {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.03), handleMat);
      handle.position.set(0, 0, 0);
      group.add(handle);
      const handleHL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.22, 0.008), handleLightMat);
      handleHL.position.set(-0.011, 0, 0);
      group.add(handleHL);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), headMat);
      head.position.set(0, 0.12, 0);
      group.add(head);
      const headHL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.008, 0.04), headLightMat);
      headHL.position.set(0, 0.143, 0);
      group.add(headHL);
      const leftTip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.045), headShadeMat);
      leftTip.position.set(-0.095, 0.115, 0);
      leftTip.rotation.z = 0.2;
      group.add(leftTip);
      const rightTip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.045), headShadeMat);
      rightTip.position.set(0.095, 0.115, 0);
      rightTip.rotation.z = -0.2;
      group.add(rightTip);
      const binding = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.035), handleMat);
      binding.position.set(0, 0.1, 0);
      group.add(binding);
    } else if (toolType === "axe") {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.03), handleMat);
      handle.position.set(0, 0, 0);
      group.add(handle);
      const handleHL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.22, 0.008), handleLightMat);
      handleHL.position.set(-0.011, 0, 0);
      group.add(handleHL);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.045), headMat);
      head.position.set(0.045, 0.11, 0);
      group.add(head);
      const headHL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.045), headLightMat);
      headHL.position.set(0.045, 0.15, 0);
      group.add(headHL);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.08, 0.046), headLightMat);
      edge.position.set(0.1, 0.11, 0);
      group.add(edge);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.045), headShadeMat);
      tip.position.set(0.095, 0.065, 0);
      group.add(tip);
      const binding = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.035), handleMat);
      binding.position.set(0, 0.1, 0);
      group.add(binding);
    } else if (toolType === "sword") {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.028), handleMat);
      handle.position.set(0, -0.06, 0);
      group.add(handle);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.04), handleMat);
      guard.position.set(0, -0.02, 0);
      group.add(guard);
      const guardHL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.04), handleLightMat);
      guardHL.position.set(0, -0.012, 0);
      group.add(guardHL);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.018), headMat);
      blade.position.set(0, 0.12, 0);
      group.add(blade);
      const bladeHL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.26, 0.018), headLightMat);
      bladeHL.position.set(-0.012, 0.12, 0);
      group.add(bladeHL);
      const bladeShadow = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.26, 0.018), headShadeMat);
      bladeShadow.position.set(0.012, 0.12, 0);
      group.add(bladeShadow);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.019), headShadeMat);
      tip.position.set(0, 0.275, 0);
      group.add(tip);
    } else if (toolType === "shovel") {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.03), handleMat);
      handle.position.set(0, 0, 0);
      group.add(handle);
      const handleHL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.22, 0.008), handleLightMat);
      handleHL.position.set(-0.011, 0, 0);
      group.add(handleHL);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.035), headMat);
      head.position.set(0, 0.13, 0);
      group.add(head);
      const headHL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.035), headLightMat);
      headHL.position.set(-0.005, 0.165, 0);
      group.add(headHL);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.018, 0.036), headShadeMat);
      edge.position.set(0, 0.095, 0);
      group.add(edge);
      const leftShadow = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.034), headShadeMat);
      leftShadow.position.set(-0.038, 0.12, 0);
      group.add(leftShadow);
      const binding = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.035), handleMat);
      binding.position.set(0, 0.1, 0);
      group.add(binding);
    }

    return group;
  }

  private darken(color: number, amount: number): number {
    const r = Math.max(0, Math.floor(((color >> 16) & 0xff) * (1 - amount)));
    const g = Math.max(0, Math.floor(((color >> 8) & 0xff) * (1 - amount)));
    const b = Math.max(0, Math.floor((color & 0xff) * (1 - amount)));
    return (r << 16) | (g << 8) | b;
  }

  private lighten(color: number, amount: number): number {
    const r = Math.min(255, Math.floor(((color >> 16) & 0xff) + 255 * amount));
    const g = Math.min(255, Math.floor(((color >> 8) & 0xff) + 255 * amount));
    const b = Math.min(255, Math.floor((color & 0xff) + 255 * amount));
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
        extraRotX = -e * 0.6;
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

    this.pivot.rotation.x = 0.3 + extraRotX;
    this.pivot.rotation.y = -0.6;
    this.pivot.rotation.z = 0.1 + extraRotZ;
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
