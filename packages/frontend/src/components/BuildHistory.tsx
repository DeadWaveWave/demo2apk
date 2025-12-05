import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { 
  getBuildHistory, 
  removeBuildFromHistory, 
  clearBuildHistory,
  isBuildExpired,
  type BuildHistoryItem 
} from '../utils/buildHistory'

interface BuildHistoryProps {
  onRestore: (taskId: string) => void
}

export default function BuildHistory({ onRestore }: BuildHistoryProps) {
  const { t } = useTranslation()
  const [history, setHistory] = useState<BuildHistoryItem[]>([])
  const [isExpanded, setIsExpanded] = useState(false)

  // Load history on mount
  useEffect(() => {
    setHistory(getBuildHistory())
  }, [])

  const handleRemove = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removeBuildFromHistory(taskId)
    setHistory(getBuildHistory())
  }

  const handleClear = () => {
    clearBuildHistory()
    setHistory([])
  }

  const handleRestore = (item: BuildHistoryItem) => {
    onRestore(item.taskId)
  }

  const getStatusIcon = (status: BuildHistoryItem['status'], expired: boolean) => {
    if (expired) {
      return <span className="text-bp-dim">⏱</span>
    }
    switch (status) {
      case 'completed':
        return <span className="text-bp-cyan">✓</span>
      case 'failed':
        return <span className="text-bp-alert">✗</span>
      case 'building':
      case 'queued':
        return <span className="text-bp-warning animate-pulse">⋯</span>
      default:
        return <span className="text-bp-dim">?</span>
    }
  }

  const getStatusText = (status: BuildHistoryItem['status'], expired: boolean) => {
    if (expired) return t('history.expired')
    switch (status) {
      case 'completed': return t('history.completed')
      case 'failed': return t('history.failed')
      case 'building': return t('history.building')
      case 'queued': return t('history.queued')
      default: return status
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t('history.justNow')
    if (diffMins < 60) return t('history.minsAgo', { mins: diffMins })
    if (diffHours < 24) return t('history.hoursAgo', { hours: diffHours })
    return t('history.daysAgo', { days: diffDays })
  }

  if (history.length === 0) {
    return null
  }

  return (
    <div className="mt-8 border border-violet-500/40 bg-violet-500/5 relative">
      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-violet-500" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-violet-500" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-violet-500" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-violet-500" />
      
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-violet-500/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-violet-400 text-sm">📋</span>
          <span className="text-violet-300 font-mono text-xs uppercase tracking-wider">
            {t('history.title')}
          </span>
          <span className="text-violet-400/70 font-mono text-xs px-1.5 py-0.5 bg-violet-500/20 rounded">
            {history.length}
          </span>
        </div>
        <svg 
          className={`w-4 h-4 text-violet-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-violet-500/30">
          {/* List */}
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
            {history.map((item) => {
              const expired = isBuildExpired(item)
              return (
                <div
                  key={item.taskId}
                  onClick={() => handleRestore(item)}
                  className="px-4 py-3 border-b border-violet-500/10 last:border-b-0 hover:bg-violet-500/10 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Status Icon */}
                      <div className="w-5 h-5 flex items-center justify-center font-mono">
                        {getStatusIcon(item.status, expired)}
                      </div>
                      
                      {/* App Name */}
                      <div className="flex-1 min-w-0">
                        <div className="text-bp-text text-sm font-mono truncate">
                          {item.appName || item.fileName || item.taskId}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-bp-dim">
                          <span>{getStatusText(item.status, expired)}</span>
                          <span>•</span>
                          <span>{formatTime(item.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.status === 'completed' && !expired && (
                        <a
                          href={`/api/build/${item.taskId}/download`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 text-bp-cyan hover:text-bp-cyan/80"
                          title={t('history.download')}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>
                      )}
                      <button
                        onClick={(e) => handleRemove(item.taskId, e)}
                        className="p-1 text-bp-dim hover:text-bp-alert"
                        title={t('history.remove')}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-violet-500/20 flex justify-end bg-violet-500/5">
            <button
              onClick={handleClear}
              className="text-xs text-violet-400/70 hover:text-bp-alert font-mono transition-colors"
            >
              {t('history.clearAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

