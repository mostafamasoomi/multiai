'use client'
import { useEffect, useRef } from 'react'

/* ════════════════════════════════════════════════════════════════════════════
   VortexBackground — recreation for MultiAI clone project
   Real GLSL shaders, 52k particles, noise displacement, conical taper
   ════════════════════════════════════════════════════════════════════════════ */

const VERT = `
precision highp float;

attribute float aRadius;
attribute float aAngle;
attribute float aHeight;
attribute float aSeed;
attribute float aSize;

uniform float uTime;
uniform float uPixelRatio;
uniform float uSpin;
uniform float uMotion;

varying float vRadiusNorm;
varying float vHeightNorm;
varying float vAlpha;

vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dot(hash3(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)),
            dot(hash3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
        mix(dot(hash3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)),
            dot(hash3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(dot(hash3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)),
            dot(hash3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
        mix(dot(hash3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)),
            dot(hash3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}

void main() {
  float maxR = 9.0;
  float halfH = 7.0;

  vRadiusNorm = clamp(aRadius / maxR, 0.0, 1.0);

  float omega = uSpin / (aRadius + 0.55);
  float angle = aAngle + omega * uTime * uMotion;

  float drift = 0.42 * uMotion;
  float h = aHeight + uTime * drift + aSeed * 14.0;
  h = mod(h + halfH, halfH * 2.0) - halfH;
  vHeightNorm = clamp((h + halfH) / (halfH * 2.0), 0.0, 1.0);

  // Hourglass: top narrows to waist, bottom flares into spiral disc
  float taper;
  if (h > 0.0) {
    taper = mix(1.0, 0.35, pow(smoothstep(0.0, halfH, h), 0.8));
  } else {
    float t = 1.0 - smoothstep(-halfH, 0.0, h);
    taper = 0.35 + t * 0.85 + (1.0 - t) * 0.6;
  }
  float r = aRadius * taper;

  vec3 pos = vec3(cos(angle) * r, h, sin(angle) * r);

  float nScale = 0.22;
  vec3 np = pos * nScale + vec3(0.0, uTime * 0.06, aSeed * 3.0);
  vec3 disp = vec3(noise(np), noise(np + 19.7), noise(np + 41.3));
  pos += disp * (0.85 + vRadiusNorm * 1.35) * uMotion;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  float edgeFade = smoothstep(0.0, 0.16, vHeightNorm) * (1.0 - smoothstep(0.74, 1.0, vHeightNorm));
  vAlpha = edgeFade * mix(1.0, 0.45, vRadiusNorm);

  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uPixelRatio * (34.0 / -mvPosition.z) * mix(1.15, 0.7, vRadiusNorm);
}
`

const FRAG = `
precision highp float;

uniform vec3 uColorCore;
uniform vec3 uColorRim;
uniform float uOpacity;

varying float vRadiusNorm;
varying float vHeightNorm;
varying float vAlpha;

void main() {
  float dist = length(gl_PointCoord - vec2(0.5));
  float mask = 1.0 - smoothstep(0.4, 0.5, dist);
  if (mask <= 0.001) discard;

  float mixAmt = clamp(vHeightNorm * 0.7 + vRadiusNorm * 0.3, 0.0, 1.0);
  vec3 color = mix(uColorCore, uColorRim, mixAmt);

  // Hot magenta bloom at the waist — gives the funnel a readable focal point
  // instead of an evenly-lit particle field.
  float waistGlow = exp(-pow(vHeightNorm - 0.5, 2.0) * 7.0) * (1.0 - vRadiusNorm);
  color += vec3(0.95, 0.35, 0.85) * waistGlow * 0.6;

  // Core bright center
  color += vec3(0.3) * (1.0 - smoothstep(0.0, 0.24, dist)) * (1.0 - vRadiusNorm * 0.7);

  gl_FragColor = vec4(color, mask * vAlpha * uOpacity);
}
`

const PARTICLE_DESKTOP = 52000
const PARTICLE_MOBILE = 22000
const MAX_RADIUS = 9.0
const HALF_HEIGHT = 7.0

export default function VortexBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let destroyed = false
    const canvas = canvasRef.current
    if (!canvas) return

    ;(async () => {
      try {
        const THREE = await import('three')

        if (destroyed) return

        const isMobile = window.matchMedia('(max-width: 780px)').matches
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const count = isMobile ? PARTICLE_MOBILE : PARTICLE_DESKTOP

        const scene = new THREE.Scene()

        const camera = new THREE.PerspectiveCamera(
          46,
          canvas.clientWidth / canvas.clientHeight,
          0.1,
          120
        )
        // Pulled back and lifted slightly: at z=17.5 the funnel filled the frame
        // edge-to-edge and read as ambient dust rather than a distinct shape.
        camera.position.set(0, 1.6, 21.5)
        camera.lookAt(0, -0.5, 0)

        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance'
        })
        renderer.setClearColor(0x000000, 0)

        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        renderer.setPixelRatio(dpr)
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

        const geometry = new THREE.BufferGeometry()
        const positions = new Float32Array(count * 3)
        const radii = new Float32Array(count)
        const angles = new Float32Array(count)
        const heights = new Float32Array(count)
        const seeds = new Float32Array(count)
        const sizes = new Float32Array(count)

        for (let i = 0; i < count; i++) {
          const r = Math.pow(Math.random(), 0.6) * MAX_RADIUS
          const a = Math.random() * Math.PI * 2
          const h = (Math.random() * 2 - 1) * HALF_HEIGHT

          radii[i] = r
          angles[i] = a
          heights[i] = h
          seeds[i] = Math.random()
          sizes[i] = 0.75 + Math.random() * 1.55

          positions[i * 3 + 0] = Math.cos(a) * r
          positions[i * 3 + 1] = h
          positions[i * 3 + 2] = Math.sin(a) * r
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1))
        geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1))
        geometry.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1))
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 18)

        const uniforms = {
          uTime: { value: 0 },
          uPixelRatio: { value: dpr },
          uSpin: { value: 0.78 },
          uMotion: { value: reducedMotion ? 0.0 : 1.0 },
          uOpacity: { value: 0.0 },
          // Brand violet. The previous rim (#1a3a5c) was near-black, so under
          // additive blending most of the 52k particles blended into the page
          // background and the funnel read as faint grey dust.
          uColorCore: { value: new THREE.Color('#f3e4ff') },
          uColorRim: { value: new THREE.Color('#7c3aed') }
        }

        const material = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          uniforms,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending
        })

        const points = new THREE.Points(geometry, material)
        points.frustumCulled = false

        const group = new THREE.Group()
        group.add(points)
        group.rotation.z = 0.12
        scene.add(group)

        const MAX_TILT = THREE.MathUtils.degToRad(6)
        const target = { x: 0, y: 0 }
        const current = { x: 0, y: 0 }

        function onPointerMove(e: PointerEvent) {
          if (reducedMotion) return
          const nx = (e.clientX / window.innerWidth) * 2 - 1
          const ny = (e.clientY / window.innerHeight) * 2 - 1
          target.x = ny * MAX_TILT
          target.y = nx * MAX_TILT
        }
        window.addEventListener('pointermove', onPointerMove, { passive: true })

        function resize() {
          if (!canvas) return
          const w = canvas.clientWidth
          const h = canvas.clientHeight
          if (w === 0 || h === 0) return
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          renderer.setSize(w, h, false)
        }
        const ro = new ResizeObserver(resize)
        ro.observe(canvas)

        let visible = true
        let rafId: number | null = null
        const clock = new THREE.Clock()

        const io = new IntersectionObserver(
          (entries) => {
            visible = entries[0].isIntersecting
            if (visible && rafId === null && !destroyed) {
              clock.getDelta()
              loop()
            } else if (!visible && rafId !== null) {
              cancelAnimationFrame(rafId)
              rafId = null
            }
          },
          { threshold: 0 }
        )
        io.observe(canvas)

        function loop() {
          if (destroyed) return
          rafId = requestAnimationFrame(loop)
          const dt = Math.min(clock.getDelta(), 0.05)
          uniforms.uTime.value += dt
          if (uniforms.uOpacity.value < 1.0) {
            uniforms.uOpacity.value = Math.min(1.0, uniforms.uOpacity.value + dt * 0.55)
          }
          current.x += (target.x - current.x) * 0.04
          current.y += (target.y - current.y) * 0.04
          group.rotation.x = current.x
          group.rotation.y = current.y
          renderer.render(scene, camera)
        }

        if (reducedMotion) {
          uniforms.uOpacity.value = 0.72
          renderer.render(scene, camera)
        } else {
          loop()
        }
      } catch (err) {
        console.error('Vortex failed:', err)
        canvas.closest('.motion-hero')?.classList.add('vortex-unavailable')
      }
    })()

    return () => {
      destroyed = true
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      id="vortex-canvas"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        display: 'block'
      }}
    />
  )
}
