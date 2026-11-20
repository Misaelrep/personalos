import { useEffect, useRef } from 'react'

/**
 * PROTOTYPE · Liquid Platinum background: a living metal surface drawn by a
 * small WebGL shader. No video, no images.
 *
 * Energy on iPhone:
 *  - Drawn at half the screen's CSS resolution (the surface is soft, the
 *    browser scales it up), at most 30 frames per second.
 *  - Paused when the page is hidden; one still frame with reduced movement or
 *    on calm screens.
 *  - If WebGL is not available, the CSS pearl gradient underneath stays.
 *
 * Legibility: the surface never goes darker than a light silver, and a veil
 * lightens it further where you read (lists, task).
 */

export type Acabado = 'A' | 'B'
export type Intensidad = 'vivo' | 'discreto' | 'calma'

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uWave;     // how liquid the surface is
uniform float uIri;      // iridescence (lavender, cold blue, pale pink)
uniform float uContrast; // depth of the metal shading
uniform float uVeil;     // lightening for reading
uniform float uGloss;    // sharpness of the white reflections

float h(vec2 p, float t){
  vec2 q = p;
  q += uWave * 0.55 * vec2(sin(q.y * 1.6 + t * 0.55), sin(q.x * 1.3 - t * 0.45));
  q += uWave * 0.28 * vec2(sin(q.y * 2.9 - t * 0.35 + 1.3), sin(q.x * 2.5 + t * 0.40 + 0.7));
  return sin(q.x * 1.25 + q.y * 0.85) * 0.6 + sin(-q.x * 0.7 + q.y * 2.1 + 1.7) * 0.4;
}

vec3 tint(float f){
  vec3 lav = vec3(0.86, 0.82, 0.97);
  vec3 blu = vec3(0.80, 0.88, 0.98);
  vec3 pnk = vec3(0.98, 0.87, 0.90);
  f = fract(f) * 3.0;
  if (f < 1.0) return mix(lav, blu, smoothstep(0.0, 1.0, f));
  if (f < 2.0) return mix(blu, pnk, smoothstep(1.0, 2.0, f));
  return mix(pnk, lav, smoothstep(2.0, 3.0, f));
}

void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.4;
  p = mat2(0.8, -0.6, 0.6, 0.8) * p; // waves run diagonally, like light on a sheet of metal
  float t = uTime;
  float e = 0.012;
  float c = h(p, t);
  float dx = h(p + vec2(e, 0.0), t) - c;
  float dy = h(p + vec2(0.0, e), t) - c;
  vec3 n = normalize(vec3(-dx / e * 0.42, -dy / e * 0.42, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(vec3(0.5, 0.7, 0.55));
  vec3 R = reflect(-V, n);

  // A studio environment: bright soft light above-right, cooler silver below.
  float sky = smoothstep(-0.55, 0.85, R.y * 0.75 + R.x * 0.35);
  vec3 env = mix(vec3(0.71, 0.72, 0.77), vec3(0.985, 0.985, 1.0), sky);
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float rl = clamp(dot(reflect(-L, n), V), 0.0, 1.0);
  float spec = pow(rl, uGloss);
  float sheen = pow(rl, 5.0);
  // Liquid contours: thin bright curves where the surface folds.
  float band = pow(1.0 - abs(sin(c * 3.0 + t * 0.12)), 14.0);

  vec3 col = env * 0.78 + vec3(0.88, 0.89, 0.92) * diff * 0.22;
  float ang = dot(n, V);
  vec3 film = tint(ang * 1.4 + c * 0.22 + t * 0.025);
  col = mix(col, col * film * 1.12, uIri * (1.15 - ang * 0.6));
  col += vec3(1.0) * (spec * 0.85 + sheen * 0.10 + band * 0.30 * uWave);
  col *= 0.86 + 0.14 * sky;

  col = mix(vec3(0.90, 0.905, 0.93), col, uContrast);
  col = mix(col, vec3(0.955, 0.957, 0.968), uVeil);
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`

const FINISH: Record<Acabado, { wave: number; iri: number; contrast: number; gloss: number; speed: number }> = {
  // A · satin silver: calm folds, soft reflections, a hint of colour.
  A: { wave: 0.6, iri: 0.18, contrast: 0.78, gloss: 22, speed: 0.32 },
  // B · iridescent liquid metal: deeper folds, sharp white light, lavender, blue and pink.
  B: { wave: 1.0, iri: 0.72, contrast: 0.92, gloss: 40, speed: 0.45 },
}
const LEVEL: Record<Intensidad, { veil: number; speed: number; still: boolean }> = {
  vivo: { veil: 0.08, speed: 1, still: false },
  discreto: { veil: 0.38, speed: 0.7, still: false },
  calma: { veil: 0.55, speed: 0, still: true },
}

export function MetalLiquido({ acabado, intensidad, quieto }: { acabado: Acabado; intensidad: Intensidad; quieto: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Props read by the running loop without restarting it.
  const live = useRef({ acabado, intensidad, quieto })
  live.current = { acabado, intensidad, quieto }
  const redraw = useRef<() => void>(() => {})

  useEffect(() => {
    const cv = canvas.current
    const gl = cv?.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false })
    if (!cv || !gl) return
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const u = (n: string) => gl.getUniformLocation(prog, n)
    const U = { res: u('uRes'), time: u('uTime'), wave: u('uWave'), iri: u('uIri'), contrast: u('uContrast'), veil: u('uVeil'), gloss: u('uGloss') }

    const size = () => {
      const w = Math.max(1, Math.round(window.innerWidth * 0.5))
      const h = Math.max(1, Math.round(window.innerHeight * 0.5))
      if (cv.width !== w || cv.height !== h) {
        cv.width = w
        cv.height = h
        gl.viewport(0, 0, w, h)
      }
    }
    // Surface time advances only while it moves, so pausing never jumps.
    let surface = 7.5
    let last = performance.now()
    let raf = 0
    let lastDraw = 0
    const draw = () => {
      const f = FINISH[live.current.acabado]
      const l = LEVEL[live.current.intensidad]
      size()
      gl.uniform2f(U.res, cv.width, cv.height)
      gl.uniform1f(U.time, surface)
      gl.uniform1f(U.wave, f.wave)
      gl.uniform1f(U.iri, f.iri)
      gl.uniform1f(U.contrast, f.contrast)
      gl.uniform1f(U.veil, l.veil)
      gl.uniform1f(U.gloss, f.gloss)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      ;(window as unknown as { __metalFrames?: number }).__metalFrames = ((window as unknown as { __metalFrames?: number }).__metalFrames ?? 0) + 1
    }
    const moving = () => !live.current.quieto && !LEVEL[live.current.intensidad].still && !document.hidden
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!moving()) return
      surface += dt * FINISH[live.current.acabado].speed * LEVEL[live.current.intensidad].speed
      if (now - lastDraw >= 33) {
        lastDraw = now
        draw()
      }
      raf = requestAnimationFrame(tick)
    }
    const start = () => {
      draw()
      if (moving() && !raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    redraw.current = start
    const onVis = () => start()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', start)
    start()
    cv.dataset.webgl = 'true'
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', start)
    }
  }, [])

  useEffect(() => redraw.current(), [acabado, intensidad, quieto])

  return <canvas ref={canvas} aria-hidden className="pl-metal" data-testid="metal" />
}
