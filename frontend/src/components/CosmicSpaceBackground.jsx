import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * CosmicSpaceBackground
 *
 * Implements the cosmic space background requested by the user:
 * 1. Deep galaxy starfield background with cosmic atmosphere
 * 2. Twinkling stars (both tiny starry specks and golden 4-pointed sparkle stars)
 * 3. 5 spherical 3D planets physically rotating around their tilted axes
 *    (Blue gas giant, Peach moon, Purple swirl planet, Pink moon, Striped giant)
 */
export function CosmicSpaceBackground() {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let animationFrameId
    let isVisible = true

    // Dimensions
    let width = container.clientWidth || window.innerWidth
    let height = container.clientHeight || window.innerHeight

    // 1. Scene & Orthographic Camera (1 unit = 1 pixel at z=0)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(
      -width / 2,
      width / 2,
      height / 2,
      -height / 2,
      1,
      2000
    )
    camera.position.z = 800

    // 2. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // 3. Lighting (Sunlight from top-left to create crescent shadows as seen in reference image)
    const sunLight = new THREE.DirectionalLight(0xfff8ee, 3.2)
    sunLight.position.set(-1.8, 1.4, 2.0).normalize()
    scene.add(sunLight)

    // Soft celestial rim light
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.4)
    rimLight.position.set(1.5, -1.0, -0.5).normalize()
    scene.add(rimLight)

    // Cosmic deep blue ambient light
    const ambientLight = new THREE.AmbientLight(0x0e1b38, 0.7)
    scene.add(ambientLight)

    // Texture Loader
    const textureLoader = new THREE.TextureLoader()

    // 4. Atmosphere Glow Texture & Star Sparkle Texture
    const glowTexture = textureLoader.load('/planets/atmosphere_glow.png')
    const starSparkleTexture = textureLoader.load('/planets/star_sparkle.png')

    // 5. Build 3D Spherical Planets
    // Each planet has a pivotGroup (for axial tilt and position) and a mesh (rotating on Y axis)
    const planetDefs = [
      {
        id: 'blue_giant',
        name: 'Blue Gas Giant',
        texture: '/planets/texture_blue_giant.png',
        radius: 50,
        // Responsive anchor: fraction of width/height
        anchor: { x: 0.38, y: 0.28 }, // upper right
        axialTiltZ: 0.31, // ~18 deg
        axialTiltX: 0.12,
        rotationSpeed: 0.0035,
        glowColor: 0x38bdf8,
        glowScale: 2.3,
        glowOpacity: 0.4,
      },
      {
        id: 'peach_moon',
        name: 'Peach Moon',
        texture: '/planets/texture_peach_moon.png',
        radius: 24,
        anchor: { x: -0.38, y: 0.24 }, // upper left
        axialTiltZ: 0.16, // ~9 deg
        axialTiltX: 0.08,
        rotationSpeed: 0.0028,
        glowColor: 0xfbbf24,
        glowScale: 2.1,
        glowOpacity: 0.25,
      },
      {
        id: 'purple_swirl',
        name: 'Purple Swirl Planet',
        texture: '/planets/texture_purple_swirl.png',
        radius: 48,
        anchor: { x: -0.42, y: -0.26 }, // lower left
        axialTiltZ: 0.40, // ~23 deg
        axialTiltX: 0.15,
        rotationSpeed: 0.0032,
        glowColor: 0xc084fc,
        glowScale: 2.3,
        glowOpacity: 0.38,
      },
      {
        id: 'pink_moon',
        name: 'Pink Moon',
        texture: '/planets/texture_pink_moon.png',
        radius: 20,
        anchor: { x: 0.32, y: -0.36 }, // lower right
        axialTiltZ: 0.22, // ~13 deg
        axialTiltX: 0.05,
        rotationSpeed: 0.0042,
        glowColor: 0xf472b6,
        glowScale: 2.1,
        glowOpacity: 0.28,
      },
      {
        id: 'striped_edge',
        name: 'Striped Gas Giant',
        texture: '/planets/texture_striped_edge.png',
        radius: 56,
        anchor: { x: 0.49, y: -0.05 }, // middle right edge
        axialTiltZ: 0.24, // ~14 deg
        axialTiltX: 0.10,
        rotationSpeed: 0.0022,
        glowColor: 0xa78bfa,
        glowScale: 2.2,
        glowOpacity: 0.3,
      },
    ]

    const planets = []
    const planetGroup = new THREE.Group()
    scene.add(planetGroup)

    planetDefs.forEach((def) => {
      const tex = textureLoader.load(def.texture)
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping

      const geometry = new THREE.SphereGeometry(def.radius, 48, 48)
      const material = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.75,
        metalness: 0.1,
      })

      const mesh = new THREE.Mesh(geometry, material)

      // Atmosphere glow sprite
      const glowMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: def.glowColor,
        transparent: true,
        opacity: def.glowOpacity,
        blending: THREE.AdditiveBlending,
      })
      const glowSprite = new THREE.Sprite(glowMat)
      glowSprite.scale.set(def.radius * def.glowScale, def.radius * def.glowScale, 1)
      glowSprite.position.z = -2

      // Pivot group for setting tilted axis
      const pivot = new THREE.Group()
      pivot.rotation.z = def.axialTiltZ
      pivot.rotation.x = def.axialTiltX
      pivot.add(mesh)
      pivot.add(glowSprite)

      // Wrapper group for screen position & gentle bobbing
      const wrapper = new THREE.Group()
      wrapper.add(pivot)
      planetGroup.add(wrapper)

      planets.push({
        def,
        mesh,
        pivot,
        wrapper,
        baseY: 0,
        baseX: 0,
        speed: def.rotationSpeed,
      })
    })

    // 6. Build Golden 4-Pointed Sparkle Stars
    // Scattered across the sky at relative positions inspired by the user reference image
    const starDefs = [
      { x: -0.25, y: 0.42, size: 28, speed: 2.0, phase: 0.3 },
      { x: 0.38, y: 0.44, size: 24, speed: 1.8, phase: 1.2 },
      { x: 0.42, y: 0.38, size: 32, speed: 2.4, phase: 2.5 },
      { x: -0.42, y: 0.36, size: 30, speed: 1.6, phase: 3.1 },
      { x: -0.15, y: 0.32, size: 26, speed: 2.8, phase: 0.8 },
      { x: 0.18, y: 0.12, size: 22, speed: 2.1, phase: 4.2 },
      { x: -0.44, y: 0.05, size: 20, speed: 1.9, phase: 1.9 },
      { x: -0.32, y: 0.08, size: 22, speed: 2.5, phase: 5.1 },
      { x: -0.28, y: -0.08, size: 24, speed: 2.2, phase: 2.1 },
      { x: -0.22, y: -0.20, size: 26, speed: 1.7, phase: 3.7 },
      { x: 0.30, y: -0.12, size: 20, speed: 2.6, phase: 0.5 },
      { x: -0.14, y: -0.29, size: 22, speed: 2.0, phase: 4.8 },
      { x: 0.28, y: -0.43, size: 24, speed: 2.3, phase: 1.5 },
      { x: -0.40, y: -0.44, size: 28, speed: 1.5, phase: 2.9 },
      { x: -0.12, y: -0.40, size: 20, speed: 2.7, phase: 5.5 },
      { x: 0.05, y: 0.38, size: 18, speed: 2.2, phase: 1.1 },
      { x: -0.05, y: -0.15, size: 16, speed: 2.9, phase: 3.3 },
      { x: 0.12, y: -0.32, size: 18, speed: 2.1, phase: 0.9 },
      { x: 0.45, y: 0.18, size: 20, speed: 2.4, phase: 4.0 },
      { x: -0.35, y: -0.35, size: 18, speed: 1.8, phase: 2.0 },
      { x: 0.02, y: -0.45, size: 22, speed: 2.5, phase: 3.5 },
      { x: 0.22, y: 0.46, size: 20, speed: 2.1, phase: 1.7 },
    ]

    const goldenStars = []
    const starsGroup = new THREE.Group()
    scene.add(starsGroup)

    starDefs.forEach((s) => {
      const mat = new THREE.SpriteMaterial({
        map: starSparkleTexture,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.position.z = 10
      starsGroup.add(sprite)

      goldenStars.push({
        sprite,
        def: s,
        baseSize: s.size,
        speed: s.speed,
        phase: s.phase,
      })
    })

    // 7. Field of Tiny Twinkling Stars (Star Dust)
    const starCount = 350
    const starPositions = new Float32Array(starCount * 3)
    const starColors = new Float32Array(starCount * 3)
    const starScales = new Float32Array(starCount)
    const starTwinkleData = []

    for (let i = 0; i < starCount; i++) {
      // Random coordinates across canvas with margins
      const x = (Math.random() - 0.5) * width * 1.2
      const y = (Math.random() - 0.5) * height * 1.2
      const z = (Math.random() - 0.5) * 50

      starPositions[i * 3] = x
      starPositions[i * 3 + 1] = y
      starPositions[i * 3 + 2] = z

      // Subtle celestial colors: bright white, soft cyan, warm golden
      const palette = Math.random()
      if (palette < 0.6) {
        // Crisp white/ivory
        starColors[i * 3] = 0.95
        starColors[i * 3 + 1] = 0.98
        starColors[i * 3 + 2] = 1.0
      } else if (palette < 0.85) {
        // Soft ice cyan
        starColors[i * 3] = 0.6
        starColors[i * 3 + 1] = 0.85
        starColors[i * 3 + 2] = 1.0
      } else {
        // Warm golden speck
        starColors[i * 3] = 1.0
        starColors[i * 3 + 1] = 0.85
        starColors[i * 3 + 2] = 0.5
      }

      starScales[i] = 1.0 + Math.random() * 2.0
      starTwinkleData.push({
        speed: 1.0 + Math.random() * 3.5,
        phase: Math.random() * Math.PI * 2,
        baseAlpha: 0.3 + Math.random() * 0.7,
      })
    }

    const starPointsGeo = new THREE.BufferGeometry()
    starPointsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    starPointsGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3))

    // Tiny star circular sprite
    const pointCanvas = document.createElement('canvas')
    pointCanvas.width = 16
    pointCanvas.height = 16
    const pctx = pointCanvas.getContext('2d')
    const grad = pctx.createRadialGradient(8, 8, 0, 8, 8, 8)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.4, 'rgba(255,255,255,0.8)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    pctx.fillStyle = grad
    pctx.fillRect(0, 0, 16, 16)
    const pointTexture = new THREE.CanvasTexture(pointCanvas)

    const starPointsMat = new THREE.PointsMaterial({
      size: 4,
      vertexColors: true,
      map: pointTexture,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const starPoints = new THREE.Points(starPointsGeo, starPointsMat)
    scene.add(starPoints)

    // Position updates based on window size
    function updateLayout(w, h) {
      width = w
      height = h

      camera.left = -w / 2
      camera.right = w / 2
      camera.top = h / 2
      camera.bottom = -h / 2
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)

      const scale = Math.max(0.65, Math.min(1.15, w / 1440))

      // Reposition planets according to responsive anchors
      planets.forEach((p) => {
        const posX = p.def.anchor.x * w
        const posY = p.def.anchor.y * h
        p.baseX = posX
        p.baseY = posY
        p.wrapper.position.set(posX, posY, 0)
        p.wrapper.scale.setScalar(scale)
      })

      // Reposition golden stars
      goldenStars.forEach((s) => {
        s.sprite.position.x = s.def.x * w
        s.sprite.position.y = s.def.y * h
        s.scaleFactor = scale
      })
    }

    updateLayout(width, height)

    // Mouse Parallax
    let targetParallaxX = 0
    let targetParallaxY = 0
    let currentParallaxX = 0
    let currentParallaxY = 0

    const handleMouseMove = (e) => {
      const normX = (e.clientX / window.innerWidth - 0.5) * 2
      const normY = (e.clientY / window.innerHeight - 0.5) * 2
      targetParallaxX = normX * 18
      targetParallaxY = -normY * 18
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    // Resize Handler
    const handleResize = () => {
      if (!container) return
      const nw = container.clientWidth || window.innerWidth
      const nh = container.clientHeight || window.innerHeight
      updateLayout(nw, nh)
    }
    window.addEventListener('resize', handleResize)

    // Visibility change handler (pause when tab hidden)
    const handleVisibilityChange = () => {
      isVisible = !document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Animation Loop
    let clock = new THREE.Clock()

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)

      if (!isVisible) return

      const delta = clock.getDelta()
      const time = clock.getElapsedTime()

      // 1. Mouse parallax interpolation
      currentParallaxX += (targetParallaxX - currentParallaxX) * 0.05
      currentParallaxY += (targetParallaxY - currentParallaxY) * 0.05
      planetGroup.position.x = currentParallaxX
      planetGroup.position.y = currentParallaxY
      starsGroup.position.x = currentParallaxX * 0.5
      starsGroup.position.y = currentParallaxY * 0.5
      starPoints.position.x = currentParallaxX * 0.25
      starPoints.position.y = currentParallaxY * 0.25

      // 2. Planets self-rotation around axis ("tự quay quanh trục của nó")
      planets.forEach((p, idx) => {
        // Continuous axial rotation around Y
        p.mesh.rotation.y += p.speed

        // Subtle zero-gravity gentle floating motion
        const floatOffset = Math.sin(time * 0.8 + idx * 1.5) * 3.5
        p.wrapper.position.y = p.baseY + floatOffset
      })

      // 3. Golden Stars Twinkling ("ngôi sao thì nhấp nháy")
      goldenStars.forEach((s) => {
        const wave = Math.sin(time * s.speed + s.phase)
        // Scale oscillates smoothly between 75% and 125%
        const scaleFactor = (0.8 + 0.35 * Math.max(-0.5, wave)) * (s.scaleFactor || 1)
        s.sprite.scale.set(s.baseSize * scaleFactor, s.baseSize * scaleFactor, 1)
        // Opacity twinkles with a sparkling pulse
        s.sprite.material.opacity = Math.max(0.3, 0.5 + 0.5 * wave)
      })

      // 4. Star Dust Twinkle
      const colors = starPointsGeo.attributes.color.array
      for (let i = 0; i < starCount; i++) {
        const tw = starTwinkleData[i]
        const factor = 0.4 + 0.6 * Math.sin(time * tw.speed + tw.phase)
        const baseIdx = i * 3
        colors[baseIdx] = starColors[baseIdx] * factor
        colors[baseIdx + 1] = starColors[baseIdx + 1] * factor
        colors[baseIdx + 2] = starColors[baseIdx + 2] * factor
      }
      starPointsGeo.attributes.color.needsUpdate = true

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      // Clean up Three.js resources
      renderer.dispose()
      glowTexture.dispose()
      starSparkleTexture.dispose()
      pointTexture.dispose()

      planets.forEach((p) => {
        p.mesh.geometry.dispose()
        p.mesh.material.map?.dispose()
        p.mesh.material.dispose()
      })
      starPointsGeo.dispose()
      starPointsMat.dispose()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden"
    >
      {/* 1. Underlying cosmic galaxy plate with rich deep navy gradient */}
      <div
        className="absolute inset-0 bg-[#030712] bg-cover bg-center transition-opacity duration-700"
        style={{
          backgroundImage: "url('/space-stars-bg.png')",
          backgroundBlendMode: 'screen',
        }}
      />

      {/* 2. Dreamy cosmic vignette & deep space nebular gradient overlay */}
      <div
        className="absolute inset-0 bg-radial-[circle_at_50%_40%] from-sky-950/20 via-[#030712]/60 to-[#02040a]/95 pointer-events-none"
      />

      {/* 3. Three.js Canvas: 3D rotating spherical planets & twinkling golden stars */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full pointer-events-none"
      />
    </div>
  )
}
