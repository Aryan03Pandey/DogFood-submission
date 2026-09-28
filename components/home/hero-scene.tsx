'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Homepage hero visual: a "infinity cube" — nested glowing wireframe cubes
// orbited by tilted rings and a slow particle drift. Fully procedural (no
// models, textures, or network fetches), theme-aware, and paused offscreen.
interface Palette {
  edge: number
  accent: number
  particle: number
  glow: number
  fog: number
  ambient: number
}

const DARK: Palette = {
  edge: 0x22d3ee,
  accent: 0xe879f9,
  particle: 0xfbbf24,
  glow: 0x0e7490,
  fog: 0x070b24,
  ambient: 0.55,
}

const LIGHT: Palette = {
  edge: 0x0891b2,
  accent: 0xa21caf,
  particle: 0xd97706,
  glow: 0x67e8f9,
  fog: 0xeef4fb,
  ambient: 0.9,
}

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}

export default function HeroScene() {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || typeof window === 'undefined') return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let palette = isDarkTheme() ? DARK : LIGHT

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(palette.fog, 16, 32)

    const camera = new THREE.PerspectiveCamera(
      40,
      mount.clientWidth / Math.max(1, mount.clientHeight),
      0.1,
      100,
    )
    camera.position.set(0, 1.4, 9)
    camera.lookAt(0, 0.4, 0)

    const rig = new THREE.Group()
    scene.add(rig)

    // Outer cube: glowing edges + faint faces.
    const outerSize = 3.2
    const outerGeo = new THREE.BoxGeometry(outerSize, outerSize, outerSize)
    const edgeMat = new THREE.LineBasicMaterial({ color: palette.edge, transparent: true, opacity: 0.95 })
    const outer = new THREE.LineSegments(new THREE.EdgesGeometry(outerGeo), edgeMat)
    const faceMat = new THREE.MeshBasicMaterial({
      color: palette.edge,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const faces = new THREE.Mesh(outerGeo, faceMat)
    // Halo: a slightly larger additive shell for the glow.
    const haloMat = new THREE.MeshBasicMaterial({
      color: palette.glow,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const halo = new THREE.Mesh(new THREE.BoxGeometry(outerSize * 1.12, outerSize * 1.12, outerSize * 1.12), haloMat)
    // Corner nodes.
    const nodeGeo = new THREE.SphereGeometry(0.07, 12, 12)
    const nodeMat = new THREE.MeshBasicMaterial({ color: palette.accent })
    const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, 8)
    const corner = new THREE.Object3D()
    let n = 0
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          corner.position.set((x * outerSize) / 2, (y * outerSize) / 2, (z * outerSize) / 2)
          corner.updateMatrix()
          nodes.setMatrixAt(n, corner.matrix)
          n += 1
        }
      }
    }
    nodes.instanceMatrix.needsUpdate = true

    // Inner cube: counter-rotating accent core.
    const innerSize = 1.5
    const innerGeo = new THREE.BoxGeometry(innerSize, innerSize, innerSize)
    const inner = new THREE.LineSegments(
      new THREE.EdgesGeometry(innerGeo),
      new THREE.LineBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.95 }),
    )
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45),
      new THREE.MeshStandardMaterial({
        color: palette.accent,
        emissive: palette.accent,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.2,
      }),
    )

    // Orbit rings.
    const ringMat = new THREE.MeshBasicMaterial({
      color: palette.edge,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
    const ringMat2 = ringMat.clone()
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.02, 8, 128), ringMat)
    ring1.rotation.x = Math.PI / 2.4
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.015, 8, 128), ringMat2)
    ring2.material.opacity = 0.22
    ring2.rotation.x = Math.PI / 1.8
    ring2.rotation.y = 0.5

    const cube = new THREE.Group()
    cube.add(faces, outer, halo, nodes, inner, core)
    rig.add(cube, ring1, ring2)

    // Drifting particles for depth.
    const P_COUNT = 160
    const positions = new Float32Array(P_COUNT * 3)
    for (let i = 0; i < P_COUNT; i += 1) {
      positions[i * 3] = Math.sin(i * 12.9898) * 7
      positions[i * 3 + 1] = (Math.abs(Math.sin(i * 78.233)) - 0.3) * 8
      positions[i * 3 + 2] = Math.cos(i * 37.719) * 7
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({
        color: palette.particle,
        size: 0.06,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    rig.add(particles)

    // Lights.
    scene.add(new THREE.AmbientLight(0xffffff, palette.ambient))
    const key = new THREE.DirectionalLight(0xffffff, 1.0)
    key.position.set(5, 8, 6)
    scene.add(key)
    const cyanGlow = new THREE.PointLight(palette.edge, 40, 24)
    cyanGlow.position.set(0, 1.5, 4)
    scene.add(cyanGlow)
    const magentaGlow = new THREE.PointLight(palette.accent, 30, 24)
    magentaGlow.position.set(-4, -1, -2)
    scene.add(magentaGlow)

    // Mouse parallax (desktop pointers only).
    const pointer = { x: 0, y: 0 }
    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === 'mouse') {
        pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
        pointer.y = (event.clientY / window.innerHeight - 0.5) * 2
      }
    }
    window.addEventListener('pointermove', onPointerMove)

    // Theme changes re-tint the scene without rebuilding it.
    const observer = new MutationObserver(() => {
      palette = isDarkTheme() ? DARK : LIGHT
      edgeMat.color.setHex(palette.edge)
      faceMat.color.setHex(palette.edge)
      haloMat.color.setHex(palette.glow)
      nodeMat.color.setHex(palette.accent)
      ;(inner.material as THREE.LineBasicMaterial).color.setHex(palette.accent)
      ;(core.material as THREE.MeshStandardMaterial).color.setHex(palette.accent)
      ;(core.material as THREE.MeshStandardMaterial).emissive.setHex(palette.accent)
      ;(particles.material as THREE.PointsMaterial).color.setHex(palette.particle)
      ringMat.color.setHex(palette.edge)
      ringMat2.color.setHex(palette.edge)
      ;(scene.fog as THREE.Fog).color.setHex(palette.fog)
      cyanGlow.color.setHex(palette.edge)
      magentaGlow.color.setHex(palette.accent)
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
      cube.rotation.y = t * 0.35 + pointer.x * 0.25
      cube.rotation.x = Math.sin(t * 0.3) * 0.18 + pointer.y * 0.12
      inner.rotation.y = -t * 0.5
      inner.rotation.z = t * 0.22
      core.rotation.y = t * 0.8
      ring1.rotation.z = t * 0.12
      ring2.rotation.z = -t * 0.09
      cube.position.y = Math.sin(t * 0.9) * 0.15
      const pos = particleGeo.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      for (let i = 0; i < P_COUNT; i += 1) {
        arr[i * 3 + 1] += 0.005
        if (arr[i * 3 + 1] > 5) arr[i * 3 + 1] = -2.5
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
      window.removeEventListener('pointermove', onPointerMove)
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh || (child as THREE.Points).isPoints || (child as THREE.LineSegments).isLineSegments) {
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
