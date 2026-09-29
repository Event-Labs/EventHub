import { useEffect, useState } from 'react'

export function StarBurst8({ size = 48, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-40 -40 80 80"
      className={`pointer-events-none select-none ${className}`}
    >
      <defs>
        <radialGradient id="star-burst-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="25%" stopColor="#fef08a" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="star-ray-v" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
          <stop offset="42%" stopColor="#fef08a" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="58%" stopColor="#fef08a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="star-ray-h" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
          <stop offset="42%" stopColor="#fef08a" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="58%" stopColor="#fef08a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Primary Vertical Ray */}
      <polygon points="0,-38 1.8,0 0,38 -1.8,0" fill="url(#star-ray-v)" />
      {/* Primary Horizontal Ray */}
      <polygon points="-38,0 0,1.8 38,0 0,-1.8" fill="url(#star-ray-h)" />
      {/* Secondary Diagonal Rays */}
      <g transform="rotate(45)">
        <polygon points="0,-22 1.2,0 0,22 -1.2,0" fill="url(#star-ray-v)" opacity="0.75" />
        <polygon points="-22,0 0,1.2 22,0 0,-1.2" fill="url(#star-ray-h)" opacity="0.75" />
      </g>
      {/* Central warm glow halo */}
      <circle cx="0" cy="0" r="10" fill="url(#star-burst-halo)" />
      {/* Bright white core center */}
      <circle cx="0" cy="0" r="2.2" fill="#ffffff" />
    </svg>
  )
}

export function StarSupernova({ size = 56, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-40 -40 80 80"
      className={`pointer-events-none select-none ${className}`}
    >
      {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5].map((angle, idx) => {
        const isMajor = idx % 4 === 0
        const isDiag = idx % 2 === 0 && !isMajor
        const len = isMajor ? 36 : isDiag ? 24 : 14
        const width = isMajor ? 1.6 : 0.9
        return (
          <g key={angle} transform={`rotate(${angle})`}>
            <polygon
              points={`0,-${len} ${width},0 0,${len} -${width},0`}
              fill="#fef08a"
              opacity={isMajor ? 0.95 : isDiag ? 0.75 : 0.45}
            />
          </g>
        )
      })}
      <circle cx="0" cy="0" r="12" fill="url(#star-burst-halo)" />
      <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
    </svg>
  )
}

export function StarCross4({ size = 36, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-30 -30 60 60"
      className={`pointer-events-none select-none ${className}`}
    >
      <polygon points="0,-26 1.4,0 0,26 -1.4,0" fill="url(#star-ray-v)" />
      <polygon points="-26,0 0,1.4 26,0 0,-1.4" fill="url(#star-ray-h)" />
      <circle cx="0" cy="0" r="7" fill="url(#star-burst-halo)" />
      <circle cx="0" cy="0" r="1.8" fill="#ffffff" />
    </svg>
  )
}

export function CosmicStarryBackground() {
  const [stardust, setStardust] = useState({ gold: '', white: '', cyan: '' })

  useEffect(() => {
    // Layer 1: Warm golden stardust (65 stars)
    const gold = Array.from({ length: 65 }, () => {
      const x = (Math.random() * 100).toFixed(1)
      const y = (Math.random() * 100).toFixed(1)
      const alpha = (0.2 + Math.random() * 0.55).toFixed(2)
      const blur = Math.random() > 0.6 ? 1.5 : 0
      return `${x}vw ${y}vh ${blur}px 0 rgba(254,240,138,${alpha})`
    }).join(',')

    // Layer 2: Diamond white stardust (110 stars)
    const white = Array.from({ length: 110 }, () => {
      const x = (Math.random() * 100).toFixed(1)
      const y = (Math.random() * 100).toFixed(1)
      const alpha = (0.1 + Math.random() * 0.45).toFixed(2)
      return `${x}vw ${y}vh 0px 0 rgba(255,255,255,${alpha})`
    }).join(',')

    // Layer 3: Celestial cyan stardust along nebula trails (35 stars)
    const cyan = Array.from({ length: 35 }, () => {
      const x = (Math.random() * 100).toFixed(1)
      const y = (Math.random() * 100).toFixed(1)
      const alpha = (0.25 + Math.random() * 0.5).toFixed(2)
      return `${x}vw ${y}vh 1px 0 rgba(165,243,252,${alpha})`
    }).join(',')

    setStardust({ gold, white, cyan })
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {/* Base deep cosmic gradient matching hero tone */}
      <div className="absolute inset-0 bg-[#020409]" />

      {/* Ethereal cosmic nebula clouds in celestial sapphire and cyan */}
      <div
        className="absolute inset-0 opacity-40 mix-blend-screen"
        style={{
          backgroundImage: `
            radial-gradient(circle at 18% 18%, rgba(14, 52, 110, 0.45) 0%, transparent 45%),
            radial-gradient(circle at 82% 82%, rgba(10, 42, 95, 0.45) 0%, transparent 45%),
            radial-gradient(ellipse at 50% 0%, rgba(6, 182, 212, 0.16) 0%, transparent 55%),
            radial-gradient(circle at 85% 20%, rgba(245, 158, 11, 0.08) 0%, transparent 35%)
          `,
        }}
      />

      {/* Authentic Starry Sky Texture from user reference image */}
      <div
        className="absolute inset-0 bg-cover bg-center mix-blend-screen opacity-35 sm:opacity-45"
        style={{ backgroundImage: "url('/images/starry-bg.png')" }}
      />

      {/* Fine glittering stardust layers */}
      <div
        className="absolute top-0 left-0 w-[1.5px] h-[1.5px] rounded-full bg-amber-200"
        style={{ boxShadow: stardust.gold }}
      />
      <div
        className="absolute top-0 left-0 w-[1px] h-[1px] rounded-full bg-white"
        style={{ boxShadow: stardust.white }}
      />
      <div
        className="absolute top-0 left-0 w-[1.5px] h-[1.5px] rounded-full bg-cyan-200"
        style={{ boxShadow: stardust.cyan }}
      />

      {/* Key Prominent Golden Starbursts & Flares matching reference image */}
      {/* Top framing stars */}
      <div className="absolute top-[8%] left-[48%] -translate-x-1/2 animate-star-pulse" style={{ animationDelay: '0s' }}>
        <StarBurst8 size={64} />
      </div>
      <div className="absolute top-[6%] left-[84%] animate-star-twinkle-bright" style={{ animationDelay: '1.2s' }}>
        <StarBurst8 size={70} />
      </div>
      <div className="absolute top-[14%] left-[76%] animate-star-twinkle-soft" style={{ animationDelay: '2.5s' }}>
        <StarBurst8 size={48} />
      </div>
      <div className="absolute top-[8%] left-[16%] animate-star-pulse" style={{ animationDelay: '1.8s' }}>
        <StarSupernova size={64} />
      </div>
      <div className="absolute top-[17%] left-[9%] animate-star-twinkle-soft" style={{ animationDelay: '0.7s' }}>
        <StarCross4 size={42} />
      </div>
      <div className="absolute top-[13%] left-[28%] animate-star-twinkle-soft" style={{ animationDelay: '3.1s' }}>
        <StarCross4 size={36} />
      </div>
      <div className="absolute top-[7%] left-[62%] animate-star-twinkle-bright" style={{ animationDelay: '2.1s' }}>
        <StarCross4 size={38} />
      </div>

      {/* Side perimeter framing stars */}
      <div className="absolute top-[34%] left-[91%] animate-star-twinkle-soft" style={{ animationDelay: '1.5s' }}>
        <StarCross4 size={34} />
      </div>
      <div className="absolute top-[28%] left-[4%] animate-star-twinkle-bright" style={{ animationDelay: '2.8s' }}>
        <StarCross4 size={32} />
      </div>
      <div className="absolute top-[62%] left-[92%] animate-star-twinkle-bright" style={{ animationDelay: '0.4s' }}>
        <StarBurst8 size={46} />
      </div>
      <div className="absolute top-[60%] left-[6%] animate-star-twinkle-soft" style={{ animationDelay: '3.6s' }}>
        <StarCross4 size={36} />
      </div>

      {/* Bottom framing stars */}
      <div className="absolute bottom-[10%] left-[86%] animate-star-pulse" style={{ animationDelay: '2.4s' }}>
        <StarSupernova size={72} />
      </div>
      <div className="absolute bottom-[5%] left-[92%] animate-star-twinkle-soft" style={{ animationDelay: '0.9s' }}>
        <StarBurst8 size={44} />
      </div>
      <div className="absolute bottom-[8%] left-[38%] animate-star-twinkle-bright" style={{ animationDelay: '1.7s' }}>
        <StarBurst8 size={58} />
      </div>
      <div className="absolute bottom-[6%] left-[58%] animate-star-twinkle-soft" style={{ animationDelay: '3.3s' }}>
        <StarBurst8 size={46} />
      </div>
      <div className="absolute bottom-[7%] left-[12%] animate-star-pulse" style={{ animationDelay: '0.6s' }}>
        <StarBurst8 size={64} />
      </div>
      <div className="absolute bottom-[14%] left-[17%] animate-star-twinkle-soft" style={{ animationDelay: '2.2s' }}>
        <StarBurst8 size={44} />
      </div>
    </div>
  )
}
