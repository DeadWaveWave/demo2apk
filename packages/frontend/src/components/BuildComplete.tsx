import { useMemo, useState } from 'react'
import { useBuildStore } from '../hooks/useBuildStore'
import { useTranslation } from 'react-i18next'

function useExpiryInfo(expiresAt: string | null, retentionHours: number | null) {
  const { t } = useTranslation()
  return useMemo(() => {
    if (!expiresAt) {
      return { label: t('complete.unknown'), helper: null }
    }
    const expiryDate = new Date(expiresAt)
    if (Number.isNaN(expiryDate.getTime())) {
      return { label: t('complete.unknown'), helper: null }
    }
    const formatted = expiryDate.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    const diffMs = expiryDate.getTime() - Date.now()
    let helper: string | null = null
    if (diffMs > 0) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      helper = t('complete.expiryFuture', { hours, minutes })
    } else {
      helper = t('complete.expiryPast')
    }

    if (typeof retentionHours === 'number') {
      helper += ` ${t('complete.retention', { hours: retentionHours })}`
    }

    return { label: formatted, helper }
  }, [expiresAt, retentionHours, t])
}

export default function BuildComplete() {
  const { fileName, reset, downloadUrl, taskId, expiresAt, retentionHours } = useBuildStore()
  const expiryInfo = useExpiryInfo(expiresAt, retentionHours)
  const { t } = useTranslation()
  const [linkCopied, setLinkCopied] = useState(false)

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank')
    }
  }

  // 生成分享链接（指向下载页面）
  const shareUrl = useMemo(() => {
    if (!taskId) return ''
    return `${window.location.origin}/download/${taskId}`
  }, [taskId])

  const handleCopyLink = async () => {
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl)
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy link:', err)
      }
    }
  }

  const GITHUB_REPO = 'DeadWaveWave/demo2apk'
  const GITHUB_URL = `https://github.com/${GITHUB_REPO}`

  return (
    <div className="text-center py-8 animate-in relative">
      {/* Success Icon Construction */}
      <div className="w-24 h-24 mx-auto mb-8 relative flex items-center justify-center border border-bp-cyan/30 rounded-full">
        <div className="absolute inset-0 border border-bp-cyan rounded-full animate-ping opacity-20" />
        <div className="w-20 h-20 border border-bp-cyan/50 rounded-full flex items-center justify-center bg-bp-cyan/5">
          <svg className="w-10 h-10 text-bp-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <h2 className="text-4xl font-tech text-bp-text mb-2 tracking-widest">
        {t('complete.title')}
      </h2>
      <div className="h-[1px] w-32 bg-bp-cyan/50 mx-auto mb-8 shadow-glow-cyan" />

      {/* Manifest Card */}
      <div className="border border-bp-grid bg-bp-dark/50 p-6 max-w-md mx-auto mb-8 text-left relative">
        {/* Decorative Corners */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-bp-cyan" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-bp-cyan" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-bp-cyan" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-bp-cyan" />

        <div className="grid grid-cols-[100px_1fr] gap-4 font-mono text-xs">
          <div className="text-bp-dim">{t('complete.outputName')}:</div>
          <div className="text-bp-text truncate">{fileName?.replace(/\.(html|zip)$/i, '')}.apk</div>

          <div className="text-bp-dim">{t('complete.format')}:</div>
          <div className="text-bp-blue">{t('complete.formatValue')}</div>

          <div className="text-bp-dim">{t('complete.taskId')}:</div>
          <div className="text-bp-blue flex items-center gap-2">
            <span className="select-all">{taskId}</span>
            <button
              onClick={() => taskId && navigator.clipboard.writeText(taskId)}
              className="text-bp-dim hover:text-bp-cyan"
              title={t('app.copyTaskTooltip')}
            >
              {t('app.copyTaskId')}
            </button>
          </div>

          <div className="text-bp-dim">{t('complete.status')}:</div>
          <div className="text-bp-cyan">{t('complete.statusValue')}</div>

          <div className="text-bp-dim">{t('complete.expiry')}:</div>
          <div className="text-bp-alert flex flex-col">
            <span>{expiryInfo.label}</span>
            {expiryInfo.helper && <span className="text-xs text-bp-dim mt-1">{expiryInfo.helper}</span>}
          </div>
        </div>
      </div>

      {/* Share Link Section */}
      <div className="border border-bp-grid bg-bp-dark/50 p-4 max-w-md mx-auto mb-8 relative">
        {/* Decorative Corners */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-bp-blue" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-bp-blue" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-bp-blue" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-bp-blue" />

        <div className="text-bp-dim text-xs font-mono mb-2 uppercase tracking-wider">
          {t('complete.shareTitle')}:
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="flex-1 bg-bp-dark border border-bp-grid text-bp-text text-xs font-mono px-3 py-2 outline-none focus:border-bp-blue select-all"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            onClick={handleCopyLink}
            className={`px-4 py-2 border font-mono text-xs transition-all duration-300 ${
              linkCopied
                ? 'border-bp-cyan bg-bp-cyan/10 text-bp-cyan'
                : 'border-bp-blue bg-bp-blue/5 text-bp-blue hover:bg-bp-blue/10'
            }`}
          >
            <span className="flex items-center gap-2">
              {linkCopied ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {t('complete.linkCopied')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  {t('complete.copyLink')}
                </>
              )}
            </span>
          </button>
        </div>
        <div className="text-bp-dim text-[10px] font-mono mt-2 opacity-70">
          {t('complete.shareLink')}
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-center gap-4 mb-12">
        <button
          onClick={handleDownload}
          className="btn-blueprint-primary group"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('complete.download')}
          </span>
        </button>

        <button
          onClick={reset}
          className="btn-blueprint text-bp-dim hover:text-bp-text border-bp-grid hover:border-bp-text"
        >
          {t('complete.newBuild')}
        </button>
      </div>

      {/* Star Request Section */}
      <div className="border-t border-bp-grid/30 pt-8">
        <p className="text-bp-dim font-mono text-xs mb-4 uppercase tracking-wider">{t('complete.starRequest')}</p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500 text-amber-500 transition-all duration-300 group"
        >
          <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span className="font-mono text-sm font-bold">{t('complete.starButton')}</span>
        </a>
      </div>
    </div>
  )
}
