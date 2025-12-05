import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Header from './components/Header'
import UploadZone from './components/UploadZone'
import BuildProgress from './components/BuildProgress'
import BuildComplete from './components/BuildComplete'
import BuildHistory from './components/BuildHistory'
import { useBuildStore, getTaskIdFromUrl } from './hooks/useBuildStore'

function App() {
  const { status, error, reset, taskId, restoreFromTaskId, isRestoring } = useBuildStore()
  const { t } = useTranslation()

  // Restore state from URL on mount
  useEffect(() => {
    const urlTaskId = getTaskIdFromUrl()
    // Only restore if we have a taskId in URL and we're currently idle
    if (urlTaskId && status === 'idle' && !isRestoring) {
      restoreFromTaskId(urlTaskId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle restore from history
  const handleRestoreFromHistory = useCallback((historyTaskId: string) => {
    restoreFromTaskId(historyTaskId)
  }, [restoreFromTaskId])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
      {/* Ambient Background Glow */}
      <div className="fixed inset-0 pointer-events-none bg-radial-gradient from-bp-blue/5 to-transparent opacity-50" />
      
      {/* Technical Overlay Lines */}
      <div className="fixed top-8 left-8 right-8 h-[1px] bg-bp-blue/20 pointer-events-none hidden md:block">
         <div className="absolute top-[-3px] left-0 w-[100px] h-[1px] bg-bp-blue/50" />
         <div className="absolute top-[-3px] right-0 w-[100px] h-[1px] bg-bp-blue/50" />
      </div>
      <div className="fixed bottom-8 left-8 right-8 h-[1px] bg-bp-blue/20 pointer-events-none hidden md:block" />
      <div className="fixed top-8 bottom-8 left-8 w-[1px] bg-bp-blue/20 pointer-events-none hidden md:block" />
      <div className="fixed top-8 bottom-8 right-8 w-[1px] bg-bp-blue/20 pointer-events-none hidden md:block" />

      {/* Main Interface Container */}
      <div className="w-full max-w-5xl z-10 relative">
        <Header />
        
        <main className="blueprint-box border-t-0 min-h-[400px] p-4 md:p-12 relative overflow-hidden">
          {/* Scanline Effect */}
          <div className="absolute inset-0 bg-gradient-to-b from-bp-blue/5 to-transparent h-[10px] w-full animate-scanline pointer-events-none opacity-30" />
          
          {/* Decorative Crosshairs */}
          <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-bp-blue/50" />
          <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-bp-blue/50" />
          <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-bp-blue/50" />
          <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-bp-blue/50" />

          {status === 'idle' && (
            <>
              <UploadZone />
              <BuildHistory onRestore={handleRestoreFromHistory} />
            </>
          )}
          {(status === 'uploading' || status === 'queued' || status === 'building') && <BuildProgress />}
          {status === 'completed' && <BuildComplete />}
          
          {status === 'error' && (
             <div className="border border-bp-alert bg-bp-alert/5 p-8 text-center corner-brackets">
                <h2 className="text-3xl text-bp-alert mb-4 font-bold tracking-widest">{t('app.systemErrorTitle')}</h2>
                <div className="h-[1px] w-full bg-bp-alert/30 mb-6" />
                <p className="text-bp-text mb-6 font-mono">{error}</p>
                
                {/* Task ID for issue reporting */}
                {taskId && (
                  <div className="mb-8 p-3 border border-bp-grid bg-bp-dark/50 inline-block">
                    <span className="text-bp-dim text-xs font-mono">{t('app.taskIdLabel')}: </span>
                    <span className="text-bp-blue text-xs font-mono select-all">{taskId}</span>
                    <button 
                      onClick={() => navigator.clipboard.writeText(taskId)}
                      className="ml-2 text-bp-dim hover:text-bp-blue text-xs"
                      title={t('app.copyTaskTooltip')}
                    >
                      {t('app.copyTaskId')}
                    </button>
                  </div>
                )}
                
                <div className="flex flex-col items-center gap-2">
                  <button onClick={reset} className="btn-blueprint border-bp-alert text-bp-alert hover:bg-bp-alert hover:text-bp-dark">
                    {t('app.resetButton')}
                  </button>
                  <a 
                    href={`https://github.com/DeadWaveWave/demo2apk/issues/new?title=Build%20Error%20[${taskId || 'N/A'}]&body=**Task%20ID:**%20%60${taskId || 'N/A'}%60%0A%0A**Error:**%0A%60%60%60%0A${encodeURIComponent(error || '')}%0A%60%60%60%0A%0A**Additional%20Info:**%0A`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bp-dim hover:text-bp-text text-xs font-mono"
                  >
                    {t('app.reportIssue')}
                  </a>
                </div>
             </div>
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}

function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="mt-4 flex flex-col md:flex-row gap-2 md:gap-0 justify-between items-center text-[10px] md:text-xs font-mono text-bp-dim uppercase tracking-widest">
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
         <span className="text-bp-blue">{t('footer.systemStatus')}</span>
         <span className="w-2 h-2 bg-bp-cyan rounded-full animate-pulse" />
      </div>
      <div className="flex gap-4 md:gap-8 w-full md:w-auto justify-between md:justify-start">
         <span>{t('footer.buildVersion')}</span>
         <span>{t('footer.latency')}</span>
         <span className="text-bp-blue/50">{t('footer.blueprintId')}</span>
      </div>
    </footer>
  )
}

export default App
