import { useState, useEffect } from 'react'

/**
 * Return type for the useNetworkStatus hook
 */
interface UseNetworkStatusReturn {
  /** Whether the browser is currently online */
  isOnline: boolean
  /** Whether the network status has been determined */
  isLoading: boolean
  /** Timestamp of the last network status change */
  lastStatusChange?: Date
}

/**
 * Custom hook to monitor network connectivity status
 * 
 * This hook provides real-time network status information by listening to
 * browser online/offline events and navigator.onLine property.
 * 
 * Features:
 * - Real-time online/offline detection
 * - Loading state during initial determination
 * - Timestamp tracking of status changes
 * - Automatic cleanup of event listeners
 * 
 * @returns Object containing network status information
 */
export const useNetworkStatus = (): UseNetworkStatusReturn => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [lastStatusChange, setLastStatusChange] = useState<Date | undefined>(undefined)

  useEffect(() => {
    // Set initial loading state to false after first render
    setIsLoading(false)

    /**
     * Handle online event
     */
    const handleOnline = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('Network status: Online')
      }
      setIsOnline(true)
      setLastStatusChange(new Date())
    }

    /**
     * Handle offline event
     */
    const handleOffline = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('Network status: Offline')
      }
      setIsOnline(false)
      setLastStatusChange(new Date())
    }

    // Add event listeners for network status changes
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Optional: Additional connectivity check using fetch
    // This can help detect cases where navigator.onLine is true but there's no actual connectivity
    const checkConnectivity = async () => {
      try {
        // Try to fetch a small resource to verify actual connectivity
        // Using a small image or endpoint that's likely to be available
        const response = await fetch('/favicon.ico', {
          method: 'HEAD',
          cache: 'no-cache',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        })
        
        const actuallyOnline = response.ok
        if (actuallyOnline !== isOnline) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`Network status corrected: ${actuallyOnline ? 'Online' : 'Offline'}`)
          }
          setIsOnline(actuallyOnline)
          setLastStatusChange(new Date())
        }
      } catch (error) {
        // If fetch fails and we think we're online, we might actually be offline
        if (isOnline) {
          if (process.env.NODE_ENV === 'development') {
            console.log('Network connectivity check failed, assuming offline')
          }
          setIsOnline(false)
          setLastStatusChange(new Date())
        }
      }
    }

    // Perform initial connectivity check
    checkConnectivity()

    // Set up periodic connectivity checks (every 30 seconds when online)
    const connectivityInterval = setInterval(() => {
      if (navigator.onLine) {
        checkConnectivity()
      }
    }, 30000)

    // Cleanup function
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(connectivityInterval)
    }
  }, [isOnline]) // Include isOnline in dependency array for connectivity check

  return {
    isOnline,
    isLoading,
    lastStatusChange
  }
}

/**
 * Hook to get a human-readable network status message
 * 
 * @param networkStatus - The network status object from useNetworkStatus
 * @returns A formatted status message
 */
export const useNetworkStatusMessage = (networkStatus: UseNetworkStatusReturn): string => {
  const { isOnline, isLoading, lastStatusChange } = networkStatus

  if (isLoading) {
    return 'Checking network status...'
  }

  if (isOnline) {
    if (lastStatusChange) {
      const timeSince = Math.floor((Date.now() - lastStatusChange.getTime()) / 1000)
      if (timeSince < 60) {
        return `Connected (${timeSince}s ago)`
      } else if (timeSince < 3600) {
        return `Connected (${Math.floor(timeSince / 60)}m ago)`
      }
    }
    return 'Connected'
  } else {
    if (lastStatusChange) {
      const timeSince = Math.floor((Date.now() - lastStatusChange.getTime()) / 1000)
      if (timeSince < 60) {
        return `Offline (${timeSince}s ago)`
      } else if (timeSince < 3600) {
        return `Offline (${Math.floor(timeSince / 60)}m ago)`
      }
    }
    return 'Offline - Changes saved locally'
  }
}
