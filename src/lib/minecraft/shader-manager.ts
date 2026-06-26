// Shader Manager: OptiFine-like shader system for JEFFCRAFT
// Performance-tuned: every effect runs in a single extra fullscreen pass and uses
// cheap math (no per-pixel loops > 8 samples). All expensive passes are optional
// and gate behind the user's `ShaderSettings` flags so the default path stays fast.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

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

// ============================================================================
// 1. FOG SHADER — cheap atmospheric perspective with vertical gradient
//    Cost: 1 texture sample + ~8 ALU per pixel
// ============================================================================
const FogShader = {
  uniforms: {
    tDiffuse: { value: null as any },
    fogColor: { value: new THREE.Color("#87ceeb") },
    fogDensity: { value: 0.008 },
    fogNear: { value: 30 },
    fogFar: { value: 80 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 fogColor;
    uniform float fogDensity;
    uniform float fogNear;
    uniform float fogFar;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      // Distance from screen center (radial fog)
      float dist = length(vUv - 0.5) * 2.0;
      // Vertical gradient: more fog near horizon, less overhead (atmospheric perspective)
      float verticalFade = 1.0 - smoothstep(0.0, 0.7, abs(vUv.y - 0.5) * 2.0);
      verticalFade = mix(0.35, 1.0, verticalFade);
      float fogFactor = 1.0 - exp(-fogDensity * dist * fogFar);
      fogFactor *= verticalFade;
      fogFactor = clamp(fogFactor, 0.0, 0.92);
      // Slight desaturation toward horizon (more realistic haze)
      float lum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
      vec3 desaturated = mix(texel.rgb, vec3(lum), fogFactor * 0.4);
      gl_FragColor = vec4(mix(desaturated, fogColor, fogFactor), texel.a);
    }
  `,
};

// ============================================================================
// 2. GOD RAYS — optimized 8-sample radial sampling toward sun screen position
//    Cost: 8 texture samples per pixel (down from 12)
// ============================================================================
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null as any },
    sunPosition: { value: new THREE.Vector2(0.5, 0.5) },
    sunColor: { value: new THREE.Color(1.0, 0.9, 0.7) },
    intensity: { value: 0.35 },
    decay: { value: 0.92 },
    exposure: { value: 0.1 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 sunPosition;
    uniform vec3 sunColor;
    uniform float intensity;
    uniform float decay;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 dir = sunPosition - vUv;
      float dist = length(dir);
      // Skip work entirely if sun is far away (saves bandwidth)
      if (dist > 0.7) {
        gl_FragColor = base;
        return;
      }
      vec3 godRays = vec3(0.0);
      const int SAMPLES = 8;
      float illum = 0.0;
      for (int i = 0; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES);
        vec2 offset = vUv + dir * t * 0.15;
        vec4 sc = texture2D(tDiffuse, offset);
        // Bright pixels (sky/sun) contribute to god rays, dark pixels don't
        float lum = max(sc.r, max(sc.g, sc.b));
        float att = pow(1.0 - t, decay);
        godRays += sc.rgb * att * step(0.6, lum);
        illum += att;
      }
      godRays /= max(illum, 0.001);
      float sunDot = max(0.0, 1.0 - dist * 3.0);
      gl_FragColor = vec4(base.rgb + godRays * sunColor * intensity * sunDot, base.a);
    }
  `,
};

// ============================================================================
// 3. COLOR GRADE / TONE + VIGNETTE — single cheap pass that replaces SSAO
//    in the default path. Lifts shadows, soft vignette, subtle contrast.
//    Cost: 1 texture sample + ~10 ALU per pixel
// ============================================================================
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null as any },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.08 },
    uSaturation: { value: 1.12 },
    uVignette: { value: 0.35 },
    uTime: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 rgb = c.rgb * uExposure;
      // ACES-style contrast curve (cheap approximation)
      rgb = (rgb - 0.5) * uContrast + 0.5;
      // Saturation boost
      float l = dot(rgb, vec3(0.299, 0.587, 0.114));
      rgb = mix(vec3(l), rgb, uSaturation);
      // Vignette — soft elliptical, no per-pixel sqrt needed
      vec2 d = vUv - 0.5;
      float vig = 1.0 - dot(d, d) * uVignette * 2.6;
      rgb *= clamp(vig, 0.55, 1.0);
      gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), c.a);
    }
  `,
};

// ============================================================================
// 4. FXAA — single-pass cheap anti-aliasing (replaces MSAA for the composer
//    path). Quality preset tuned for performance: 8-tap edge detect.
// ============================================================================
const FXAAShader = {
  uniforms: {
    tDiffuse: { value: null as any },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;
    // FXAA 3.11 minimal quality (NVIDIA reference, trimmed)
    #define FXAA_REDUCE_MIN   (1.0/128.0)
    #define FXAA_REDUCE_MUL   (1.0/8.0)
    #define FXAA_SPAN_MAX     8.0
    void main() {
      vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) / resolution).rgb;
      vec3 rgbNE = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) / resolution).rgb;
      vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) / resolution).rgb;
      vec3 rgbSE = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) / resolution).rgb;
      vec3 rgbM  = texture2D(tDiffuse, vUv).rgb;
      float lumaNW = dot(rgbNW, vec3(0.299, 0.587, 0.114));
      float lumaNE = dot(rgbNE, vec3(0.299, 0.587, 0.114));
      float lumaSW = dot(rgbSW, vec3(0.299, 0.587, 0.114));
      float lumaSE = dot(rgbSE, vec3(0.299, 0.587, 0.114));
      float lumaM  = dot(rgbM,  vec3(0.299, 0.587, 0.114));
      float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
      float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
      vec2 dir;
      dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
      dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
      float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.25 * FXAA_REDUCE_MUL, FXAA_REDUCE_MIN);
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX),
                max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX),
                    dir * rcpDirMin)) / resolution;
      vec3 rgbA = 0.5 * (
        texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).rgb +
        texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).rgb);
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture2D(tDiffuse, vUv + dir * -0.5).rgb +
        texture2D(tDiffuse, vUv + dir *  0.5).rgb);
      float lumaB = dot(rgbB, vec3(0.299, 0.587, 0.114));
      if ((lumaB < lumaMin) || (lumaB > lumaMax)) {
        gl_FragColor = vec4(rgbA, 1.0);
      } else {
        gl_FragColor = vec4(rgbB, 1.0);
      }
    }
  `,
};

// ============================================================================
// 5. WIND SHADER — vertex displacement for foliage
//    Uses 3 octaves of sin/cos, masked by uv.y so only the top of leaves sway.
// ============================================================================
export const WindShader = {
  uniforms: {
    uTime: { value: 0 },
    uSpeed: { value: 1.5 },
    uAmplitude: { value: 0.04 },
    map: { value: null as any },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uSpeed;
    uniform float uAmplitude;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vWindAmount;
    void main() {
      vUv = uv;
      vNormal = normal;
      vec3 pos = position;
      float windMask = smoothstep(0.3, 1.0, uv.y);
      float w1 = sin(uTime * uSpeed + pos.y * 3.0 + pos.x * 0.5) * uAmplitude * windMask;
      float w2 = cos(uTime * uSpeed * 0.7 + pos.z * 2.0 + pos.y * 1.5) * uAmplitude * 0.6 * windMask;
      float w3 = sin(uTime * uSpeed * 1.3 + (pos.x + pos.z) * 0.8) * uAmplitude * 0.3 * windMask;
      pos.x += w1 + w3;
      pos.z += w2;
      pos.y += sin(uTime * uSpeed * 0.5 + pos.x * 2.0) * uAmplitude * 0.2 * windMask;
      vWindAmount = windMask;
      vec4 worldPos = modelMatrix * vec4(pos, 1.0);
      vWorldPos = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vWindAmount;
    uniform sampler2D map;
    void main() {
      vec4 texel = texture2D(map, vUv);
      if (texel.a < 0.5) discard;
      // Two-tone shading: top of leaves gets more light (sun comes from above)
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
      float diffuse = max(dot(vNormal, lightDir), 0.0);
      float light = 0.45 + diffuse * 0.55;
      // Wind-shaded leaves get a subtle brightening (motion catches sunlight)
      light += vWindAmount * 0.05;
      float dist = length(vWorldPos - cameraPosition);
      float fogFactor = smoothstep(40.0, 80.0, dist);
      vec3 fc = vec3(0.5, 0.7, 0.9);
      gl_FragColor = vec4(mix(texel.rgb * light, fc, fogFactor * 0.3), texel.a);
    }
  `,
};

// ============================================================================
// 6. WATER SHADER — animated waves + specular + fresnel + cheap caustics
//    This is the realistic water: no planar reflections (too expensive),
//    instead we fake reflection via fresnel + sky color + sun specular.
// ============================================================================
export const WaterShader = {
  uniforms: {
    uTime: { value: 0 },
    uWaterColor: { value: new THREE.Color("#2a7acc") },
    uDeepColor: { value: new THREE.Color("#0a2a5a") },
    uShallowColor: { value: new THREE.Color("#4ab0e8") },
    uOpacity: { value: 0.72 },
    uSunDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
    uSunColor: { value: new THREE.Color(1.0, 0.95, 0.8) },
    uCameraPos: { value: new THREE.Vector3() },
    uSkyColor: { value: new THREE.Color("#87ceeb") },
    uFogColor: { value: new THREE.Color("#87ceeb") },
    uFogNear: { value: 30 },
    uFogFar: { value: 80 },
  },
  vertexShader: `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vWaveHeight;
    varying vec2 vUv;
    varying vec3 vViewDir;
    void main() {
      vUv = uv;
      vec3 pos = position;
      // 4-octave Gerstner-like waves
      float w1 = sin(pos.x * 0.8 + uTime * 1.5) * 0.06;
      float w2 = cos(pos.z * 0.5 + uTime * 1.2) * 0.05;
      float w3 = sin((pos.x + pos.z) * 0.3 + uTime * 0.8) * 0.04;
      float w4 = cos(pos.x * 0.2 - pos.z * 0.4 + uTime * 1.0) * 0.03;
      pos.y += w1 + w2 + w3 + w4;
      vWaveHeight = w1 + w2 + w3 + w4;
      // Compute normal analytically (derivative of the wave function)
      float dx = cos(pos.x * 0.8 + uTime * 1.5) * 0.048
               + cos((pos.x + pos.z) * 0.3 + uTime * 0.8) * 0.012
               - sin(pos.x * 0.2 - pos.z * 0.4 + uTime * 1.0) * 0.006;
      float dz = -sin(pos.z * 0.5 + uTime * 1.2) * 0.025
               + cos((pos.x + pos.z) * 0.3 + uTime * 0.8) * 0.012
               + sin(pos.x * 0.2 - pos.z * 0.4 + uTime * 1.0) * 0.012;
      vNormal = normalize(vec3(-dx, 1.0, -dz));
      vec4 worldPos = modelMatrix * vec4(pos, 1.0);
      vWorldPos = worldPos.xyz;
      vViewDir = normalize(cameraPosition - vWorldPos);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform vec3 uWaterColor;
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform float uOpacity;
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vWaveHeight;
    varying vec2 vUv;
    varying vec3 vViewDir;

    void main() {
      // Depth-based color: wave crests = shallow (bright), troughs = deep (dark)
      float depthFactor = smoothstep(-0.1, 0.12, vWaveHeight);
      vec3 color = mix(uDeepColor, uShallowColor, depthFactor);
      color = mix(color, uWaterColor, 0.5);

      // Sun specular (Blinn-Phong)
      vec3 halfDir = normalize(uSunDir + vViewDir);
      float spec = pow(max(dot(vNormal, halfDir), 0.0), 96.0);
      color += uSunColor * spec * 1.2;

      // Fresnel: water reflects more at grazing angles — fake sky reflection
      float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 4.0);
      color = mix(color, uSkyColor, fresnel * 0.55);

      // Sparkle: tiny highlights at wave crests
      float sparkle = pow(max(0.0, vWaveHeight / 0.15), 8.0);
      color += vec3(1.0, 0.98, 0.9) * sparkle * 0.5;

      // Animated caustics (cheap 2-octave sin pattern)
      float c1 = sin(vUv.x * 20.0 + uTime * 2.0) * sin(vUv.y * 20.0 + uTime * 1.5);
      float c2 = sin(vUv.x * 12.0 - uTime * 1.3) * cos(vUv.y * 14.0 + uTime * 0.9);
      float caustic = (c1 + c2 * 0.6) * 0.5;
      color += vec3(0.12, 0.22, 0.32) * caustic * 0.08;

      // Distance fog (match scene fog so water blends with horizon)
      float dist = length(vWorldPos - cameraPosition);
      float fogFactor = smoothstep(uFogNear, uFogFar, dist);
      color = mix(color, uFogColor, fogFactor);

      gl_FragColor = vec4(color, uOpacity);
    }
  `,
};

export class ShaderManager {
  composer: EffectComposer | null = null;
  renderPass: RenderPass | null = null;
  bloomPass: UnrealBloomPass | null = null;
  fogPass: ShaderPass | null = null;
  godRaysPass: ShaderPass | null = null;
  colorGradePass: ShaderPass | null = null;
  fxaaPass: ShaderPass | null = null;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  settings: ShaderSettings;
  enabled: boolean = false;
  windMaterial: THREE.ShaderMaterial | null = null;
  waterMaterial: THREE.ShaderMaterial | null = null;
  clock: THREE.Clock;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    settings?: Partial<ShaderSettings>
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.settings = { ...DEFAULT_SHADER_SETTINGS, ...settings };
    this.clock = new THREE.Clock();
  }

  init() {
    if (this.composer) return;
    this.composer = new EffectComposer(this.renderer);
    // Lower the internal pixel ratio of the composer to save fillrate when
    // post-processing is enabled. This is the single biggest FPS lever.
    const pr = Math.min(window.devicePixelRatio, 1.25);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.settings.bloomStrength,
      this.settings.bloomRadius,
      this.settings.bloomThreshold
    );
    this.bloomPass.enabled = this.settings.bloom;
    this.composer.addPass(this.bloomPass);

    this.godRaysPass = new ShaderPass(GodRaysShader);
    this.godRaysPass.enabled = this.settings.godRays;
    this.composer.addPass(this.godRaysPass);

    this.fogPass = new ShaderPass(FogShader);
    this.fogPass.enabled = this.settings.fog;
    this.composer.addPass(this.fogPass);

    // Color grade is always on when shaders are enabled (cheap, big visual win)
    this.colorGradePass = new ShaderPass(ColorGradeShader);
    this.colorGradePass.enabled = true;
    this.composer.addPass(this.colorGradePass);

    // FXAA always on at the end of the chain
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.enabled = true;
    (this.fxaaPass.uniforms.resolution.value as THREE.Vector2).set(
      window.innerWidth,
      window.innerHeight
    );
    this.composer.addPass(this.fxaaPass);

    // FXAA + ColorGrade are the last passes — must render to screen
    this.fxaaPass.renderToScreen = true;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.settings.enabled = enabled;
    if (enabled && !this.composer) this.init();
    if (this.composer) {
      if (this.renderPass) this.renderPass.enabled = enabled;
      if (this.bloomPass) this.bloomPass.enabled = enabled && this.settings.bloom;
      if (this.fogPass) this.fogPass.enabled = enabled && this.settings.fog;
      if (this.godRaysPass) this.godRaysPass.enabled = enabled && this.settings.godRays;
      if (this.colorGradePass) this.colorGradePass.enabled = enabled;
      if (this.fxaaPass) this.fxaaPass.enabled = enabled;
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
    if (key === "toneMappingExposure") {
      this.renderer.toneMappingExposure = value;
      if (this.colorGradePass)
        (this.colorGradePass.uniforms.uExposure as any).value = value;
    }
  }

  /** Sync per-frame uniforms that depend on the live scene (sun dir, camera, etc.) */
  updateDynamicUniforms(
    sunScreenPos: THREE.Vector2 | null,
    sunDirWorld: THREE.Vector3,
    cameraPos: THREE.Vector3,
    skyColor: THREE.Color,
    fogColor: THREE.Color,
    fogNear: number,
    fogFar: number
  ) {
    if (this.godRaysPass && sunScreenPos) {
      (this.godRaysPass.uniforms.sunPosition.value as THREE.Vector2).copy(sunScreenPos);
    }
    if (this.waterMaterial) {
      const u = this.waterMaterial.uniforms;
      (u.uSunDir.value as THREE.Vector3).copy(sunDirWorld).normalize();
      (u.uCameraPos.value as THREE.Vector3).copy(cameraPos);
      (u.uSkyColor.value as THREE.Color).copy(skyColor);
      (u.uFogColor.value as THREE.Color).copy(fogColor);
      u.uFogNear.value = fogNear;
      u.uFogFar.value = fogFar;
    }
    if (this.fogPass) {
      (this.fogPass.uniforms.fogColor.value as THREE.Color).copy(fogColor);
      (this.fogPass.uniforms.fogNear.value as any) = fogNear;
      (this.fogPass.uniforms.fogFar.value as any) = fogFar;
    }
    if (this.colorGradePass) {
      (this.colorGradePass.uniforms.uTime as any).value = this.clock.getElapsedTime();
    }
  }

  render() {
    if (this.enabled && this.composer) {
      const time = this.clock.getElapsedTime();
      if (this.windMaterial) {
        this.windMaterial.uniforms.uTime.value = time;
        this.windMaterial.uniforms.uSpeed.value = this.settings.windSpeed;
        this.windMaterial.uniforms.uAmplitude.value = this.settings.windAmplitude;
      }
      if (this.waterMaterial) {
        this.waterMaterial.uniforms.uTime.value = time;
        this.waterMaterial.uniforms.uOpacity.value = this.settings.waterWaves ? 0.7 : 0.78;
      }
      this.composer.render();
    }
  }

  createWindMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
    this.windMaterial = new THREE.ShaderMaterial({
      uniforms: { ...WindShader.uniforms, map: { value: texture } },
      vertexShader: WindShader.vertexShader,
      fragmentShader: WindShader.fragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
      alphaTest: 0.5,
    });
    return this.windMaterial;
  }

  createWaterMaterial(): THREE.ShaderMaterial {
    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(WaterShader.uniforms),
      vertexShader: WaterShader.vertexShader,
      fragmentShader: WaterShader.fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    return this.waterMaterial;
  }

  resize(width: number, height: number) {
    if (this.composer) {
      this.composer.setSize(width, height);
      if (this.fxaaPass) {
        (this.fxaaPass.uniforms.resolution.value as THREE.Vector2).set(width, height);
      }
    }
  }

  dispose() {
    if (this.composer) this.composer.dispose();
    if (this.windMaterial) this.windMaterial.dispose();
    if (this.waterMaterial) this.waterMaterial.dispose();
  }
}
