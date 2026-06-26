// First-person hand view: Minecraft-style 3D arm (no fingers, just a thick skin-colored block).
// Based on reference image: a simple 3D rectangular arm coming from the bottom-right corner,
// skin-toned, with subtle shading. No individual fingers or knuckles.
// Tools are rendered as 3D models (handle + head) held in front of the hand.
// Flat 2D items (food, ingots, etc.) are rendered as thin beveled 3D plates for depth.
import * as THREE from "three";
import { BlockType, BLOCKS } from "./blocks";
import { ItemType, ITEMS, ToolType } from "./items";
import { TextureAtlas } from "./atlas";

export type HandAction = "idle" | "swing" | "eat" | "place" | "break";

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Smoothstep — used to soft-transition between action keyframes
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Default light intensities (used as a baseline — modulated by world day/night via setWorldLight)
const DEFAULT_AMBIENT = 0.75;
const DEFAULT_KEY = 0.7;
const DEFAULT_FILL = 0.32;
const DEFAULT_RIM = 0.28;

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

  // Lighting rig (kept as members so we can modulate them with the world day/night)
  ambient: THREE.AmbientLight;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;

  // Mining re-trigger cadence — re-swing every 0.45s while the LMB is held
  // (caller toggles `miningHeld` and we auto-loop the "break" action)
  miningHeld: boolean = false;
  // Cooldown between consecutive break swings
  private breakCooldown: number = 0;

  // Smoothed rotation/position so transitions between actions don't snap
  private curRotX = 0.3;
  private curRotY = -0.6;
  private curRotZ = 0.1;
  private curItemOffsetY = 0;
  private curItemOffsetZ = 0;

  constructor(atlas: TextureAtlas) {
    this.atlas = atlas;
    this.scene = new THREE.Scene();
    const aspect = 16 / 9;
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    // Layered lighting for better 3D depth
    this.ambient = new THREE.AmbientLight(0xffffff, DEFAULT_AMBIENT);
    this.scene.add(this.ambient);
    // Main key light (warm sun) — keep ref so day/night can dim it
    this.keyLight = new THREE.DirectionalLight(0xfff2d8, DEFAULT_KEY);
    this.keyLight.position.set(3, 5, 4);
    this.scene.add(this.keyLight);
    // Fill light (cool sky)
    this.fillLight = new THREE.DirectionalLight(0xa0c0ff, DEFAULT_FILL);
    this.fillLight.position.set(-2, -3, 3);
    this.scene.add(this.fillLight);
    // Rim light from behind for edge definition
    this.rimLight = new THREE.DirectionalLight(0xffd8a0, DEFAULT_RIM);
    this.rimLight.position.set(0, 2, -3);
    this.scene.add(this.rimLight);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.itemPivot = new THREE.Group();
    this.pivot.add(this.itemPivot);

    this.buildHand();
  }

  /** Update hand lighting from the world's day/night cycle. */
  setWorldLight(dayFactor: number, isTorchNear: boolean = false) {
    // dayFactor 0..1 — 0 = midnight, 1 = noon
    // Hand still needs to be readable at night, so floor at 0.45
    const base = 0.45 + dayFactor * 0.55;
    this.ambient.intensity = DEFAULT_AMBIENT * base;
    this.keyLight.intensity = DEFAULT_KEY * base;
    this.fillLight.intensity = DEFAULT_FILL * (0.6 + dayFactor * 0.4);
    // Rim stays constant — gives a subtle silhouette at night
    this.rimLight.intensity = DEFAULT_RIM * (0.5 + dayFactor * 0.5);
    // If player is holding a torch or near one, add a warm tint
    if (isTorchNear) {
      this.keyLight.color.setHex(0xffb060);
      this.ambient.intensity = Math.max(this.ambient.intensity, 0.55);
    } else {
      this.keyLight.color.setHex(0xfff2d8);
    }
  }

  private buildHand() {
    // Minecraft-style first-person arm: a single thick 3D block, skin-toned, no fingers.
    // No sleeve — just bare skin (Steve tone #b8845c).
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xb8845c });
    const skinLightMat = new THREE.MeshLambertMaterial({ color: 0xd4a378 });
    const skinDarkMat = new THREE.MeshLambertMaterial({ color: 0x8a6038 });

    const armW = 0.30;
    const armH = 0.75;
    const armD = 0.30;
    const off = 0.005; // offset to prevent z-fighting

    // Main arm block (full skin color, no sleeve)
    const skin = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, armD), skinMat);
    skin.position.set(0, -0.15, 0);
    this.pivot.add(skin);

    // Skin highlights
    const leftHighlight = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, armH - 0.02, armD - 0.02),
      skinLightMat
    );
    leftHighlight.position.set(-armW / 2 - off, -0.15, 0);
    this.pivot.add(leftHighlight);

    const topHighlight = new THREE.Mesh(
      new THREE.BoxGeometry(armW - 0.02, 0.012, armD - 0.02),
      skinLightMat
    );
    topHighlight.position.set(0, -0.15 + armH / 2 + off, 0);
    this.pivot.add(topHighlight);

    // Skin shadows
    const rightShadow = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, armH - 0.02, armD - 0.02),
      skinDarkMat
    );
    rightShadow.position.set(armW / 2 + off, -0.15, 0);
    this.pivot.add(rightShadow);

    const bottomShadow = new THREE.Mesh(
      new THREE.BoxGeometry(armW - 0.02, 0.012, armD - 0.02),
      skinDarkMat
    );
    bottomShadow.position.set(0, -0.15 - armH / 2 + off, 0);
    this.pivot.add(bottomShadow);

    // Fist cap at the bottom (slightly lighter, the knuckle area)
    const fistCap = new THREE.Mesh(new THREE.BoxGeometry(armW - 0.01, 0.14, armD - 0.01), skinLightMat);
    fistCap.position.set(0, -0.15 - armH / 2 + 0.07, 0.002);
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
      } else if (child instanceof THREE.Group) {
        child.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.geometry.dispose();
            (c.material as THREE.Material).dispose();
          }
        });
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

      // 2D item (food/materials) — render as a thin beveled 3D plate for depth
      this.buildFlatItemModel(def.icon);
    }
  }

  /**
   * Build a flat item (apple, ingot, pearl, etc.) as a thin 3D plate.
   *
   * The previous version used a single PlaneGeometry which looked paper-thin
   * and had no edge definition. The new version stacks three layers:
   *
   *   1. A thin BoxGeometry (0.22 × 0.22 × 0.025) with the icon texture on
   *      the front and back faces and a darkened "edge" texture on the sides.
   *      This gives the item actual thickness so it reads as a real object.
   *   2. A subtle inner highlight rim (slightly smaller plane, additive).
   *   3. The plate is tilted ~10° on Y so we see a sliver of the side —
   *      which makes the depth visible from the camera POV.
   *
   * The material is MeshLambertMaterial (cheap) — same as before — so this
   * adds essentially zero per-frame cost.
   */
  private buildFlatItemModel(iconName: string) {
    const tile = this.atlas.tiles[iconName];
    if (!tile) return;

    // Layer 1: thin beveled box — front/back face shows the icon, sides are dark.
    const thickness = 0.022;
    const size = 0.22;
    const geo = new THREE.BoxGeometry(size, size, thickness);

    // Default BoxGeometry UV layout: 6 faces × 4 verts, ordered
    //   +X, -X, +Y, -Y, +Z, -Z. Each face is a 4-vert quad.
    // We want front (+Z) and back (-Z) to show the icon; sides get a darker
    // tone via material slot (we'll use a multi-material array).
    const iconMat = new THREE.MeshLambertMaterial({
      map: this.atlas.texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide,
    });
    const edgeColor = this.darken(0x8a8a8a, 0.4);
    const edgeMat = new THREE.MeshLambertMaterial({
      color: edgeColor,
      side: THREE.FrontSide,
    });

    // Apply icon UVs to the +Z and -Z faces (last two in BoxGeometry order)
    const uvs = geo.attributes.uv;
    const setFaceUV = (faceBase: number, t: typeof tile) => {
      uvs.setXY(faceBase + 0, t.u0, t.v1);
      uvs.setXY(faceBase + 1, t.u1, t.v1);
      uvs.setXY(faceBase + 2, t.u0, t.v0);
      uvs.setXY(faceBase + 3, t.u1, t.v0);
    };
    // +Z face is at base 4*4 = 16, -Z face is at 5*4 = 20
    setFaceUV(16, tile);
    // Mirror the UV horizontally for the back face so it reads correctly from behind
    uvs.setXY(20 + 0, tile.u1, tile.v1);
    uvs.setXY(20 + 1, tile.u0, tile.v1);
    uvs.setXY(20 + 2, tile.u1, tile.v0);
    uvs.setXY(20 + 3, tile.u0, tile.v0);
    uvs.needsUpdate = true;

    // Material order for BoxGeometry: [+X, -X, +Y, -Y, +Z, -Z]
    const mats = [edgeMat, edgeMat, edgeMat, edgeMat, iconMat, iconMat];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(0, 0.1, -0.16);
    // Tilt slightly so we see the side — gives a 3D read
    mesh.rotation.y = 0.18;
    mesh.rotation.x = -0.12;
    this.itemPivot.add(mesh);

    // Layer 2: a subtle additive highlight plane just in front of the icon —
    // catches the key light and makes the item pop against dark backgrounds.
    const hlGeo = new THREE.PlaneGeometry(size * 0.92, size * 0.92);
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.position.set(0, 0.1, -0.16 + thickness / 2 + 0.002);
    hl.rotation.y = 0.18;
    hl.rotation.x = -0.12;
    this.itemPivot.add(hl);
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
    this.breakCooldown = 0;
  }

  /**
   * Advance the hand animation. Called every frame by the host.
   *
   * If `miningHeld` is true, the host doesn't need to keep re-triggering the
   * swing — we auto-loop the "break" action so the hand keeps chopping while
   * the LMB is held. The hand returns to idle the moment `miningHeld` is
   * cleared.
   */
  update(dt: number) {
    this.idleTime += dt;
    this.actionTime += dt;
    this.breakCooldown = Math.max(0, this.breakCooldown - dt);

    // Auto-loop the break action while mining
    if (this.miningHeld) {
      if (this.action !== "break" && this.action !== "swing") {
        this.action = "break";
        this.actionTime = 0;
      } else if (this.action === "break" && this.actionTime >= 0.45 && this.breakCooldown <= 0) {
        // Restart the break swing
        this.action = "break";
        this.actionTime = 0;
        this.breakCooldown = 0.05;
      } else if (this.action === "swing" && this.actionTime >= 0.35) {
        // If we just came from a click swing, transition to break loop
        this.action = "break";
        this.actionTime = 0;
      }
    }

    let extraRotX = 0, extraRotZ = 0, itemOffsetZ = 0, itemOffsetY = 0, extraRotY = 0;
    let pivotOffsetY = 0;

    if (this.action === "swing") {
      // Combat swing — fast, big horizontal chop
      const t = this.actionTime / 0.35;
      if (t >= 1) {
        this.action = this.miningHeld ? "break" : "idle";
      } else {
        const s = Math.sin(t * Math.PI);
        const e = easeInOutCubic(s);
        // Big swing down and forward
        extraRotX = -e * 0.9;
        // Slight wrist twist (yaw) for natural swing
        extraRotY = e * 0.15;
        // Slight roll
        extraRotZ = e * 0.05;
      }
    } else if (this.action === "break") {
      // === MINING SWING ===
      // Slightly shorter than combat swing (0.42s) so you get more hits/sec,
      // and uses an asymmetric curve: fast down-stroke (impact), slow up-recovery.
      // The down-stroke hits a sharper angle and adds a small forward lunge
      // so it FEELS like the tool is hitting the block.
      const duration = 0.42;
      const t = this.actionTime / duration;
      if (t >= 1) {
        if (this.miningHeld) {
          // Will be re-triggered by the auto-loop above on next frame
          this.actionTime = duration; // hold at end of cycle
        } else {
          this.action = "idle";
        }
      } else {
        // Asymmetric: down-stroke 0..0.3, impact 0.3..0.4, recovery 0.4..1.0
        let swingAmt: number;
        if (t < 0.3) {
          // Wind-up: slight pull back (negative)
          swingAmt = -smoothstep(0, 0.3, t) * 0.35;
        } else if (t < 0.42) {
          // Down-stroke: sharp impact
          const d = (t - 0.3) / 0.12;
          swingAmt = -0.35 + d * 1.4; // -0.35 → +1.05
        } else {
          // Recovery: ease back to neutral
          const d = (t - 0.42) / 0.58;
          swingAmt = 1.05 * (1 - easeInOutCubic(d));
        }
        extraRotX = -swingAmt * 0.85;
        extraRotY = swingAmt * 0.18;
        // Forward lunge at the moment of impact (t ~= 0.4)
        const impactPulse = Math.max(0, 1 - Math.abs(t - 0.4) * 8);
        itemOffsetZ = -impactPulse * 0.05;
        itemOffsetY = -impactPulse * 0.02;
        // Subtle whole-hand shake at impact
        pivotOffsetY = -impactPulse * 0.012;
        // Slight roll for a wrist-like motion
        extraRotZ = swingAmt * 0.06;
      }
    } else if (this.action === "place") {
      const t = this.actionTime / 0.3;
      if (t >= 1) {
        this.action = "idle";
      } else {
        const s = Math.sin(t * Math.PI);
        // Quick forward jab
        extraRotX = -s * 0.5;
        itemOffsetZ = -s * 0.12;
        // Slight upward tilt
        itemOffsetY = s * 0.04;
      }
    } else if (this.action === "eat") {
      const t = this.actionTime / 1.7;
      if (t >= 1) {
        this.action = "idle";
      } else {
        // Multiple bite motions
        const bite = Math.sin(t * Math.PI * 6);
        const biteAmount = Math.max(0, bite);
        // Bring food to mouth (forward + up)
        itemOffsetZ = biteAmount * 0.14;
        itemOffsetY = -biteAmount * 0.08;
        extraRotX = -biteAmount * 0.25;
        // Slight head/hand roll
        extraRotZ = biteAmount * 0.04;
      }
    } else {
      // === IDLE ANIMATION ===
      // Subtle breathing: slow vertical sway + tiny rotation
      extraRotX = Math.sin(this.idleTime * 1.2) * 0.015;
      extraRotZ = Math.sin(this.idleTime * 0.7) * 0.008;
      // Tiny side-to-side sway
      extraRotY = Math.sin(this.idleTime * 0.5) * 0.01;
      // Subtle vertical bob (synced to breathing)
      itemOffsetY = Math.sin(this.idleTime * 1.5) * 0.008;
      // Tiny walk bob if the player is moving (caller can amplify via setMoving)
    }

    // Smoothly interpolate rotation/position toward the target — this is the
    // single biggest reason the old animation felt "snappy". 8 Hz cutoff is
    // plenty for hand motion.
    const lerp = 1 - Math.pow(0.001, dt); // frame-rate independent
    this.curRotX += (0.3 + extraRotX - this.curRotX) * lerp;
    this.curRotY += (-0.6 + extraRotY - this.curRotY) * lerp;
    this.curRotZ += (0.1 + extraRotZ - this.curRotZ) * lerp;
    this.curItemOffsetY += (itemOffsetY - this.curItemOffsetY) * lerp;
    this.curItemOffsetZ += (itemOffsetZ - this.curItemOffsetZ) * lerp;

    this.pivot.rotation.x = this.curRotX;
    this.pivot.rotation.y = this.curRotY;
    this.pivot.rotation.z = this.curRotZ;
    this.pivot.position.set(1.2, -0.75 + pivotOffsetY, 0);
    this.itemPivot.position.set(0, this.curItemOffsetY, this.curItemOffsetZ);
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
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    });
  }
}
