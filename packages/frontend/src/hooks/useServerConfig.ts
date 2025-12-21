import { useState, useEffect } from 'react'

export interface ServerConfig {
    pwaEnabled: boolean
    maxFileSize: number
    rateLimitEnabled: boolean
    rateLimitMax: number
    fileRetentionHours: number
}

const defaultConfig: ServerConfig = {
    pwaEnabled: false,
    maxFileSize: 30 * 1024 * 1024, // 30MB
    rateLimitEnabled: true,
    rateLimitMax: 5,
    fileRetentionHours: 2,
}

let cachedConfig: ServerConfig | null = null
let fetchPromise: Promise<ServerConfig> | null = null

async function fetchServerConfig(): Promise<ServerConfig> {
    try {
        const response = await fetch('/api/config')
        if (!response.ok) {
            console.warn('Failed to fetch server config, using defaults')
            return defaultConfig
        }
        const data = await response.json()
        return {
            pwaEnabled: data.pwaEnabled ?? defaultConfig.pwaEnabled,
            maxFileSize: data.maxFileSize ?? defaultConfig.maxFileSize,
            rateLimitEnabled: data.rateLimitEnabled ?? defaultConfig.rateLimitEnabled,
            rateLimitMax: data.rateLimitMax ?? defaultConfig.rateLimitMax,
            fileRetentionHours: data.fileRetentionHours ?? defaultConfig.fileRetentionHours,
        }
    } catch (error) {
        console.warn('Error fetching server config:', error)
        return defaultConfig
    }
}

/**
 * Hook to get server configuration (cached after first fetch)
 */
export function useServerConfig(): { config: ServerConfig; isLoading: boolean } {
    const [config, setConfig] = useState<ServerConfig>(cachedConfig || defaultConfig)
    const [isLoading, setIsLoading] = useState(!cachedConfig)

    useEffect(() => {
        if (cachedConfig) {
            setConfig(cachedConfig)
            setIsLoading(false)
            return
        }

        // Use shared promise to avoid multiple concurrent fetches
        if (!fetchPromise) {
            fetchPromise = fetchServerConfig()
        }

        fetchPromise.then((result) => {
            cachedConfig = result
            setConfig(result)
            setIsLoading(false)
        })
    }, [])

    return { config, isLoading }
}
