'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Organizer-section artifact: a procedural gold trophy — lathe-turned cup,
// tube handles swept along CatmullRom curves, emissive core, ground glow
// ring, and rising sparkles. Fully procedural (no models, textures, or
// network fetches), theme-aware via MutationObserver, paused offscreen, and
// a single static frame when reduced motion is preferred.
interface Palette {
  gold: number
  core: number
  ring: number
  spark: number
  ambient: number
}

const DARK: Palette = {
  gold: 0xd9a441,
  core: 0xffe08a,
  ring: 0x22d3ee,
  spark: 0xffd166,
  ambient: 0.5,
}

const LIGHT: Palette = {
  gold: 0xb97a1a,
  core: 0xf59e0b,
  ring: 0x0891b2,
  spark: 0xd97706,
  ambient: 0.9,
}

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}

export default function OrganizerArtifact() {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || typeof window === 'undefined') return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const palette = isDarkTheme() ? DARK : LIGHT

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      38,
      mount.clientWidth / Math.max(1, mount.clientHeight),
      0.1,
      100,
    )
    camera.position.set(0, 2.0, 8.5)
    camera.lookAt(0, 1.3, 0)

    const trophy = new THREE.Group()
    scene.add(trophy)

    const goldMat = new THREE.MeshStandardMaterial({
      color: palette.gold,
      metalness: 0.9,
      roughness: 0.28,
      side: THREE.DoubleSide,
    })

    // Lathe-turned cup: base, stem, flared bowl.
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.95, 0),
      new THREE.Vector2(0.95, 0.1),
      new THREE.Vector2(0.55, 0.16),
      new THREE.Vector2(0.3, 0.24),
      new THREE.Vector2(0.26, 0.5),
      new THREE.Vector2(0.3, 0.85),
      new THREE.Vector2(0.55, 1.0),
      new THREE.Vector2(0.95, 1.25),
      new THREE.Vector2(1.15, 1.65),
      new THREE.Vector2(1.18, 1.95),
      new THREE.Vector2(1.12, 2.0),
    ]
    const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), goldMat)
    trophy.add(cup)

    // Handles swept from rim to body so both ends land on the surface.
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.1, 1.9, 0),
      new THREE.Vector3(1.72, 1.72, 0),
      new THREE.Vector3(1.78, 1.35, 0),
      new THREE.Vector3(0.82, 1.12, 0),
    ])
    const handleGeo = new THREE.TubeGeometry(handleCurve, 32, 0.08, 12, false)
    const handleRight = new THREE.Mesh(handleGeo, goldMat)
    const handleLeft = new THREE.Mesh(handleGeo.clone(), goldMat)
    handleLeft.scale.x = -1
    trophy.add(handleRight, handleLeft)

    // Emissive core hovering over the bowl.
    const coreMat = new THREE.MeshStandardMaterial({
      color: palette.core,
      emissive: palette.core,
      emissiveIntensity: 1.1,
      roughness: 0.3,
      metalness: 0.1,
    })
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), coreMat)
    core.position.y = 2.55
    trophy.add(core)

    // Ground glow: thin ring plus a soft additive disc.
    const ringMat = new THREE.MeshBasicMaterial({
      color: palette.ring,
      transparent: true,
      opacity: 0.55,
    })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.03, 8, 96), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.02
    const discMat = new THREE.MeshBasicMaterial({
      color: palette.gold,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), discMat)
    disc.rotation.x = -Math.PI / 2
    disc.position.y = 0.01
    scene.add(ring, disc)

    // Rising sparkles around the trophy.
    const S_COUNT = 70
    const positions = new Float32Array(S_COUNT * 3)
    for (let i = 0; i < S_COUNT; i += 1) {
      const angle = (i / S_COUNT) * Math.PI * 2 + Math.sin(i * 7.3) * 0.4
      const radius = 1.4 + Math.abs(Math.sin(i * 3.1)) * 1.6
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.abs(Math.sin(i * 13.7)) * 4
      positions[i * 3 + 2] = Math.sin(angle) * radius
    }
    const sparkGeo = new THREE.BufferGeometry()
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const sparkMat = new THREE.PointsMaterial({
      color: palette.spark,
      size: 0.06,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const sparks = new THREE.Points(sparkGeo, sparkMat)
    scene.add(sparks)

    // Lights: soft ambient, key, gold glow from the bowl, cyan rim.
    scene.add(new THREE.AmbientLight(0xffffff, palette.ambient))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(5, 8, 6)
    scene.add(key)
    const bowlGlow = new THREE.PointLight(palette.core, 25, 12)
    bowlGlow.position.set(0, 2.5, 0.8)
    scene.add(bowlGlow)
    const rimGlow = new THREE.PointLight(palette.ring, 30, 25)
    rimGlow.position.set(-5, 2, -3)
    scene.add(rimGlow)

    // Theme changes re-tint the artifact without rebuilding it.
    const observer = new MutationObserver(() => {
      const next = isDarkTheme() ? DARK : LIGHT
      goldMat.color.setHex(next.gold)
      coreMat.color.setHex(next.core)
      coreMat.emissive.setHex(next.core)
      ringMat.color.setHex(next.ring)
      sparkMat.color.setHex(next.spark)
      discMat.color.setHex(next.gold)
      bowlGlow.color.setHex(next.core)
      rimGlow.color.setHex(next.ring)
      scene.traverse((child) => {
        if ((child as THREE.AmbientLight).isAmbientLight) {
          ;(child as THREE.AmbientLight).intensity = next.ambient
        }
      })
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    function resize() {
      if (!mount) return
      const width = mount.clientWidth
      const height = Math.max(1, mount.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', resize)

    let running = true
    let raf = 0
    const io = new IntersectionObserver(
      (entries) => {
        running = entries[0]?.isIntersecting ?? true
      },
      { threshold: 0 },
    )
    io.observe(mount)

    const clock = new THREE.Clock()
    function frame() {
      raf = requestAnimationFrame(frame)
      if (!running) return
      const t = clock.getElapsedTime()
      trophy.rotation.y = t * 0.3
      trophy.position.y = Math.sin(t * 0.9) * 0.08
      core.rotation.y = t * 0.9
      core.position.y = 2.55 + Math.sin(t * 1.2) * 0.08
      const pos = sparkGeo.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      for (let i = 0; i < S_COUNT; i += 1) {
        arr[i * 3 + 1] += 0.008
        if (arr[i * 3 + 1] > 4.2) arr[i * 3 + 1] = 0
      }
      pos.needsUpdate = true
      renderer.render(scene, camera)
    }

    if (reduceMotion) {
      renderer.render(scene, camera)
    } else {
      frame()
    }

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      observer.disconnect()
      window.removeEventListener('resize', resize)
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh || (child as THREE.Points).isPoints) {
          mesh.geometry?.dispose()
          const material = mesh.material as THREE.Material | THREE.Material[]
          if (Array.isArray(material)) material.forEach((m) => m.dispose())
          else material?.dispose()
        }
      })
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />
}
