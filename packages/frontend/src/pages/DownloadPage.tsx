import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Header from '../components/Header'

interface TaskStatus {
  status: 'pending' | 'active' | 'completed' | 'failed'
  fileName?: string
  expiresAt?: string
  retentionHours?: number
  error?: string
}

function useExpiryInfo(expiresAt: string | null) {
  const { t } = useTranslation()
  return useMemo(() => {
    if (!expiresAt) {
      return { label: t('complete.unknown'), expired: false }
    }
    const expiryDate = new Date(expiresAt)
    if (Number.isNaN(expiryDate.getTime())) {
      return { label: t('complete.unknown'), expired: false }
    }
    const formatted = expiryDate.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    const diffMs = expiryDate.getTime() - Date.now()
    const expired = diffMs <= 0
    let helper: string | null = null
    if (diffMs > 0) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      helper = t('complete.expiryFuture', { hours, minutes })
    } else {
      helper = t('complete.expiryPast')
    }
    return { label: formatted, helper, expired }
  }, [expiresAt, t])
}

export default function DownloadPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const expiryInfo = useExpiryInfo(taskStatus?.expiresAt ?? null)

  const GITHUB_REPO = 'DeadWaveWave/demo2apk'
  const GITHUB_URL = `https://github.com/${GITHUB_REPO}`

  useEffect(() => {
    if (!taskId) return

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/build/${taskId}/status`)
        if (!response.ok) {
          if (response.status === 404) {
            setError(t('download.notFound'))
          } else {
            setError(t('download.fetchError'))
          }
          setLoading(false)
          return
        }
        const data = await response.json()
        setTaskStatus(data)
      } catch (err) {
        setError(t('download.fetchError'))
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [taskId, t])

  const handleDownload = () => {
    if (taskId) {
      window.open(`/api/build/${taskId}/download`, '_blank')
    }
  }

  const isAvailable = taskStatus?.status === 'completed' && !expiryInfo.expired

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

          {loading ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-6 border-2 border-bp-blue/30 border-t-bp-blue rounded-full animate-spin" />
              <p className="text-bp-dim font-mono text-sm">{t('download.loading')}</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <div className="w-24 h-24 mx-auto mb-8 relative flex items-center justify-center border border-bp-alert/30 rounded-full">
                <div className="w-20 h-20 border border-bp-alert/50 rounded-full flex items-center justify-center bg-bp-alert/5">
                  <svg className="w-10 h-10 text-bp-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <h2 className="text-3xl font-tech text-bp-alert mb-4 tracking-widest">{t('download.errorTitle')}</h2>
              <p className="text-bp-dim font-mono mb-8">{error}</p>
              <Link to="/" className="btn-blueprint">
                {t('download.goHome')}
              </Link>
            </div>
          ) : (
            <div className="text-center py-8 animate-in">
              {/* App Icon */}
              <div className="w-24 h-24 mx-auto mb-8 relative flex items-center justify-center border border-bp-cyan/30 rounded-2xl bg-gradient-to-br from-bp-cyan/10 to-bp-blue/10">
                <div className="absolute inset-0 border border-bp-cyan rounded-2xl animate-pulse opacity-20" />
                <svg className="w-12 h-12 text-bp-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>

              <h2 className="text-4xl font-tech text-bp-text mb-2 tracking-widest">
                {t('download.title')}
              </h2>
              <div className="h-[1px] w-32 bg-bp-cyan/50 mx-auto mb-8 shadow-glow-cyan" />

              {/* File Info Card */}
              <div className="border border-bp-grid bg-bp-dark/50 p-6 max-w-md mx-auto mb-8 text-left relative">
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-bp-cyan" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-bp-cyan" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-bp-cyan" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-bp-cyan" />

                <div className="grid grid-cols-[100px_1fr] gap-4 font-mono text-xs">
                  <div className="text-bp-dim">{t('complete.outputName')}:</div>
                  <div className="text-bp-text truncate">
                    {taskStatus?.fileName?.replace(/\.(html|zip)$/i, '') || 'app'}.apk
                  </div>

                  <div className="text-bp-dim">{t('complete.format')}:</div>
                  <div className="text-bp-blue">{t('complete.formatValue')}</div>

                  <div className="text-bp-dim">{t('complete.status')}:</div>
                  <div className={isAvailable ? 'text-bp-cyan' : 'text-bp-alert'}>
                    {isAvailable ? t('complete.statusValue') : t('download.expired')}
                  </div>

                  <div className="text-bp-dim">{t('complete.expiry')}:</div>
                  <div className="text-bp-alert flex flex-col">
                    <span>{expiryInfo.label}</span>
                    {expiryInfo.helper && <span className="text-xs text-bp-dim mt-1">{expiryInfo.helper}</span>}
                  </div>
                </div>
              </div>

              {/* Download Button */}
              {isAvailable ? (
                <button
                  onClick={handleDownload}
                  className="btn-blueprint-primary group mb-8"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {t('complete.download')}
                  </span>
                </button>
              ) : (
                <div className="mb-8">
                  <p className="text-bp-alert font-mono text-sm mb-4">{t('download.unavailable')}</p>
                </div>
              )}

              {/* Promo Section */}
              <div className="border-t border-bp-grid/30 pt-8 mt-4">
                <p className="text-bp-text font-mono text-sm mb-2">{t('download.promoTitle')}</p>
                <p className="text-bp-dim font-mono text-xs mb-6 max-w-md mx-auto">{t('download.promoDesc')}</p>
                
                <div className="flex flex-col md:flex-row justify-center gap-4">
                  <Link
                    to="/"
                    className="btn-blueprint-primary"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {t('download.tryNow')}
                    </span>
                  </Link>

                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500 text-amber-500 transition-all duration-300 group"
                  >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span className="font-mono text-sm font-bold">{t('complete.starButton')}</span>
                  </a>
                </div>
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

