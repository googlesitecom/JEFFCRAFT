// Inspect Dragon.glb by parsing the binary glTF format directly
import { readFileSync } from "fs";

const buffer = readFileSync("/home/z/my-project/public/Dragon.glb");
console.log(`File size: ${buffer.length} bytes`);

// GLB header: magic (4) + version (4) + length (4)
const magic = buffer.toString("ascii", 0, 4);
const version = buffer.readUInt32LE(4);
const length = buffer.readUInt32LE(8);
console.log(`magic=${magic} version=${version} length=${length}`);

// First chunk: JSON (chunkLength, chunkType, data)
let offset = 12;
const jsonChunkLength = buffer.readUInt32LE(offset);
const jsonChunkType = buffer.toString("ascii", offset + 4, offset + 8);
console.log(`chunk0: length=${jsonChunkLength} type=${jsonChunkType}`);
const jsonStr = buffer.toString("utf8", offset + 8, offset + 8 + jsonChunkLength);
const json = JSON.parse(jsonStr);

console.log("\n=== ASSET ===");
console.log(JSON.stringify(json.asset, null, 2));

console.log("\n=== ANIMATIONS ===");
if (json.animations) {
  json.animations.forEach((a, i) => {
    console.log(`  [${i}] name=${a.name} channels=${a.channels?.length} samplers=${a.samplers?.length}`);
  });
} else {
  console.log("  (no animations)");
}

console.log("\n=== MATERIALS ===");
if (json.materials) {
  json.materials.forEach((m, i) => {
    console.log(`  [${i}] name=${m.name} alphaMode=${m.alphaMode} pbr=${JSON.stringify(m.pbrMetallicRoughness?.baseColorFactor || "default")}`);
  });
} else {
  console.log("  (no materials)");
}

console.log("\n=== MESHES ===");
if (json.meshes) {
  json.meshes.forEach((m, i) => {
    console.log(`  [${i}] name=${m.name} primitives=${m.primitives?.length}`);
  });
} else {
  console.log("  (no meshes)");
}

console.log("\n=== NODES (root) ===");
if (json.scenes && json.scene !== undefined) {
  const root = json.scenes[json.scene];
  console.log(`  root nodes: ${JSON.stringify(root.nodes)}`);
}

console.log("\n=== ALL NODES ===");
if (json.nodes) {
  json.nodes.forEach((n, i) => {
    console.log(`  [${i}] name=${n.name} mesh=${n.mesh} children=${JSON.stringify(n.children || [])} translation=${JSON.stringify(n.translation)}`);
  });
}

console.log("\n=== SKINS ===");
if (json.skins) {
  json.skins.forEach((s, i) => {
    console.log(`  [${i}] name=${s.name} joints=${s.joints?.length}`);
  });
} else {
  console.log("  (no skins)");
}
