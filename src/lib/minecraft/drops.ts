// Item drops: physical items that fall to the ground and can be picked up
import * as THREE from "three";
import { World, CHUNK_SIZE } from "./world";
import { BlockType, BLOCKS, isSolid } from "./blocks";
import { ItemType, ITEMS } from "./items";
import { TextureAtlas } from "./atlas";

export interface DroppedItem {
  id: number; count: number;
  position: THREE.Vector3; velocity: THREE.Vector3;
  mesh: THREE.Mesh | null;
  pickupDelay: number; lifetime: number;
}

export class DropManager {
  drops: DroppedItem[] = [];
  scene: THREE.Scene; world: World; atlas: TextureAtlas;
  constructor(scene: THREE.Scene, world: World, atlas: TextureAtlas) {
    this.scene = scene; this.world = world; this.atlas = atlas;
  }

  spawnDrop(id: number, count: number, x: number, y: number, z: number) {
    const drop: DroppedItem = {
      id, count,
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 4 + Math.random() * 2, (Math.random() - 0.5) * 2),
      mesh: null, pickupDelay: 0.5, lifetime: 0,
    };
    let mesh: THREE.Mesh;
    if (id < 100) {
      const def = BLOCKS[id as BlockType]; if (!def) return;
      const mat = new THREE.MeshLambertMaterial({ map: this.atlas.texture });
      const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const tile = this.atlas.tiles[def.textures.side] || this.atlas.tiles[def.textures.top];
      if (tile) { const uvs = geo.attributes.uv;
        const t = this.atlas.tiles[def.textures.top]; const b = this.atlas.tiles[def.textures.bottom];
        const f = [tile, tile, t || tile, b || tile, tile, tile];
        for (let i = 0; i < 6; i++) { const base = i * 4;
          uvs.setXY(base, f[i].u0, f[i].v1); uvs.setXY(base+1, f[i].u1, f[i].v1);
          uvs.setXY(base+2, f[i].u0, f[i].v0); uvs.setXY(base+3, f[i].u1, f[i].v0); }
        uvs.needsUpdate = true; }
      mesh = new THREE.Mesh(geo, mat);
    } else {
      const def = ITEMS[id as ItemType]; if (!def) return;
      const tile = this.atlas.tiles[def.icon];
      const mat = new THREE.MeshLambertMaterial({ map: this.atlas.texture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(0.3, 0.3);
      if (tile) { const uvs = geo.attributes.uv;
        uvs.setXY(0, tile.u0, tile.v1); uvs.setXY(1, tile.u1, tile.v1);
        uvs.setXY(2, tile.u0, tile.v0); uvs.setXY(3, tile.u1, tile.v0); uvs.needsUpdate = true; }
      mesh = new THREE.Mesh(geo, mat);
    }
    mesh.position.copy(drop.position); this.scene.add(mesh); drop.mesh = mesh; this.drops.push(drop);
  }

  update(dt: number, px: number, py: number, pz: number): { id: number; count: number }[] {
    const pickedUp: { id: number; count: number }[] = [];
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.lifetime += dt; d.pickupDelay -= dt;
      d.velocity.y -= 20 * dt;
      const ox = d.position.x; d.position.x += d.velocity.x * dt; d.velocity.x *= 0.9;
      if (isSolid(this.world.getBlock(Math.floor(d.position.x), Math.floor(d.position.y), Math.floor(d.position.z)))) { d.position.x = ox; d.velocity.x = 0; }
      const oz = d.position.z; d.position.z += d.velocity.z * dt; d.velocity.z *= 0.9;
      if (isSolid(this.world.getBlock(Math.floor(d.position.x), Math.floor(d.position.y), Math.floor(d.position.z)))) { d.position.z = oz; d.velocity.z = 0; }
      d.position.y += d.velocity.y * dt;
      if (isSolid(this.world.getBlock(Math.floor(d.position.x), Math.floor(d.position.y - 0.15), Math.floor(d.position.z)))) {
        d.position.y = Math.floor(d.position.y) + 1; d.velocity.y = 0; }
      if (d.mesh) { d.mesh.position.copy(d.position); d.mesh.rotation.y += dt * 2;
        if (d.velocity.y === 0) d.mesh.position.y += Math.sin(d.lifetime * 3) * 0.05; }
      if (d.pickupDelay <= 0) {
        const dist = Math.sqrt((d.position.x - px) ** 2 + (d.position.y - py) ** 2 + (d.position.z - pz) ** 2);
        if (dist < 1.5) { pickedUp.push({ id: d.id, count: d.count });
          if (d.mesh) { this.scene.remove(d.mesh); d.mesh.geometry.dispose(); (d.mesh.material as THREE.Material).dispose(); }
          this.drops.splice(i, 1); continue; }
      }
      if (d.lifetime > 300) { if (d.mesh) { this.scene.remove(d.mesh); d.mesh.geometry.dispose(); (d.mesh.material as THREE.Material).dispose(); } this.drops.splice(i, 1); }
    }
    return pickedUp;
  }

  dispose() { for (const d of this.drops) { if (d.mesh) { this.scene.remove(d.mesh); d.mesh.geometry.dispose(); (d.mesh.material as THREE.Material).dispose(); } } this.drops = []; }
}
