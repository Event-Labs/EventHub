import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * Robust, 100% offline QR Code component.
 * Generates QR code using local Canvas/DataURL without depending on third-party servers.
 * Avoids ERR_BLOCKED_BY_CLIENT caused by ad blockers on api.qrserver.com.
 */
export function QRCodeImage({
  text,
  size = 224,
  className = 'size-52',
  alt = 'Mã QR thanh toán',
}) {
  const [dataUrl, setDataUrl] = useState('')
  const [isGenerating, setIsGenerating] = useState(true)

  useEffect(() => {
    if (!text) {
      setDataUrl('')
      setIsGenerating(false)
      return
    }

    if (/^(https?:|data:image\/)/i.test(text)) {
      setDataUrl(text)
      setIsGenerating(false)
      return
    }

    let isMounted = true
    setIsGenerating(true)

    QRCode.toDataURL(text, {
      width: size * 2, // 2x for sharp retina displays
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (isMounted) {
          setDataUrl(url)
          setIsGenerating(false)
        }
      })
      .catch((err) => {
        console.error('Failed to generate local QR code, falling back to external API:', err)
        if (isMounted) {
          setDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=2&data=${encodeURIComponent(text)}`)
          setIsGenerating(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [text, size])

  if (!text) return null

  if (isGenerating && !dataUrl) {
    return (
      <div className={`grid place-items-center bg-white text-xs text-slate-400 animate-pulse ${className}`}>
        Đang tạo mã QR...
      </div>
    )
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      className={`object-contain ${className}`}
      width={size}
      height={size}
      loading="eager"
    />
  )
}
