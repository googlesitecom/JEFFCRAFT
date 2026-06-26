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
// 5. WIND SHADER — vertex displacement for foliage + subsurface scattering
//    Uses 4-octave noise-driven wind, masked by uv.y so only the top sways.
//    Fragment shader adds:
//      - Translucency (subsurface scattering) for leaves backlit by the sun
//      - Normal perturbation based on wind direction (leaves tilt as they sway)
//      - Per-pixel specular for wetness/shine
//      - Cheap AO from leaf density (darker in alpha-clumped areas)
// ============================================================================
export const WindShader = {
  uniforms: {
    uTime: { value: 0 },
    uSpeed: { value: 1.5 },
    uAmplitude: { value: 0.04 },
    uSunDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
    uSunColor: { value: new THREE.Color(1.0, 0.95, 0.8) },
    uAmbientColor: { value: new THREE.Color(0.4, 0.55, 0.7) },
    uFogColor: { value: new THREE.Color("#87ceeb") },
    uFogNear: { value: 40 },
    uFogFar: { value: 80 },
    uSSSColor: { value: new THREE.Color(0.6, 0.85, 0.4) }, // green translucency
    uSSSIntensity: { value: 0.8 },
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
    varying vec3 vViewDir;
    void main() {
      vUv = uv;
      vNormal = normal;
      vec3 pos = position;
      // Wind mask: 0 at base (uv.y < 0.3), ramps to 1 at top
      float windMask = smoothstep(0.3, 1.0, uv.y);
      // 4-octave wind: large slow swell + medium gust + small flutter + micro ripple
      float t = uTime * uSpeed;
      float w1 = sin(t + pos.y * 3.0 + pos.x * 0.5) * uAmplitude * windMask;
      float w2 = cos(t * 0.7 + pos.z * 2.0 + pos.y * 1.5) * uAmplitude * 0.6 * windMask;
      float w3 = sin(t * 1.3 + (pos.x + pos.z) * 0.8) * uAmplitude * 0.3 * windMask;
      float w4 = sin(t * 2.5 + pos.x * 5.0 + pos.z * 4.0) * uAmplitude * 0.15 * windMask;
      // Gust: occasional strong wind (every ~6 seconds, lasts ~1 second)
      float gust = pow(max(0.0, sin(t * 0.18)), 8.0) * uAmplitude * 2.5 * windMask;
      pos.x += w1 + w3 + gust;
      pos.z += w2 + w4;
      pos.y += sin(t * 0.5 + pos.x * 2.0) * uAmplitude * 0.2 * windMask;
      // Perturb normal based on wind direction (leaves tilt as they sway)
      vec3 windDir = normalize(vec3(w1 + w3 + gust, 0.0, w2 + w4));
      vNormal = normalize(normal + windDir * 0.4 * windMask);
      vWindAmount = windMask;
      vec4 worldPos = modelMatrix * vec4(pos, 1.0);
      vWorldPos = worldPos.xyz;
      vViewDir = normalize(cameraPosition - vWorldPos);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vWindAmount;
    varying vec3 vViewDir;
    uniform sampler2D map;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uAmbientColor;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform vec3 uSSSColor;
    uniform float uSSSIntensity;
    void main() {
      vec4 texel = texture2D(map, vUv);
      if (texel.a < 0.5) discard;
      vec3 N = normalize(vNormal);
      vec3 L = normalize(uSunDir);
      vec3 V = normalize(vViewDir);
      // Standard diffuse (Lambert)
      float NdotL = max(dot(N, L), 0.0);
      // Subsurface scattering: light passes through thin leaves when backlit
      // (when sun is on the opposite side of the leaf from the camera).
      // We use the negative of the normal dotted with light, scaled by view factor.
      float backLit = max(dot(-N, L), 0.0);
      float viewFactor = max(dot(V, -L), 0.0);
      float sss = backLit * viewFactor * uSSSIntensity;
      // Also add ambient SSS so leaves aren't pitch black in shadow
      sss += 0.15 * uSSSIntensity;
      // Specular (Blinn-Phong) — small, tight highlight for waxy leaf surface
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 64.0) * 0.25;
      // Compose color: ambient + diffuse + SSS + specular
      vec3 ambient = uAmbientColor * texel.rgb;
      vec3 diffuse = uSunColor * texel.rgb * NdotL;
      vec3 sssColor = uSSSColor * sss * texel.rgb * 0.6;
      vec3 specColor = uSunColor * spec;
      vec3 color = ambient + diffuse + sssColor + specColor;
      // Wind motion catches sunlight — brighten the swaying parts subtly
      color += uSunColor * vWindAmount * 0.04 * (0.5 + 0.5 * sin(uTime * 2.0));
      // Distance fog
      float dist = length(vWorldPos - cameraPosition);
      float fogFactor = smoothstep(uFogNear, uFogFar, dist);
      color = mix(color, uFogColor, fogFactor * 0.4);
      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

// ============================================================================
// 6. WATER SHADER — realistic water with flow, ripples, refraction, SSS
//    Features:
//      - 5-octave Gerstner waves with directional flow
//      - Player interaction ripples (uniform array, max 4 active ripples)
//      - Analytical normals from wave derivatives
//      - Blinn-Phong specular with sun glitter
//      - Fresnel sky reflection
//      - Refraction distortion (fake — bends the underwater UV)
//      - Subsurface scattering for water depth translucency
//      - Animated caustics on the water surface
//      - Foam at wave crests
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
    // Player ripple sources — up to 4 simultaneous
    uRipplePositions: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uRippleTimes: { value: [0, 0, 0, 0] }, // time since ripple started, 0 = inactive
    uRippleStrength: { value: 1.0 },
  },
  vertexShader: `
    uniform float uTime;
    uniform vec3 uRipplePositions[4];
    uniform float uRippleTimes[4];
    uniform float uRippleStrength;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vWaveHeight;
    varying vec2 vUv;
    varying vec3 vViewDir;
    varying float vFoam;
    varying float vRipple;

    // Single Gerstner wave contribution
    // dir = horizontal direction (normalized), steepness, wavelength, speed
    vec3 gerstner(vec2 dir, float steepness, float wavelength, float speed, vec2 pos, float t, inout vec3 tangent, inout vec3 binormal) {
      float k = 6.28318 / wavelength;
      float c = speed;
      vec2 d = normalize(dir);
      float f = k * dot(d, pos) - c * t;
      float a = steepness / k;
      // Position offset
      vec3 offset;
      offset.x = d.x * a * cos(f);
      offset.z = d.y * a * cos(f);
      offset.y = a * sin(f);
      // Tangent (d/dx)
      tangent += vec3(
        -d.x * d.x * steepness * sin(f),
        d.x * k * a * cos(f),
        -d.x * d.y * steepness * sin(f)
      );
      // Binormal (d/dz)
      binormal += vec3(
        -d.x * d.y * steepness * sin(f),
        d.y * k * a * cos(f),
        -d.y * d.y * steepness * sin(f)
      );
      return offset;
    }

    void main() {
      vUv = uv;
      vec3 pos = position;
      vec2 posXZ = vec2(pos.x, pos.z);

      // === Gerstner waves — 5 directional waves with flow ===
      vec3 tangent = vec3(1.0, 0.0, 0.0);
      vec3 binormal = vec3(0.0, 0.0, 1.0);
      vec3 wave = vec3(0.0);
      // Large swell (slow, big amplitude) — flowing east
      wave += gerstner(vec2(1.0, 0.2), 0.06, 8.0, 1.2, posXZ, uTime, tangent, binormal);
      // Medium wave — flowing north-east
      wave += gerstner(vec2(0.6, 0.8), 0.04, 5.0, 1.5, posXZ, uTime, tangent, binormal);
      // Small choppy wave — flowing west
      wave += gerstner(vec2(-0.8, 0.3), 0.025, 3.0, 2.0, posXZ, uTime, tangent, binormal);
      // Tiny ripple — flowing south
      wave += gerstner(vec2(0.2, -0.9), 0.015, 1.5, 2.5, posXZ, uTime, tangent, binormal);
      // Micro detail
      wave += gerstner(vec2(0.7, 0.5), 0.008, 0.8, 3.0, posXZ, uTime, tangent, binormal);

      pos += wave;
      vWaveHeight = wave.y;
      vFoam = smoothstep(0.08, 0.14, wave.y); // foam on tall crests

      // === Player interaction ripples ===
      // Each ripple is a expanding ring centered on the player's position when
      // they entered the water. We sum 4 simultaneous ripples.
      float rippleTotal = 0.0;
      for (int i = 0; i < 4; i++) {
        float rt = uRippleTimes[i];
        if (rt <= 0.0) continue;
        vec3 rp = uRipplePositions[i];
        float distToRipple = length(posXZ - vec2(rp.x, rp.z));
        // Expanding ring: radius grows with time, amplitude decays
        float radius = rt * 3.5; // 3.5 blocks/sec expansion
        float ringDist = abs(distToRipple - radius);
        float ringWidth = 0.8;
        float ring = exp(-ringDist * ringDist / (ringWidth * ringWidth));
        // Decay over time (ripple fades after ~2 seconds)
        float decay = max(0.0, 1.0 - rt / 2.0);
        float amp = 0.1 * ring * decay * uRippleStrength;
        // Apply as Y displacement
        pos.y += amp * sin(rt * 12.0 - distToRipple * 4.0);
        // Accumulate for normal perturbation
        rippleTotal += amp;
      }
      vRipple = rippleTotal;

      // Normal from tangent/binormal cross product
      vNormal = normalize(cross(tangent, binormal));

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
    varying float vFoam;
    varying float vRipple;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDir);
      vec3 L = normalize(uSunDir);

      // === Depth-based color ===
      // Wave crests = shallow (bright cyan), troughs = deep (dark blue)
      float depthFactor = smoothstep(-0.1, 0.14, vWaveHeight);
      vec3 color = mix(uDeepColor, uShallowColor, depthFactor);
      color = mix(color, uWaterColor, 0.45);

      // === Refraction distortion ===
      // Bend the UV based on the normal to fake the underwater distortion
      vec2 refractUv = vUv + N.xz * 0.04;
      // Sample a procedural underwater pattern (cheap)
      float underwater = sin(refractUv.x * 30.0 + uTime * 1.5) * sin(refractUv.y * 30.0 + uTime * 1.2);
      color += vec3(0.05, 0.12, 0.15) * underwater * 0.15;

      // === Sun specular (Blinn-Phong) with tighter highlight ===
      vec3 H = normalize(L + V);
      float specSharp = pow(max(dot(N, H), 0.0), 256.0);
      float specBroad = pow(max(dot(N, H), 0.0), 32.0) * 0.3;
      color += uSunColor * (specSharp * 1.5 + specBroad);

      // === Sun glitter (small sparkles across the surface) ===
      float glitter = pow(max(0.0, dot(N, H)), 1024.0);
      glitter += pow(max(0.0, dot(N, H) - 0.02), 4096.0) * 2.0;
      color += vec3(1.0, 0.98, 0.9) * glitter * 0.6;

      // === Fresnel sky reflection ===
      float fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
      fresnel = mix(0.04, 1.0, fresnel); // Schlick's approximation with F0=0.04
      color = mix(color, uSkyColor, fresnel * 0.6);

      // === Subsurface scattering — light through wave crests ===
      float sss = max(0.0, vWaveHeight) * 0.8 * max(dot(-L, V), 0.0);
      color += uWaterColor * sss * 1.5;

      // === Foam at wave crests ===
      vec3 foamColor = vec3(0.95, 0.97, 1.0);
      color = mix(color, foamColor, vFoam * 0.6);
      // Foam from ripples too
      color = mix(color, foamColor, smoothstep(0.05, 0.12, vRipple) * 0.4);

      // === Animated caustics ===
      float c1 = sin(vUv.x * 25.0 + uTime * 2.5) * sin(vUv.y * 25.0 + uTime * 2.0);
      float c2 = sin(vUv.x * 15.0 - uTime * 1.6) * cos(vUv.y * 18.0 + uTime * 1.1);
      float caustic = (c1 + c2 * 0.6) * 0.5;
      caustic = max(0.0, caustic);
      color += vec3(0.15, 0.25, 0.35) * caustic * 0.12;

      // === Distance fog ===
      float dist = length(vWorldPos - cameraPosition);
      float fogFactor = smoothstep(uFogNear, uFogFar, dist);
      color = mix(color, uFogColor, fogFactor);

      // Opacity: deeper areas more opaque, crests slightly more transparent
      float alpha = uOpacity + depthFactor * 0.08;
      alpha = clamp(alpha, 0.5, 0.92);

      gl_FragColor = vec4(color, alpha);
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
      // Advance ripple times (decay toward 0)
      const times = u.uRippleTimes.value as number[];
      for (let i = 0; i < 4; i++) {
        if (times[i] > 0) {
          times[i] += 1 / 60; // approximate frame dt
          if (times[i] > 2.0) times[i] = 0; // expire after 2 seconds
        }
      }
    }
    if (this.windMaterial) {
      const u = this.windMaterial.uniforms;
      (u.uSunDir.value as THREE.Vector3).copy(sunDirWorld).normalize();
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

  /** Spawn a ripple at the given world position (player entered water). */
  spawnRipple(x: number, y: number, z: number) {
    if (!this.waterMaterial) return;
    const u = this.waterMaterial.uniforms;
    const positions = u.uRipplePositions.value as THREE.Vector3[];
    const times = u.uRippleTimes.value as number[];
    // Find the oldest/inactive slot
    let oldestIdx = 0;
    let oldestTime = times[0];
    for (let i = 1; i < 4; i++) {
      if (times[i] < oldestTime || times[i] === 0) {
        oldestTime = times[i];
        oldestIdx = i;
      }
    }
    positions[oldestIdx].set(x, y, z);
    times[oldestIdx] = 0.01; // start just above 0 so it's "active"
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
