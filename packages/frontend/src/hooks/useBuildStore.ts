import { create } from 'zustand'

type BuildStatus = 'idle' | 'uploading' | 'queued' | 'building' | 'completed' | 'error'

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
  queuePosition: number | null
  queueTotal: number | null
  
  // Actions
  startBuild: (file: File, type: 'html' | 'zip', appName?: string, iconFile?: File) => Promise<void>
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
  queuePosition: null,
  queueTotal: null,

  startBuild: async (file: File, type: 'html' | 'zip', appName?: string, iconFile?: File) => {
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
      if (iconFile) {
        formData.append('icon', iconFile)
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
      queuePosition: null,
      queueTotal: null,
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
