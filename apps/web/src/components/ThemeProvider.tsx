'use client'

import { useEffect, useState } from 'react'
import { useBobaStore } from '@/lib/store'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const theme = useBobaStore((state) => state.theme)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme, mounted])

  if (!mounted) {
    return <>{children}</>
  }

  return <>{children}</>
}
