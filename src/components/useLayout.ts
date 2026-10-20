import { useCallback, useSyncExternalStore } from 'react'

function subscribeToResize(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback((onChange: () => void) => {
    const mediaQueryList = window.matchMedia(query)
    mediaQueryList.addEventListener('change', onChange)
    return () => mediaQueryList.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

export function useWindowHeight() {
  return useSyncExternalStore(subscribeToResize, () => window.innerHeight)
}
