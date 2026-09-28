import { useEffect, useRef, useState } from 'react'

export function SeamlessVideoBackground({ mask = true, opacity = 'opacity-70' }) {
  const v1Ref = useRef(null)
  const v2Ref = useRef(null)
  const [activeVid, setActiveVid] = useState(1)
  const videoSrc = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104303_0c6d60b2-9353-408e-9449-585108a22fb5.mp4'
  const posterSrc = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/130837c4-0244-4f37-9c61-8d801d93fd29.jpg'

  useEffect(() => {
    const v1 = v1Ref.current
    const v2 = v2Ref.current
    if (!v1 || !v2) return

    v1.play().catch(() => { })

    let switched = false
    const interval = setInterval(() => {
      if (activeVid === 1) {
        if (v1.currentTime >= 8.2 && !switched) {
          switched = true
          v2.currentTime = 0
          v2.play().then(() => {
            setActiveVid(2)
            setTimeout(() => {
              v1.pause()
              v1.currentTime = 0
              switched = false
            }, 1800)
          }).catch(() => { })
        }
      } else {
        if (v2.currentTime >= 8.2 && !switched) {
          switched = true
          v1.currentTime = 0
          v1.play().then(() => {
            setActiveVid(1)
            setTimeout(() => {
              v2.pause()
              v2.currentTime = 0
              switched = false
            }, 1800)
          }).catch(() => { })
        }
      }
    }, 150)

    return () => clearInterval(interval)
  }, [activeVid])

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden select-none z-0"
      style={
        mask
          ? {
              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 85%)',
              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 85%)',
            }
          : undefined
      }
    >
      <video
        ref={v1Ref}
        className={`absolute inset-0 h-full w-full object-cover object-center mix-blend-screen transition-opacity duration-1500 ease-in-out ${
          activeVid === 1 ? opacity : 'opacity-0'
        }`}
        muted
        playsInline
        preload="auto"
        poster={posterSrc}
        src={videoSrc}
      />
      <video
        ref={v2Ref}
        className={`absolute inset-0 h-full w-full object-cover object-center mix-blend-screen transition-opacity duration-1500 ease-in-out ${
          activeVid === 2 ? opacity : 'opacity-0'
        }`}
        muted
        playsInline
        preload="auto"
        src={videoSrc}
      />
    </div>
  )
}
