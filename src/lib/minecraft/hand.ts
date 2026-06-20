// First-person hand view: Minecraft-style hand at bottom-right
import * as THREE from "three";
import { BlockType, BLOCKS } from "./blocks";
import { ItemType, ITEMS } from "./items";
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
    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff0e0, 0.5);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.itemPivot = new THREE.Group();
    this.pivot.add(this.itemPivot);
    this.buildHand();
  }

  private buildHand() {
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8c39e });
    const skinDark = new THREE.MeshLambertMaterial({ color: 0xd0a080 });
    const sleeve = new THREE.MeshLambertMaterial({ color: 0x4a8a4a });
    const sleeveDark = new THREE.MeshLambertMaterial({ color: 0x3a6a3a });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), sleeve);
    arm.position.set(0, -0.18, 0); this.pivot.add(arm);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.14), sleeveDark);
    cuff.position.set(0, -0.05, 0); this.pivot.add(cuff);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.1), skin);
    palm.position.set(0, 0.04, 0); this.pivot.add(palm);
    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.09), skinDark);
    knuckle.position.set(0, 0.1, 0); this.pivot.add(knuckle);
    const fingerGeo = new THREE.BoxGeometry(0.025, 0.04, 0.05);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fingerGeo, skin);
      f.position.set(-0.04 + i * 0.028, 0.12, -0.02); this.pivot.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.04), skin);
    thumb.position.set(0.07, 0.07, 0); thumb.rotation.z = -0.5; this.pivot.add(thumb);
    this.pivot.position.set(0.95, -0.5, 0);
    this.pivot.rotation.x = 0.3; this.pivot.rotation.y = -0.4;
    this.pivot.scale.set(1.0, 1.0, 1.0);
  }

  updateItem(itemId: number | null) {
    if (itemId === this.currentItem) return;
    this.currentItem = itemId;
    while (this.itemPivot.children.length > 0) {
      const c = this.itemPivot.children[0]; this.itemPivot.remove(c);
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    }
    if (itemId === null || itemId === undefined) return;
    if (itemId < 100) {
      const def = BLOCKS[itemId as BlockType]; if (!def) return;
      const mat = new THREE.MeshLambertMaterial({ map: this.atlas.texture });
      const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
      const tile = this.atlas.tiles[def.textures.side] || this.atlas.tiles[def.textures.top];
      if (tile) {
        const uvs = geo.attributes.uv;
        const topTile = this.atlas.tiles[def.textures.top];
        const bottomTile = this.atlas.tiles[def.textures.bottom];
        const faces = [tile, tile, topTile || tile, bottomTile || tile, tile, tile];
        for (let f = 0; f < 6; f++) { const b = f * 4;
          uvs.setXY(b, faces[f].u0, faces[f].v1); uvs.setXY(b+1, faces[f].u1, faces[f].v1);
          uvs.setXY(b+2, faces[f].u0, faces[f].v0); uvs.setXY(b+3, faces[f].u1, faces[f].v0); }
        uvs.needsUpdate = true;
      }
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(0, 0.06, -0.12); this.itemPivot.add(mesh);
    } else {
      const def = ITEMS[itemId as ItemType]; if (!def) return;
      const tile = this.atlas.tiles[def.icon];
      const mat = new THREE.MeshLambertMaterial({ map: this.atlas.texture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(0.18, 0.18);
      if (tile) { const uvs = geo.attributes.uv;
        uvs.setXY(0, tile.u0, tile.v1); uvs.setXY(1, tile.u1, tile.v1);
        uvs.setXY(2, tile.u0, tile.v0); uvs.setXY(3, tile.u1, tile.v0); uvs.needsUpdate = true; }
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(0, 0.06, -0.12);
      if (def.toolType) mesh.rotation.x = -0.9; this.itemPivot.add(mesh);
    }
  }

  triggerAction(action: HandAction) { this.action = action; this.actionTime = 0; }

  update(dt: number) {
    this.idleTime += dt; this.actionTime += dt;
    let extraRotX = 0, extraRotZ = 0, itemOffsetZ = 0, itemOffsetY = 0;
    if (this.action === "swing") {
      const t = this.actionTime / 0.35;
      if (t >= 1) { this.action = "idle"; } else { extraRotX = -easeInOutCubic(Math.sin(t * Math.PI)) * 0.6; }
    } else if (this.action === "place") {
      const t = this.actionTime / 0.3;
      if (t >= 1) { this.action = "idle"; } else { const s = Math.sin(t * Math.PI); extraRotX = -s * 0.4; itemOffsetZ = -s * 0.08; }
    } else if (this.action === "eat") {
      const t = this.actionTime / 1.7;
      if (t >= 1) { this.action = "idle"; } else { const b = Math.max(0, Math.sin(t * Math.PI * 6));
        itemOffsetZ = b * 0.1; itemOffsetY = -b * 0.05; extraRotX = -b * 0.15; }
    } else { extraRotX = Math.sin(this.idleTime * 1.2) * 0.01; extraRotZ = Math.sin(this.idleTime * 0.7) * 0.005; }
    this.pivot.rotation.x = 0.3 + extraRotX; this.pivot.rotation.y = -0.4; this.pivot.rotation.z = extraRotZ;
    this.itemPivot.position.set(0, itemOffsetY, itemOffsetZ);
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.scene, this.camera); renderer.autoClear = true;
  }

  dispose() { this.scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); }
}
