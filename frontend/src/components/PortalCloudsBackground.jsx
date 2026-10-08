import { memo, useEffect, useRef } from 'react'
import goldenCloudsBgSrc from '@/assets/golden-clouds-bg.png'

/**
 * CelestialSkyCanvas
 *
 * Implements the requested dynamic celestial background based on the reference artwork:
 * 1. Volumetric clouds slowly drifting, swirling, and gently morphing in multiple directions
 * 2. Small stars and glowing particles with asynchronous, individual twinkling rhythms
 * 3. Prominent large stars with soft twinkle/glow bloom and elegant 4-point/8-point flares
 * 4. Larger floating golden particles with subtle parallax and soft floating inertia
 * 5. Seamless loop with distance-based boundary fading (zero pop-in, zero sudden transitions)
 * 6. Preserves the exact champagne gold, cream, ivory, and soft beige palette
 */
function CelestialSkyCanvas({ active }) {
  const canvasRef = useRef(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    // Smooth mouse parallax tracker
    const parallax = {
      currX: 0,
      currY: 0,
      targetX: 0,
      targetY: 0,
    }

    const handleMouseMove = (e) => {
      parallax.targetX = (e.clientX / width - 0.5)
      parallax.targetY = (e.clientY / height - 0.5)
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    // ─────────────────────────────────────────────────────────────
    // 1. Volumetric Cloud Mist Puffs (Multi-directional slow drift & morph)
    // ─────────────────────────────────────────────────────────────
    const mistPuffs = [
      // Upper sky & light shaft mist (drifting gently up-right)
      { xRatio: 0.35, yRatio: 0.25, radX: 320, radY: 180, vx: 0.08, vy: -0.02, morphPhase: 0.2, morphSpeed: 0.0028, alpha: 0.038 },
      { xRatio: 0.55, yRatio: 0.32, radX: 380, radY: 210, vx: 0.06, vy: -0.015, morphPhase: 1.5, morphSpeed: 0.0032, alpha: 0.035 },
      // Mid-level cloud billows (slow undulating drift)
      { xRatio: 0.18, yRatio: 0.52, radX: 290, radY: 190, vx: -0.04, vy: 0.02, morphPhase: 2.8, morphSpeed: 0.0025, alpha: 0.032 },
      { xRatio: 0.48, yRatio: 0.62, radX: 420, radY: 240, vx: 0.07, vy: 0.01, morphPhase: 3.9, morphSpeed: 0.0030, alpha: 0.036 },
      { xRatio: 0.78, yRatio: 0.45, radX: 340, radY: 220, vx: -0.05, vy: -0.02, morphPhase: 4.6, morphSpeed: 0.0027, alpha: 0.034 },
      // Foreground soft cloud tops (gentle expansion & swirl)
      { xRatio: 0.30, yRatio: 0.80, radX: 360, radY: 200, vx: 0.05, vy: -0.01, morphPhase: 5.2, morphSpeed: 0.0035, alpha: 0.030 },
      { xRatio: 0.85, yRatio: 0.78, radX: 390, radY: 230, vx: 0.04, vy: 0.015, morphPhase: 0.8, morphSpeed: 0.0029, alpha: 0.032 },
    ].map((p) => ({
      ...p,
      x: p.xRatio * width,
      y: p.yRatio * height,
    }))

    // ─────────────────────────────────────────────────────────────
    // 2. Small Stars & Drifting Golden Particles (Asynchronous twinkle)
    // ─────────────────────────────────────────────────────────────
    const smallStarsCount = 88
    const smallStars = []
    for (let i = 0; i < smallStarsCount; i++) {
      const depth = 0.25 + Math.random() * 0.75
      const type = Math.random() < 0.45 ? 'smooth' : Math.random() < 0.75 ? 'pulse' : 'glimmer'

      smallStars.push({
        x: Math.random() * width,
        // Heavily concentrated in upper celestial sky and light beams, with some drifting through clouds
        y: Math.random() < 0.75 ? Math.random() * height * 0.65 : Math.random() * height,
        depth,
        size: (0.75 + Math.random() * 1.35) * depth,
        type,
        // Gentle slow floating in space
        vx: (0.04 + Math.random() * 0.16) * depth,
        vy: (-0.06 - Math.random() * 0.18) * depth,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.014 + Math.random() * 0.032,
        baseAlpha: 0.35 + Math.random() * 0.55,
        glintPhase: Math.random() * Math.PI * 2,
        glintSpeed: 0.008 + Math.random() * 0.016,
      })
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Prominent Large Landmark Stars (Soft Twinkle & Warm Bloom)
    // ─────────────────────────────────────────────────────────────
    // Carefully anchored to match the landmark stars in the reference artwork
    const largeStars = [
      {
        id: 'star-top-right',
        xRatio: 0.85,
        yRatio: 0.13,
        rayCount: 8,
        spikeLen: 28,
        glowRadius: 40,
        twinklePhase: 0.5,
        twinkleSpeed: 0.012,
        baseAlpha: 0.92,
        rot: 0,
        rotSpeed: 0.0003,
      },
      {
        id: 'star-mid-right',
        xRatio: 0.67,
        yRatio: 0.22,
        rayCount: 4,
        spikeLen: 24,
        glowRadius: 36,
        twinklePhase: 2.1,
        twinkleSpeed: 0.016,
        baseAlpha: 0.88,
        rot: Math.PI / 12,
        rotSpeed: -0.00025,
      },
      {
        id: 'star-center-shaft',
        xRatio: 0.45,
        yRatio: 0.24,
        rayCount: 4,
        spikeLen: 20,
        glowRadius: 32,
        twinklePhase: 4.2,
        twinkleSpeed: 0.014,
        baseAlpha: 0.84,
        rot: 0,
        rotSpeed: 0.0002,
      },
      {
        id: 'star-cloud-shoulder',
        xRatio: 0.24,
        yRatio: 0.66,
        rayCount: 4,
        spikeLen: 18,
        glowRadius: 28,
        twinklePhase: 1.2,
        twinkleSpeed: 0.018,
        baseAlpha: 0.78,
        rot: Math.PI / 8,
        rotSpeed: -0.0002,
      },
      // Slowly roaming celestial anchor star
      {
        id: 'star-roaming',
        xRatio: 0.52,
        yRatio: 0.12,
        rayCount: 4,
        spikeLen: 16,
        glowRadius: 26,
        twinklePhase: 3.5,
        twinkleSpeed: 0.015,
        baseAlpha: 0.75,
        rot: 0,
        rotSpeed: 0.0003,
        isRoaming: true,
        vx: 0.03,
        vy: -0.02,
      },
    ].map((s) => ({
      ...s,
      x: s.xRatio * width,
      y: s.yRatio * height,
    }))

    // ─────────────────────────────────────────────────────────────
    // 4. Larger Floating Golden Bokeh Particles (Subtle Parallax)
    // ─────────────────────────────────────────────────────────────
    const orbCount = 14
    const orbs = []
    for (let i = 0; i < orbCount; i++) {
      const depth = 1.0 + Math.random() * 0.65
      orbs.push({
        x: Math.random() * width,
        y: Math.random() * height,
        depth,
        glowRad: 34 + Math.random() * 26,
        vx: (Math.random() - 0.45) * 0.15,
        vy: -0.06 - Math.random() * 0.12,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.012 + Math.random() * 0.018,
        baseAlpha: 0.15 + Math.random() * 0.18,
        color: Math.random() < 0.6 ? '255, 238, 185' : '230, 193, 122',
      })
    }

    let isDocumentVisible = !document.hidden
    const handleVisibility = () => {
      isDocumentVisible = !document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // ─────────────────────────────────────────────────────────────
    // Main Render Loop
    // ─────────────────────────────────────────────────────────────
    const render = (time) => {
      animId = requestAnimationFrame(render)
      if (!activeRef.current || !isDocumentVisible) return

      // Smooth mouse parallax damping
      parallax.currX += (parallax.targetX - parallax.currX) * 0.035
      parallax.currY += (parallax.targetY - parallax.currY) * 0.035

      // Autonomous organic celestial Lissajous wave (keeps gentle life even without mouse movement)
      const autoWaveX = Math.sin(time * 0.00035) * 0.10
      const autoWaveY = Math.cos(time * 0.00045) * 0.06

      const totalParallaxX = parallax.currX + autoWaveX
      const totalParallaxY = parallax.currY + autoWaveY

      ctx.clearRect(0, 0, width, height)

      // ───────────────────────────────────────────────────────────
      // Layer 1: Volumetric Cloud Mist Puffs (Swirling & Morphing)
      // ───────────────────────────────────────────────────────────
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (let i = 0; i < mistPuffs.length; i++) {
        const p = mistPuffs[i]

        p.morphPhase += p.morphSpeed
        p.x += p.vx
        p.y += p.vy + Math.sin(p.morphPhase) * 0.03

        // Seamless wrapping
        const padX = p.radX * 1.4
        const padY = p.radY * 1.4
        if (p.x > width + padX) p.x = -padX
        if (p.x < -padX) p.x = width + padX
        if (p.y > height + padY) p.y = -padY
        if (p.y < -padY) p.y = height + padY

        // Gentle harmonic morphing (slow change in shape without harsh deformation)
        const radX = p.radX * (1 + 0.10 * Math.sin(p.morphPhase))
        const radY = p.radY * (1 + 0.10 * Math.cos(p.morphPhase * 1.15))
        const maxRad = Math.max(radX, radY)

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, maxRad)
        grad.addColorStop(0, `rgba(255, 250, 230, ${p.alpha * 0.9})`)
        grad.addColorStop(0.4, `rgba(245, 225, 175, ${p.alpha * 0.45})`)
        grad.addColorStop(0.75, `rgba(230, 193, 122, ${p.alpha * 0.12})`)
        grad.addColorStop(1, 'rgba(201, 154, 71, 0)')

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, radX, radY, Math.sin(p.morphPhase * 0.4) * 0.12, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // ───────────────────────────────────────────────────────────
      // Layer 2: Small Stars & Floating Golden Particles
      // ───────────────────────────────────────────────────────────
      ctx.save()
      for (let i = 0; i < smallStars.length; i++) {
        const s = smallStars[i]

        s.x += s.vx
        s.y += s.vy
        s.twinklePhase += s.twinkleSpeed
        s.glintPhase += s.glintSpeed

        // Wrap around bounds seamlessly
        const margin = 20
        if (s.x > width + margin) s.x = -margin
        if (s.x < -margin) s.x = width + margin
        if (s.y > height + margin) s.y = -margin
        if (s.y < -margin) s.y = height + margin

        // Distance edge fade ensuring zero pop-in
        let edgeAlpha = 1
        if (s.y < 45) edgeAlpha = Math.max(0, s.y / 45)
        else if (s.y > height - 45) edgeAlpha = Math.max(0, (height - s.y) / 45)
        if (s.x < 45) edgeAlpha *= Math.max(0, s.x / 45)
        else if (s.x > width - 45) edgeAlpha *= Math.max(0, (width - s.x) / 45)

        let twinkle = 0.5 + 0.5 * Math.sin(s.twinklePhase)
        if (s.type === 'pulse') {
          // Slow swell and fade
          twinkle = Math.pow(0.5 + 0.5 * Math.sin(s.twinklePhase), 1.8)
        } else if (s.type === 'glimmer') {
          // Subtle shimmer with gentle flash
          twinkle = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(s.twinklePhase)), 2.5)
        }

        const alpha = Math.min(1, s.baseAlpha * (0.45 + 0.55 * twinkle) * edgeAlpha)

        // Draw star dot
        ctx.fillStyle = `rgba(255, 250, 225, ${alpha})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()

        // Subtle soft halo on slightly brighter small stars
        if (s.size > 1.1 && alpha > 0.45) {
          ctx.fillStyle = `rgba(245, 220, 155, ${alpha * 0.3})`
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.size * 2.8, 0, Math.PI * 2)
          ctx.fill()
        }

        // Occasional gentle 4-point micro-glint
        const glintVal = Math.sin(s.glintPhase)
        if (glintVal > 0.86 && alpha > 0.4) {
          const glintAlpha = ((glintVal - 0.86) / 0.14) * alpha * 0.75
          const glintLen = s.size * 3.2

          ctx.strokeStyle = `rgba(255, 253, 240, ${glintAlpha})`
          ctx.lineWidth = 0.65
          ctx.beginPath()
          ctx.moveTo(s.x - glintLen, s.y)
          ctx.lineTo(s.x + glintLen, s.y)
          ctx.moveTo(s.x, s.y - glintLen)
          ctx.lineTo(s.x, s.y + glintLen)
          ctx.stroke()
        }
      }
      ctx.restore()

      // ───────────────────────────────────────────────────────────
      // Layer 3: Prominent Large Stars (Twinkle, Glow Bloom & Cross Flares)
      // ───────────────────────────────────────────────────────────
      ctx.save()
      for (let i = 0; i < largeStars.length; i++) {
        const ls = largeStars[i]

        ls.twinklePhase += ls.twinkleSpeed
        ls.rot += ls.rotSpeed

        if (ls.isRoaming) {
          ls.x += ls.vx
          ls.y += ls.vy
          if (ls.x > width + 40) ls.x = -40
          if (ls.y < -40) ls.y = height * 0.4
        } else {
          // Scale position with canvas size
          ls.x = ls.xRatio * width
          ls.y = ls.yRatio * height
        }

        const pulse = 0.55 + 0.45 * Math.sin(ls.twinklePhase)
        const alpha = Math.min(1, ls.baseAlpha * (0.65 + 0.35 * pulse))
        const spikeLen = ls.spikeLen * (0.88 + 0.24 * pulse)
        const glowRad = ls.glowRadius * (0.90 + 0.20 * pulse)

        // 1. Soft Warm Champagne Glow Bloom (non-blinding, ambient radiant halo)
        const bloomGrad = ctx.createRadialGradient(ls.x, ls.y, 0, ls.x, ls.y, glowRad)
        bloomGrad.addColorStop(0, `rgba(255, 252, 240, ${alpha * 0.75})`)
        bloomGrad.addColorStop(0.25, `rgba(255, 235, 175, ${alpha * 0.45})`)
        bloomGrad.addColorStop(0.65, `rgba(230, 193, 122, ${alpha * 0.15})`)
        bloomGrad.addColorStop(1, 'rgba(201, 154, 71, 0)')

        ctx.fillStyle = bloomGrad
        ctx.beginPath()
        ctx.arc(ls.x, ls.y, glowRad, 0, Math.PI * 2)
        ctx.fill()

        // 2. Cross Spikes / Radiant Diffraction Rays
        ctx.save()
        ctx.translate(ls.x, ls.y)
        ctx.rotate(ls.rot)

        // Helper to draw tapered diamond spike
        const drawSpike = (len, widthHalf, opacity) => {
          ctx.fillStyle = `rgba(255, 254, 245, ${opacity})`
          ctx.beginPath()
          ctx.moveTo(0, -len)
          ctx.lineTo(widthHalf, 0)
          ctx.lineTo(0, len)
          ctx.lineTo(-widthHalf, 0)
          ctx.closePath()
          ctx.fill()
        }

        // Primary 4-point cross rays
        drawSpike(spikeLen, 1.8, alpha * 0.92)
        ctx.rotate(Math.PI / 2)
        drawSpike(spikeLen, 1.8, alpha * 0.92)

        // Secondary diagonal rays for 8-point stars
        if (ls.rayCount === 8) {
          ctx.rotate(Math.PI / 4)
          drawSpike(spikeLen * 0.52, 1.2, alpha * 0.65)
          ctx.rotate(Math.PI / 2)
          drawSpike(spikeLen * 0.52, 1.2, alpha * 0.65)
        }

        ctx.restore()

        // 3. Crisp Diamond White-Gold Star Core
        ctx.fillStyle = `rgba(255, 255, 250, ${alpha * 0.98})`
        ctx.beginPath()
        ctx.arc(ls.x, ls.y, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // ───────────────────────────────────────────────────────────
      // Layer 4: Larger Floating Golden Bokeh Orbs (Subtle Parallax)
      // ───────────────────────────────────────────────────────────
      ctx.save()
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i]

        o.x += o.vx
        o.y += o.vy
        o.pulsePhase += o.pulseSpeed

        // Wrap around bounds
        const pad = o.glowRad * 1.3
        if (o.x > width + pad) o.x = -pad
        if (o.x < -pad) o.x = width + pad
        if (o.y > height + pad) o.y = -pad
        if (o.y < -pad) o.y = height + pad

        // Apply depth parallax offset
        const renderX = o.x + totalParallaxX * o.depth * 20
        const renderY = o.y + totalParallaxY * o.depth * 14

        // Distance edge fade
        let edgeAlpha = 1
        if (renderY < 50) edgeAlpha = Math.max(0, renderY / 50)
        else if (renderY > height - 50) edgeAlpha = Math.max(0, (height - renderY) / 50)

        const pulse = 0.65 + 0.35 * Math.sin(o.pulsePhase)
        const alpha = Math.min(1, o.baseAlpha * pulse * edgeAlpha)
        const rad = o.glowRad * (0.92 + 0.16 * pulse)

        const grad = ctx.createRadialGradient(renderX, renderY, 0, renderX, renderY, rad)
        grad.addColorStop(0, `rgba(255, 250, 230, ${alpha * 0.85})`)
        grad.addColorStop(0.35, `rgba(${o.color}, ${alpha * 0.45})`)
        grad.addColorStop(0.7, `rgba(${o.color}, ${alpha * 0.12})`)
        grad.addColorStop(1, 'rgba(201, 154, 71, 0)')

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(renderX, renderY, rad, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    render(performance.now())

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 size-full pointer-events-none z-10"
    />
  )
}

/**
 * PortalCloudsBackground
 *
 * Implements the luxurious, dreamy, cinematic golden cloudscape website background:
 * - Fixed static framing of the reference image (NO camera shake, NO zoom, NO camera pan)
 * - Preserves the champagne gold, cream, ivory, and soft beige palette
 * - Volumetric clouds slowly drifting, swirling, and gently morphing across layers
 * - Central warm light source gently breathing and pulsing naturally (14s hypnotic cycle)
 * - Asynchronous twinkling stars and floating golden stardust
 * - Prominent large stars with soft twinkle/glow and diamond cross-flares matching the artwork
 * - Seamless loop, calm, elegant, and relaxing – optimized for UI readability
 */
export const PortalCloudsBackground = memo(function PortalCloudsBackground({ active = true }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
      style={{
        backgroundColor: '#F5EBDD',
      }}
      aria-hidden="true"
    >
      {/* ── 1. Base Sky Gradient Underlay (Warm Champagne, Cream & Ivory) ── */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 95% 65% at 75% 20%, rgba(245, 225, 175, 0.45) 0%, rgba(230, 193, 122, 0.18) 40%, transparent 75%),
            radial-gradient(circle at 78% 18%, rgba(255, 252, 242, 0.9) 0%, rgba(245, 235, 221, 0.4) 45%, transparent 80%),
            linear-gradient(180deg, #FAF4EB 0%, #F5EBDD 55%, #E8DCBE 100%)
          `,
        }}
      />

      {/* ── 2. Primary Reference Cloudscape (Static composition, NO camera movement, NO zoom) ── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${goldenCloudsBgSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center bottom',
          backgroundRepeat: 'no-repeat',
          opacity: 1,
        }}
      />

      {/* ── 3. Volumetric Cloud Layer Undulation & Light Shifting ── */}
      <div
        className="absolute inset-0 pointer-events-none portal-cloud-undulate"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 75% 25%, rgba(255, 248, 225, 0.28) 0%, rgba(230, 193, 122, 0.12) 45%, transparent 78%)
          `,
          mixBlendMode: 'soft-light',
          animationPlayState: active ? 'running' : 'paused',
        }}
      />

      {/* ── 4. Warm Golden Sun Breathing Core ("Thở" tự nhiên) ── */}
      {/* Positioned at the soft sun glow in the upper-right */}
      <div
        className="pointer-events-none absolute left-[78%] top-[18%] -translate-x-1/2 -translate-y-1/2 w-[70vw] max-w-[800px] h-[55vh] portal-celestial-breathe"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255, 252, 242, 0.88) 0%, rgba(255, 238, 185, 0.55) 28%, rgba(230, 193, 122, 0.22) 55%, rgba(201, 154, 71, 0.04) 75%, transparent 100%)
          `,
          mixBlendMode: 'screen',
          animationPlayState: active ? 'running' : 'paused',
        }}
      />

      {/* ── 5. Subtle Celestial Sunbeam Shimmer (#E6C17A #C99A47) ── */}
      <div
        className="absolute -top-16 left-[78%] -translate-x-1/2 w-[120vw] h-[70vh] pointer-events-none portal-sunray-shimmer"
        style={{
          background: `
            conic-gradient(
              from 180deg at 50% 0%,
              rgba(230, 193, 122, 0) 0deg,
              rgba(230, 193, 122, 0.12) 15deg,
              rgba(201, 154, 71, 0.02) 35deg,
              rgba(255, 250, 230, 0.18) 55deg,
              rgba(230, 193, 122, 0.05) 75deg,
              rgba(201, 154, 71, 0.12) 95deg,
              rgba(255, 250, 230, 0.20) 115deg,
              rgba(201, 154, 71, 0.10) 135deg,
              rgba(230, 193, 122, 0.04) 155deg,
              rgba(230, 193, 122, 0) 175deg
            )
          `,
          maskImage: 'radial-gradient(ellipse 55% 85% at 50% 0%, black 25%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse 55% 85% at 50% 0%, black 25%, transparent 85%)',
          animationPlayState: active ? 'running' : 'paused',
        }}
      />

      {/* ── 6. Multi-Layer Celestial Sky Canvas (Stars, Particles, Puffs & Parallax) ── */}
      <CelestialSkyCanvas active={active} />

      {/* ── 7. Edge Atmospheric Blending Vignette (Ensures clean UI borders) ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(245, 235, 221, 0.18) 0%, transparent 15%, transparent 85%, rgba(245, 235, 221, 0.3) 100%)',
        }}
      />
    </div>
  )
})
