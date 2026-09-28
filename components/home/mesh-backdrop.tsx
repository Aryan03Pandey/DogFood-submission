'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Fixed ambient mesh behind the entire homepage: a fading procedural grid,
// slow-drifting particles, and two soft glow sprites. Fully procedural (no
// models, textures, or network fetches), theme-aware via MutationObserver,
// and a single static frame when reduced motion is preferred. Deliberately
// faint so copy and solid cards stay legible — page sections must stay
// transparent for it to show through.
interface Palette {
  grid: number
  particle: number
  glowA: number
  glowB: number
}

const DARK: Palette = {
  grid: 0x274b73,
  particle: 0x67e8f9,
  glowA: 0x0e7490,
  glowB: 0x701a75,
}

const LIGHT: Palette = {
  grid: 0xa9c3e2,
  particle: 0x0891b2,
  glowA: 0x7dd3fc,
  glowB: 0xe9a8f2,
}

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}

function makeGlowTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  if (!ctx) return texture
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.32)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  texture.needsUpdate = true
  return texture
}

export default function MeshBackdrop() {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || typeof window === 'undefined') return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const palette = isDarkTheme() ? DARK : LIGHT

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 200)
    camera.position.set(0, 2.5, 12)
    camera.lookAt(0, 0.5, 0)

    // Fading floor grid receding to the horizon.
    const grid = new THREE.GridHelper(90, 90, palette.grid, palette.grid)
    grid.position.y = -2.5
    const gridMat = grid.material as THREE.Material
    gridMat.transparent = true
    gridMat.opacity = 0.32
    scene.add(grid)

    // Slow-drifting particles for depth.
    const P_COUNT = 220
    const positions = new Float32Array(P_COUNT * 3)
    for (let i = 0; i < P_COUNT; i += 1) {
      positions[i * 3] = Math.sin(i * 12.9898) * 16
      positions[i * 3 + 1] = (Math.abs(Math.sin(i * 78.233)) - 0.25) * 11
      positions[i * 3 + 2] = Math.cos(i * 37.719) * 8 - 2
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const particleMat = new THREE.PointsMaterial({
      color: palette.particle,
      size: 0.07,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const particles = new THREE.Points(particleGeo, particleMat)
    scene.add(particles)

    // Two soft glow sprites washing the left and right edges.
    const glowTexture = makeGlowTexture()
    const spriteMatA = new THREE.SpriteMaterial({
      map: glowTexture,
      color: palette.glowA,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const spriteA = new THREE.Sprite(spriteMatA)
    spriteA.scale.set(20, 13, 1)
    spriteA.position.set(-9, 3, -5)
    const spriteMatB = new THREE.SpriteMaterial({
      map: glowTexture,
      color: palette.glowB,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const spriteB = new THREE.Sprite(spriteMatB)
    spriteB.scale.set(18, 12, 1)
    spriteB.position.set(10, 0, -6)
    scene.add(spriteA, spriteB)

    // Theme changes re-tint the mesh without rebuilding it.
    const gridLineMat = grid.material as THREE.LineBasicMaterial
    const observer = new MutationObserver(() => {
      const next = isDarkTheme() ? DARK : LIGHT
      gridLineMat.color.setHex(next.grid)
      particleMat.color.setHex(next.particle)
      spriteMatA.color.setHex(next.glowA)
      spriteMatB.color.setHex(next.glowB)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    function resize() {
      const width = window.innerWidth
      const height = Math.max(1, window.innerHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', resize)

    let running = !document.hidden
    function onVisibilityChange() {
      running = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    let raf = 0
    const clock = new THREE.Clock()
    function frame() {
      raf = requestAnimationFrame(frame)
      if (!running) return
      const t = clock.getElapsedTime()
      const pos = particleGeo.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      for (let i = 0; i < P_COUNT; i += 1) {
        arr[i * 3 + 1] += 0.004
        if (arr[i * 3 + 1] > 8) arr[i * 3 + 1] = -2.5
      }
      pos.needsUpdate = true
      spriteA.position.x = -9 + Math.sin(t * 0.12) * 1.2
      spriteB.position.x = 10 + Math.cos(t * 0.1) * 1.2
      renderer.render(scene, camera)
    }

    if (reduceMotion) {
      renderer.render(scene, camera)
    } else {
      frame()
    }

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      particleGeo.dispose()
      particleMat.dispose()
      grid.geometry.dispose()
      gridMat.dispose()
      spriteMatA.dispose()
      spriteMatB.dispose()
      glowTexture.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
}
