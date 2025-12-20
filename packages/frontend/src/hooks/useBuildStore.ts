import { create } from 'zustand'
import { saveBuildToHistory, updateBuildStatus } from '../utils/buildHistory'

type BuildStatus = 'idle' | 'uploading' | 'queued' | 'building' | 'completed' | 'error'

interface BuildState {
  status: BuildStatus
  progress: number
  logs: string[]
  taskId: string | null
  traceId: string | null
  hint: string | null
  errorCode: string | null
  fileName: string | null
  downloadUrl: string | null
  error: string | null
  expiresAt: string | null
  retentionHours: number | null
  queuePosition: number | null
  queueTotal: number | null
  isRestoring: boolean

  // Actions
  startBuild: (file: File, type: 'html' | 'zip', appName?: string, iconFile?: File, appVersion?: string, permissions?: string[]) => Promise<void>
  startCodeBuild: (code: string, appName: string, iconFile?: File, appVersion?: string, permissions?: string[]) => Promise<void>
  restoreFromTaskId: (taskId: string) => Promise<void>
  reset: () => void
}

// Helper to update URL with taskId
function updateUrlWithTaskId(taskId: string | null) {
  const url = new URL(window.location.href)
  if (taskId) {
    url.searchParams.set('task', taskId)
  } else {
    url.searchParams.delete('task')
  }
  window.history.replaceState({}, '', url.toString())
}

// Helper to get taskId from URL
export function getTaskIdFromUrl(): string | null {
  const url = new URL(window.location.href)
  return url.searchParams.get('task')
}

export const useBuildStore = create<BuildState>((set, get) => ({
  status: 'idle',
  progress: 0,
  logs: [],
  taskId: null,
  traceId: null,
  hint: null,
  errorCode: null,
  fileName: null,
  downloadUrl: null,
  error: null,
  expiresAt: null,
  retentionHours: null,
  queuePosition: null,
  queueTotal: null,
  isRestoring: false,

  startBuild: async (file: File, type: 'html' | 'zip', appName?: string, iconFile?: File, appVersion?: string, permissions?: string[]) => {
    set({
      status: 'uploading',
      progress: 0,
      logs: [],
      taskId: null,
      traceId: null,
      hint: null,
      errorCode: null,
      fileName: file.name,
      error: null,
      expiresAt: null,
      retentionHours: null,
    })

    try {
      // Upload file
      const formData = new FormData()
      formData.append('file', file)
      if (appName) {
        formData.append('appName', appName)
      }
      if (iconFile) {
        formData.append('icon', iconFile)
      }
      if (appVersion) {
        formData.append('appVersion', appVersion)
      }
      if (permissions && permissions.length > 0) {
        formData.append('permissions', JSON.stringify(permissions))
      }

      const uploadUrl = type === 'html' ? '/api/build/html' : '/api/build/zip'

      set({ logs: ['> INITIATING UPLOAD SEQUENCE...'] })

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        // Handle rate limit error specifically
        if (response.status === 429) {
          throw new Error(errorData.message || '构建次数已达上限，请稍后再试')
        }

        if (typeof errorData.taskId === 'string') set({ taskId: errorData.taskId })
        if (typeof errorData.traceId === 'string') set({ traceId: errorData.traceId })
        if (typeof errorData.hint === 'string') set({ hint: errorData.hint })
        if (typeof errorData.code === 'string') set({ errorCode: errorData.code })

        throw new Error(errorData.message || `UPLOAD FAILED: ${response.status}`)
      }

      const data = await response.json()
      const taskId = data.taskId

      // Save taskId to URL for persistence
      updateUrlWithTaskId(taskId)

      // Save to build history
      saveBuildToHistory({
        taskId,
        fileName: file.name,
        appName: appName || file.name.replace(/\.(html|zip)$/i, ''),
        status: 'building',
        createdAt: new Date().toISOString(),
      })

      set({
        taskId,
        status: 'building',
        progress: 5,
        logs: [
          ...get().logs,
          '> UPLOAD COMPLETE.',
          `> TASK ID: ${taskId}`,
          '> INITIALIZING BUILD SUBSYSTEM...'
        ],
      })

      // Poll for status
      await pollBuildStatus(taskId, set, get)

    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'UNKNOWN ERROR',
        logs: [...get().logs, `[FATAL ERROR] ${error instanceof Error ? error.message : 'UNKNOWN ERROR'}`],
      })
    }
  },

  // Start build from pasted code (with auto-detection)
  startCodeBuild: async (code: string, appName: string, iconFile?: File, appVersion?: string, permissions?: string[]) => {
    set({
      status: 'uploading',
      progress: 0,
      logs: [],
      taskId: null,
      traceId: null,
      hint: null,
      errorCode: null,
      fileName: `${appName}.tsx`,
      error: null,
      expiresAt: null,
      retentionHours: null,
    })

    try {
      const formData = new FormData()
      formData.append('code', code)
      formData.append('appName', appName)
      if (iconFile) {
        formData.append('icon', iconFile)
      }
      if (appVersion) {
        formData.append('appVersion', appVersion)
      }
      if (permissions && permissions.length > 0) {
        formData.append('permissions', JSON.stringify(permissions))
      }

      set({ logs: ['> ANALYZING CODE TYPE...', '> INITIATING UPLOAD SEQUENCE...'] })

      const response = await fetch('/api/build/code', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        if (response.status === 429) {
          throw new Error(errorData.message || '构建次数已达上限，请稍后再试')
        }

        if (typeof errorData.taskId === 'string') set({ taskId: errorData.taskId })
        if (typeof errorData.traceId === 'string') set({ traceId: errorData.traceId })
        if (typeof errorData.hint === 'string') set({ hint: errorData.hint })
        if (typeof errorData.code === 'string') set({ errorCode: errorData.code })

        throw new Error(errorData.message || `UPLOAD FAILED: ${response.status}`)
      }

      const data = await response.json()
      const taskId = data.taskId

      // Save taskId to URL for persistence
      updateUrlWithTaskId(taskId)

      // Save to build history
      saveBuildToHistory({
        taskId,
        fileName: `${appName}.${data.detectedType === 'react-component' ? 'tsx' : 'html'}`,
        appName,
        status: 'building',
        createdAt: new Date().toISOString(),
      })

      const detectedTypeMsg = data.detectedType === 'react-component'
        ? '> DETECTED: REACT COMPONENT'
        : data.detectedType === 'html-react'
          ? '> DETECTED: HTML + REACT (BABEL)'
          : '> DETECTED: HTML'

      set({
        taskId,
        status: 'building',
        progress: 5,
        logs: [
          ...get().logs,
          detectedTypeMsg,
          '> UPLOAD COMPLETE.',
          `> TASK ID: ${taskId}`,
          '> INITIALIZING BUILD SUBSYSTEM...'
        ],
      })

      // Poll for status
      await pollBuildStatus(taskId, set, get)

    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'UNKNOWN ERROR',
        logs: [...get().logs, `[FATAL ERROR] ${error instanceof Error ? error.message : 'UNKNOWN ERROR'}`],
      })
    }
  },

  // Restore state from a taskId (e.g., after page refresh)
  restoreFromTaskId: async (taskId: string) => {
    set({
      isRestoring: true,
      status: 'building',
      progress: 0,
      logs: ['> RESTORING SESSION...', `> TASK ID: ${taskId}`, '> FETCHING BUILD STATUS...'],
      taskId,
      fileName: null,
      error: null,
    })

    // Poll for current status
    await pollBuildStatus(taskId, set, get)
    set({ isRestoring: false })
  },

  reset: () => {
    // Clear URL parameter
    updateUrlWithTaskId(null)

    set({
      status: 'idle',
      progress: 0,
      logs: [],
      taskId: null,
      traceId: null,
      hint: null,
      errorCode: null,
      fileName: null,
      downloadUrl: null,
      error: null,
      expiresAt: null,
      retentionHours: null,
      queuePosition: null,
      queueTotal: null,
      isRestoring: false,
    })
  },
}))

async function pollBuildStatus(
  taskId: string,
  set: (state: Partial<BuildState>) => void,
  get: () => BuildState
) {
  const maxAttempts = 200 // ~10 minutes
  let attempts = 0

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`/api/build/${taskId}/status`)

      if (!response.ok) {
        // Handle 404 - task not found (expired or invalid)
        if (response.status === 404) {
          updateUrlWithTaskId(null) // Clear invalid taskId from URL
          set({
            status: 'error',
            error: 'TASK NOT FOUND OR EXPIRED',
            logs: [...get().logs, '[ERROR] Task not found. It may have expired or been deleted.'],
          })
          return
        }
        // Try to parse error message from response
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `STATUS CHECK FAILED: ${response.status}`)
      }

      const data = await response.json()
      const newLogs = [...get().logs]
      const expiresAt = data.expiresAt || null
      const retentionHours = typeof data.retentionHours === 'number' ? data.retentionHours : null

      // Get fileName from API response (backend returns appName as fileName)
      const serverFileName = data.fileName || get().fileName

      // Update fileName if we got it from server (important for restored sessions)
      if (data.fileName && !get().fileName) {
        set({ fileName: data.fileName })
      }

      // Update Logs
      if (data.progress?.message) {
        const logMsg = `> ${data.progress.message.toUpperCase()}`
        if (newLogs[newLogs.length - 1] !== logMsg) {
          newLogs.push(logMsg)
        }
      }

      // Update Status & Progress
      if (data.status === 'completed') {
        newLogs.push('> BUILD SEQUENCE COMPLETE.')
        newLogs.push('> PACKAGE READY FOR EXTRACTION.')

        // Update history with completed status
        updateBuildStatus(taskId, 'completed', expiresAt || undefined)

        set({
          status: 'completed',
          progress: 100,
          logs: newLogs,
          downloadUrl: `/api/build/${taskId}/download`,
          fileName: serverFileName,
          expiresAt: expiresAt || get().expiresAt,
          retentionHours: retentionHours ?? get().retentionHours,
        })
        return
      } else if (data.status === 'failed') {
        const errorMsg = `[SYSTEM FAILURE] ${data.error || 'UNKNOWN ERROR'}`
        newLogs.push(errorMsg)

        // Update history with failed status
        updateBuildStatus(taskId, 'failed')

        set({
          status: 'error',
          error: data.error || 'BUILD FAILED',
          logs: newLogs,
          expiresAt: expiresAt || get().expiresAt,
          retentionHours: retentionHours ?? get().retentionHours,
        })
        return
      } else if (data.status === 'pending') {
        // Queued - waiting in line
        const queuePosition = data.queuePosition || null
        const queueTotal = data.queueTotal || null

        // Always update queue position in logs with latest values
        // Remove any old queue position logs first
        const filteredLogs = newLogs.filter(log => !log.includes('QUEUE POSITION:'))

        // Add current queue info
        if (queuePosition) {
          const queueMsg = queueTotal
            ? `> QUEUE POSITION: ${queuePosition}/${queueTotal}`
            : `> QUEUE POSITION: ${queuePosition}`
          filteredLogs.push(queueMsg)
        }

        newLogs.length = 0
        newLogs.push(...filteredLogs)

        set({
          status: 'queued',
          progress: 5, // Fixed progress for queued state
          logs: newLogs,
          queuePosition,
          queueTotal,
          expiresAt: expiresAt || get().expiresAt,
          retentionHours: retentionHours ?? get().retentionHours,
        })
      } else {
        // Active - building
        let currentProgress = get().progress
        let serverProgress = data.progress?.percent || 0

        // Ensure progress never goes backwards
        let nextProgress = Math.max(currentProgress, serverProgress)

        // Minimum 10% when actively building
        if (nextProgress < 10) {
          nextProgress = 10
        }

        set({
          status: 'building',
          progress: nextProgress,
          logs: newLogs,
          queuePosition: null,
          queueTotal: null,
          expiresAt: expiresAt || get().expiresAt,
          retentionHours: retentionHours ?? get().retentionHours,
        })
      }

      await new Promise(resolve => setTimeout(resolve, 3000))
      attempts++

    } catch (error) {
      // Don't fail immediately on network error, just retry
      console.error('Poll error:', error)
      await new Promise(resolve => setTimeout(resolve, 3000))
      attempts++
    }
  }

  set({
    status: 'error',
    error: 'OPERATION TIMED OUT',
    logs: [...get().logs, '[FATAL ERROR] CONNECTION LOST'],
    expiresAt: null,
    retentionHours: null,
    queuePosition: null,
    queueTotal: null,
  })
}
