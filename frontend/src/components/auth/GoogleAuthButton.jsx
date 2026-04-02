import React, { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../context/ThemeContext'

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '112187041198-49vuj0cepfnfkvg1q6i0hpbor1hea3nt.apps.googleusercontent.com'
const GOOGLE_SCRIPT_ID = 'google-identity-service'

export default function GoogleAuthButton({ disabled = false, onCredential, onError }) {
  const { theme } = useTheme()
  const buttonRef = useRef(null)
  const [googleReady, setGoogleReady] = useState(false)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined

    let cancelled = false
    const script = document.getElementById(GOOGLE_SCRIPT_ID)

    const handleReady = () => {
      if (cancelled) return
      setGoogleReady(true)
    }

    if (window.google?.accounts?.id) {
      handleReady()
      return () => {
        cancelled = true
      }
    }

    if (script) {
      script.addEventListener('load', handleReady)
      return () => {
        cancelled = true
        script.removeEventListener('load', handleReady)
      }
    }

    const nextScript = document.createElement('script')
    nextScript.id = GOOGLE_SCRIPT_ID
    nextScript.src = 'https://accounts.google.com/gsi/client'
    nextScript.async = true
    nextScript.defer = true
    nextScript.addEventListener('load', handleReady)
    nextScript.addEventListener('error', () => {
      if (!cancelled) {
        onError?.('Google Sign-In failed to load.')
      }
    })
    document.body.appendChild(nextScript)

    return () => {
      cancelled = true
      nextScript.removeEventListener('load', handleReady)
    }
  }, [onError])

  useEffect(() => {
    if (!googleReady || !buttonRef.current || !window.google?.accounts?.id) return

    const handleGoogleCredential = async (response) => {
      if (!response?.credential) {
        onError?.('Google login failed.')
        return
      }

      try {
        await onCredential?.(response.credential)
      } catch (error) {
        onError?.(error?.message || 'Google login failed')
      }
    }

    buttonRef.current.innerHTML = ''
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
    })
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: theme === 'dark' ? 'filled_black' : 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      width: buttonRef.current.offsetWidth || 320,
    })
  }, [googleReady, onCredential, onError, theme])

  return (
    <div className="mb-4">
      <div
        ref={buttonRef}
        className={`min-h-[40px] w-full flex items-center justify-center ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      />
      {!googleReady && (
        <div className="mt-2 text-center text-[11px] text-text-muted">
          Loading Google Sign-In...
        </div>
      )}
    </div>
  )
}
