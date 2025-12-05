/**
 * Build History Management - stores recent builds in localStorage
 */

export interface BuildHistoryItem {
  taskId: string
  fileName: string | null
  appName: string
  status: 'building' | 'queued' | 'completed' | 'failed'
  createdAt: string
  expiresAt?: string
}

const STORAGE_KEY = 'demo2apk_build_history'
const MAX_HISTORY_ITEMS = 10

/**
 * Get all build history items
 */
export function getBuildHistory(): BuildHistoryItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data) as BuildHistoryItem[]
  } catch {
    return []
  }
}

/**
 * Add or update a build in history
 */
export function saveBuildToHistory(item: BuildHistoryItem): void {
  try {
    const history = getBuildHistory()
    
    // Check if this taskId already exists
    const existingIndex = history.findIndex(h => h.taskId === item.taskId)
    
    if (existingIndex >= 0) {
      // Update existing item
      history[existingIndex] = item
    } else {
      // Add new item at the beginning
      history.unshift(item)
    }
    
    // Keep only the most recent items
    const trimmed = history.slice(0, MAX_HISTORY_ITEMS)
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.error('Failed to save build history:', e)
  }
}

/**
 * Update status of a build in history
 */
export function updateBuildStatus(
  taskId: string, 
  status: BuildHistoryItem['status'],
  expiresAt?: string
): void {
  try {
    const history = getBuildHistory()
    const item = history.find(h => h.taskId === taskId)
    
    if (item) {
      item.status = status
      if (expiresAt) {
        item.expiresAt = expiresAt
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    }
  } catch (e) {
    console.error('Failed to update build status:', e)
  }
}

/**
 * Remove a build from history
 */
export function removeBuildFromHistory(taskId: string): void {
  try {
    const history = getBuildHistory()
    const filtered = history.filter(h => h.taskId !== taskId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (e) {
    console.error('Failed to remove build from history:', e)
  }
}

/**
 * Clear all build history
 */
export function clearBuildHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.error('Failed to clear build history:', e)
  }
}

/**
 * Check if a build has expired based on expiresAt
 */
export function isBuildExpired(item: BuildHistoryItem): boolean {
  if (!item.expiresAt) return false
  return new Date(item.expiresAt).getTime() < Date.now()
}

