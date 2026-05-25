import { useEffect, useRef } from 'react'

export function useDebounce(fn, delay, deps) {
  const timer = useRef(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(fn, delay)
    return () => clearTimeout(timer.current)
  }, deps)
}
