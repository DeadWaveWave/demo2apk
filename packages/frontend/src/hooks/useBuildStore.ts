import { create } from 'zustand'

type BuildStatus = 'idle' | 'uploading' | 'building' | 'completed' | 'error'

interface BuildState {
  status: BuildStatus
  progress: number
  logs: string[]
  taskId: string | null
  fileName: string | null
  downloadUrl: string | null
  error: string | null
  expiresAt: string | null
  retentionHours: number | null
  
  // Actions
  startBuild: (file: File, type: 'html' | 'zip', appName?: string) => Promise<void>
  reset: () => void
}

export const useBuildStore = create<BuildState>((set, get) => ({
  status: 'idle',
  progress: 0,
  logs: [],
  taskId: null,
  fileName: null,
  downloadUrl: null,
  error: null,
  expiresAt: null,
  retentionHours: null,

  startBuild: async (file: File, type: 'html' | 'zip', appName?: string) => {
    set({ 
      status: 'uploading', 
      progress: 0, 
      logs: [],
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
        
        throw new Error(errorData.message || `UPLOAD FAILED: ${response.status}`)
      }

      const data = await response.json()
      const taskId = data.taskId

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

  reset: () => {
    set({
      status: 'idle',
      progress: 0,
      logs: [],
      taskId: null,
      fileName: null,
      downloadUrl: null,
      error: null,
      expiresAt: null,
      retentionHours: null,
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
        // Try to parse error message from response
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `STATUS CHECK FAILED: ${response.status}`)
      }

      const data = await response.json()
      const newLogs = [...get().logs]
      const expiresAt = data.expiresAt || null
      const retentionHours = typeof data.retentionHours === 'number' ? data.retentionHours : null
      
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
        set({
          status: 'completed',
          progress: 100,
          logs: newLogs,
          downloadUrl: `/api/build/${taskId}/download`,
          expiresAt: expiresAt || get().expiresAt,
          retentionHours: retentionHours ?? get().retentionHours,
        })
        return
      } else if (data.status === 'failed') {
        const errorMsg = `[SYSTEM FAILURE] ${data.error || 'UNKNOWN ERROR'}`
        newLogs.push(errorMsg)
        set({
          status: 'error',
          error: data.error || 'BUILD FAILED',
          logs: newLogs,
          expiresAt: expiresAt || get().expiresAt,
          retentionHours: retentionHours ?? get().retentionHours,
        })
        return
      } else {
        // Active or Pending
        // Use actual percentage if available, otherwise maintain current or minimum
        let currentProgress = get().progress
        let serverProgress = data.progress?.percent || 0
        
        // Ensure progress never goes backwards
        let nextProgress = Math.max(currentProgress, serverProgress)
        
        // If pending but no progress reported, fake a slow start
        if (data.status === 'pending' && nextProgress < 10) {
            nextProgress = Math.min(nextProgress + 1, 10)
        }

        set({ 
          progress: nextProgress, 
          logs: newLogs,
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
  })
}
