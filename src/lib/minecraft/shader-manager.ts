// Shader Manager: OptiFine-like shader system for JEFFCRAFT
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";

export interface ShaderSettings {
  enabled: boolean;
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  ssao: boolean;
  fog: boolean;
  fogDensity: number;
  waterWaves: boolean;
  windEffect: boolean;
  windSpeed: number;
  windAmplitude: number;
  godRays: boolean;
  toneMappingExposure: number;
}

export const DEFAULT_SHADER_SETTINGS: ShaderSettings = {
  enabled: false, bloom: false, bloomStrength: 0.8, bloomRadius: 0.4,
  bloomThreshold: 0.85, ssao: false, fog: true, fogDensity: 0.008,
  waterWaves: false, windEffect: false, windSpeed: 1.5, windAmplitude: 0.04,
  godRays: false, toneMappingExposure: 1.2,
};

const FogShader = {
  uniforms: { tDiffuse: { value: null as any }, fogColor: { value: new THREE.Color("#87ceeb") }, fogDensity: { value: 0.008 }, fogNear: { value: 30 }, fogFar: { value: 80 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 fogColor; uniform float fogDensity; uniform float fogNear; uniform float fogFar; varying vec2 vUv;
    void main() { vec4 texel = texture2D(tDiffuse, vUv); float dist = length(vUv - 0.5) * 2.0; float fogFactor = 1.0 - exp(-fogDensity * dist * fogFar); fogFactor = clamp(fogFactor, 0.0, 1.0); gl_FragColor = vec4(mix(texel.rgb, fogColor, fogFactor), texel.a); }`,
};

const GodRaysShader = {
  uniforms: { tDiffuse: { value: null as any }, sunPosition: { value: new THREE.Vector2(0.5, 0.5) }, sunColor: { value: new THREE.Color(1.0, 0.9, 0.7) }, intensity: { value: 0.3 }, decay: { value: 0.95 }, exposure: { value: 0.1 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunPosition; uniform vec3 sunColor; uniform float intensity; uniform float decay; varying vec2 vUv;
    void main() { vec4 base = texture2D(tDiffuse, vUv); vec2 dir = sunPosition - vUv; float dist = length(dir); vec3 godRays = vec3(0.0); const int SAMPLES = 12;
    for (int i = 0; i < SAMPLES; i++) { float t = float(i) / float(SAMPLES); vec2 offset = vUv + dir * t * 0.1; vec4 sc = texture2D(tDiffuse, offset); float att = pow(1.0 - t, decay); godRays += sc.rgb * att; }
    godRays /= float(SAMPLES); float sunDot = max(0.0, 1.0 - dist * 3.0); gl_FragColor = vec4(base.rgb + godRays * sunColor * intensity * sunDot, base.a); }`,
};

export const WindShader = {
  uniforms: { uTime: { value: 0 }, uSpeed: { value: 1.5 }, uAmplitude: { value: 0.04 }, map: { value: null as any } },
  vertexShader: `uniform float uTime; uniform float uSpeed; uniform float uAmplitude; varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
    void main() { vUv = uv; vNormal = normal; vec3 pos = position; float windMask = smoothstep(0.3, 1.0, uv.y);
    float w1 = sin(uTime * uSpeed + pos.y * 3.0 + pos.x * 0.5) * uAmplitude * windMask;
    float w2 = cos(uTime * uSpeed * 0.7 + pos.z * 2.0 + pos.y * 1.5) * uAmplitude * 0.6 * windMask;
    float w3 = sin(uTime * uSpeed * 1.3 + (pos.x + pos.z) * 0.8) * uAmplitude * 0.3 * windMask;
    pos.x += w1 + w3; pos.z += w2; pos.y += sin(uTime * uSpeed * 0.5 + pos.x * 2.0) * uAmplitude * 0.2 * windMask;
    vec4 worldPos = modelMatrix * vec4(pos, 1.0); vWorldPos = worldPos.xyz; gl_Position = projectionMatrix * viewMatrix * worldPos; }`,
  fragmentShader: `varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos; uniform sampler2D map;
    void main() { vec4 texel = texture2D(map, vUv); if (texel.a < 0.5) discard; vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diffuse = max(dot(vNormal, lightDir), 0.0); float light = 0.4 + diffuse * 0.6;
    float dist = length(vWorldPos - cameraPosition); float fogFactor = smoothstep(40.0, 80.0, dist);
    vec3 fc = vec3(0.5, 0.7, 0.9); gl_FragColor = vec4(mix(texel.rgb * light, fc, fogFactor * 0.3), texel.a); }`,
};

export const WaterShader = {
  uniforms: { uTime: { value: 0 }, uWaterColor: { value: new THREE.Color("#2a7acc") }, uDeepColor: { value: new THREE.Color("#0a2a5a") }, uShallowColor: { value: new THREE.Color("#4ab0e8") }, uOpacity: { value: 0.72 }, uSunDir: { value: new THREE.Vector3(0.5, 1.0, 0.3) }, uSunColor: { value: new THREE.Color(1.0, 0.95, 0.8) }, uCameraPos: { value: new THREE.Vector3() } },
  vertexShader: `uniform float uTime; varying vec3 vWorldPos; varying vec3 vNormal; varying float vWaveHeight; varying vec2 vUv;
    void main() { vUv = uv; vec3 pos = position;
    float w1 = sin(pos.x * 0.8 + uTime * 1.5) * 0.06; float w2 = cos(pos.z * 0.5 + uTime * 1.2) * 0.05;
    float w3 = sin((pos.x + pos.z) * 0.3 + uTime * 0.8) * 0.04; float w4 = cos(pos.x * 0.2 - pos.z * 0.4 + uTime * 1.0) * 0.03;
    pos.y += w1 + w2 + w3 + w4; vWaveHeight = w1 + w2 + w3 + w4;
    vNormal = normalize(vec3(-cos(pos.x * 0.8 + uTime * 1.5) * 0.048, 1.0, sin(pos.z * 0.5 + uTime * 1.2) * 0.025));
    vec4 worldPos = modelMatrix * vec4(pos, 1.0); vWorldPos = worldPos.xyz; gl_Position = projectionMatrix * viewMatrix * worldPos; }`,
  fragmentShader: `uniform vec3 uWaterColor; uniform vec3 uDeepColor; uniform vec3 uShallowColor; uniform float uOpacity; uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uCameraPos;
    varying vec3 vWorldPos; varying vec3 vNormal; varying float vWaveHeight; varying vec2 vUv;
    void main() { float depthFactor = smoothstep(-0.1, 0.12, vWaveHeight); vec3 color = mix(uDeepColor, uShallowColor, depthFactor); color = mix(color, uWaterColor, 0.5);
    vec3 viewDir = normalize(uCameraPos - vWorldPos); vec3 reflectDir = reflect(-normalize(uSunDir), vNormal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0); color += uSunColor * spec * 0.8;
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0); color += vec3(0.4, 0.6, 0.9) * fresnel * 0.3;
    float sparkle = pow(max(0.0, vWaveHeight / 0.15), 6.0); color += vec3(1.0, 0.98, 0.9) * sparkle * 0.4;
    float caustic = sin(vUv.x * 20.0 + uTime * 2.0) * sin(vUv.y * 20.0 + uTime * 1.5); color += vec3(0.1, 0.2, 0.3) * caustic * 0.05;
    gl_FragColor = vec4(color, uOpacity); }`,
};

export class ShaderManager {
  composer: EffectComposer | null = null;
  renderPass: RenderPass | null = null;
  bloomPass: UnrealBloomPass | null = null;
  fogPass: ShaderPass | null = null;
  godRaysPass: ShaderPass | null = null;
  ssaoPass: SSAOPass | null = null;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  settings: ShaderSettings;
  enabled: boolean = false;
  windMaterial: THREE.ShaderMaterial | null = null;
  waterMaterial: THREE.ShaderMaterial | null = null;
  clock: THREE.Clock;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, settings?: Partial<ShaderSettings>) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.settings = { ...DEFAULT_SHADER_SETTINGS, ...settings }; this.clock = new THREE.Clock();
  }

  init() {
    if (this.composer) return;
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.settings.bloomStrength, this.settings.bloomRadius, this.settings.bloomThreshold);
    this.bloomPass.enabled = this.settings.bloom; this.composer.addPass(this.bloomPass);
    this.godRaysPass = new ShaderPass(GodRaysShader); this.godRaysPass.enabled = this.settings.godRays; this.composer.addPass(this.godRaysPass);
    this.fogPass = new ShaderPass(FogShader); this.fogPass.enabled = this.settings.fog; this.composer.addPass(this.fogPass);
    this.ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
    this.ssaoPass.enabled = this.settings.ssao; this.composer.addPass(this.ssaoPass);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled; this.settings.enabled = enabled;
    if (enabled && !this.composer) this.init();
    if (this.composer) {
      if (this.renderPass) this.renderPass.enabled = enabled;
      if (this.bloomPass) this.bloomPass.enabled = enabled && this.settings.bloom;
      if (this.fogPass) this.fogPass.enabled = enabled && this.settings.fog;
      if (this.godRaysPass) this.godRaysPass.enabled = enabled && this.settings.godRays;
      if (this.ssaoPass) this.ssaoPass.enabled = enabled && this.settings.ssao;
    }
    this.renderer.toneMappingExposure = enabled ? this.settings.toneMappingExposure : 1.0;
  }

  updateSetting(key: keyof ShaderSettings, value: any) {
    (this.settings as any)[key] = value;
    if (key === "enabled") this.setEnabled(value);
    if (key === "bloom" && this.bloomPass) this.bloomPass.enabled = value;
    if (key === "bloomStrength" && this.bloomPass) this.bloomPass.strength = value;
    if (key === "bloomRadius" && this.bloomPass) this.bloomPass.radius = value;
    if (key === "bloomThreshold" && this.bloomPass) this.bloomPass.threshold = value;
    if (key === "fog" && this.fogPass) this.fogPass.enabled = value;
    if (key === "fogDensity" && this.fogPass) (this.fogPass.uniforms.fogDensity as any).value = value;
    if (key === "godRays" && this.godRaysPass) this.godRaysPass.enabled = value;
    if (key === "ssao" && this.ssaoPass) this.ssaoPass.enabled = value;
    if (key === "toneMappingExposure") this.renderer.toneMappingExposure = value;
  }

  render() {
    if (this.enabled && this.composer) {
      const time = this.clock.getElapsedTime();
      if (this.windMaterial) { this.windMaterial.uniforms.uTime.value = time; this.windMaterial.uniforms.uSpeed.value = this.settings.windSpeed; this.windMaterial.uniforms.uAmplitude.value = this.settings.windAmplitude; }
      if (this.waterMaterial) { this.waterMaterial.uniforms.uTime.value = time; this.waterMaterial.uniforms.uOpacity.value = this.settings.waterWaves ? 0.7 : 0.75; }
      this.composer.render();
    }
  }

  createWindMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
    this.windMaterial = new THREE.ShaderMaterial({ uniforms: { ...WindShader.uniforms, map: { value: texture } }, vertexShader: WindShader.vertexShader, fragmentShader: WindShader.fragmentShader, side: THREE.DoubleSide, transparent: false, alphaTest: 0.5 });
    return this.windMaterial;
  }

  createWaterMaterial(): THREE.ShaderMaterial {
    this.waterMaterial = new THREE.ShaderMaterial({ uniforms: { ...WaterShader.uniforms }, vertexShader: WaterShader.vertexShader, fragmentShader: WaterShader.fragmentShader, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    return this.waterMaterial;
  }

  resize(width: number, height: number) { if (this.composer) this.composer.setSize(width, height); }
  dispose() { if (this.composer) this.composer.dispose(); if (this.windMaterial) this.windMaterial.dispose(); if (this.waterMaterial) this.waterMaterial.dispose(); }
}
