import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useBuildStore } from '../hooks/useBuildStore'
import { useTranslation } from 'react-i18next'

type BuildType = 'html' | 'html-paste' | 'zip'

export default function UploadZone() {
  const [buildType, setBuildType] = useState<BuildType>('html')
  const [appName, setAppName] = useState('')
  const [htmlCode, setHtmlCode] = useState('')
  const [useFileName, setUseFileName] = useState(true) // Default: use filename as app name
  const { startBuild } = useBuildStore()
  const { t } = useTranslation()

  // Extract app name from filename (remove extension)
  const getAppNameFromFile = (filename: string) => {
    return filename.replace(/\.(html|htm|zip)$/i, '')
  }

  // For Mode B (Paste Code), we always need a custom name because there is no filename
  const isPasteMode = buildType === 'html-paste'

  // Update useFileName when mode changes
  const handleModeChange = (newMode: BuildType) => {
    setBuildType(newMode)
    // If switching to Paste Mode, force custom name (disable auto filename)
    if (newMode === 'html-paste') {
      setUseFileName(false)
    } else {
      setUseFileName(true)
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0]
      const finalAppName = useFileName ? getAppNameFromFile(file.name) : (appName || undefined)
      startBuild(file, buildType === 'html' ? 'html' : 'zip', finalAppName)
    }
  }, [buildType, appName, useFileName, startBuild])

  const handleHtmlCodeSubmit = useCallback(() => {
    if (!htmlCode.trim()) return

    // Create a File object from the pasted HTML code
    const blob = new Blob([htmlCode], { type: 'text/html' })
    const file = new File([blob], 'pasted-code.html', { type: 'text/html' })

    // For pasted code, use custom name or default
    startBuild(file, 'html', appName || undefined)
  }, [htmlCode, appName, startBuild])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: buildType === 'html'
      ? { 'text/html': ['.html', '.htm'] }
      : { 'application/zip': ['.zip'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    noClick: buildType === 'html-paste',
    noDrag: buildType === 'html-paste',
  })

  return (
    <div className="space-y-8">
      {/* Parameter Configuration Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* App Name Input (Primary Config) */}
        <div className="md:col-span-2 relative group">
          <div className="absolute -top-3 left-4 bg-bp-panel px-2 text-xs font-mono text-bp-blue z-10">
            {t('upload.parameterLabel')}
          </div>
          <div className="relative">
            {/* Decorative corners for input */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-bp-blue/50" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-bp-blue/50" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-bp-blue/50" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-bp-blue/50" />

            <div className="relative flex">
              {useFileName ? (
                /* Auto Mode: Full width button (Blue) */
                <button
                  type="button"
                  onClick={() => !isPasteMode && setUseFileName(false)}
                  className={`w-full bg-bp-blue/10 border border-bp-blue p-4 text-left font-mono text-lg text-bp-blue flex items-center justify-between group transition-all ${isPasteMode ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bp-blue/20'
                    }`}
                >
                  <span className="flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {t('upload.autoLabel')}
                  </span>
                  {!isPasteMode && (
                    <span className="text-xs uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      {t('upload.switchToCustom')} <span className="text-lg">→</span>
                    </span>
                  )}
                </button>
              ) : (
                /* Custom Mode: Input + Toggle Button (Green) */
                <>
                  <input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder={t('upload.customPlaceholder')}
                    className="flex-1 bg-bp-dark/50 border border-green-500/50 p-4 text-green-400 font-mono text-lg focus:border-green-500 focus:outline-none focus:bg-green-500/5 transition-colors placeholder-green-500/30"
                    autoFocus={!useFileName} // Focus when switched to custom
                  />
                  {/* Toggle Button (Only if not in Paste Mode) */}
                  {!isPasteMode && (
                    <button
                      type="button"
                      onClick={() => setUseFileName(true)}
                      className="px-4 border border-l-0 border-green-500/50 bg-green-500/10 text-green-500 hover:bg-green-500/20 font-mono text-xs uppercase tracking-wider transition-all"
                      title="Click to use filename"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-[9px]">{t('upload.autoBadge')}</span>
                      </div>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {/* Helper text */}
          <div className="mt-2 text-[10px] font-mono text-bp-dim flex justify-between">
            <span>
              {useFileName
                ? t('upload.helperAuto')
                : isPasteMode
                  ? t('upload.helperPaste')
                  : t('upload.helperCustom')}
            </span>
            {useFileName && !isPasteMode && (
              <span className="text-bp-blue cursor-pointer hover:underline" onClick={() => setUseFileName(false)}>
                {t('upload.clickToEdit')}
              </span>
            )}
          </div>
        </div>

        {/* Mode Display (Secondary Info) */}
        <div className="border border-bp-grid bg-bp-dark/30 p-4 flex flex-col justify-center relative">
          <div className="absolute -top-3 left-4 bg-bp-panel px-2 text-xs font-mono text-bp-dim">
            {t('upload.currentMode')}
          </div>
          <div className="font-tech text-xl text-bp-blue tracking-widest uppercase">
            {buildType === 'html' ? t('upload.uploadHtml') : buildType === 'html-paste' ? t('upload.pasteHtml') : t('upload.reactBundle')}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 pt-4 border-t border-bp-grid/30">
        <div className="text-bp-blue/70 font-mono text-xs">{t('upload.sectionLabel')}</div>
        <div className="ruler-x w-1/3 opacity-30" />
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => handleModeChange('html')}
          className={`flex-1 md:flex-none px-4 py-3 font-mono text-sm uppercase tracking-wider border-t border-l border-r relative transition-all ${buildType === 'html'
            ? 'bg-bp-blue/10 border-bp-blue text-bp-blue'
            : 'border-transparent text-bp-dim hover:text-bp-blue/70 bg-bp-grid/10'
            }`}
        >
          {buildType === 'html' && <div className="absolute top-0 left-0 w-full h-[2px] bg-bp-blue" />}
          {t('upload.modeUploadHtml')}
        </button>
        <button
          onClick={() => handleModeChange('html-paste')}
          className={`flex-1 md:flex-none px-4 py-3 font-mono text-sm uppercase tracking-wider border-t border-l border-r relative transition-all ${buildType === 'html-paste'
            ? 'bg-bp-cyan/10 border-bp-cyan text-bp-cyan'
            : 'border-transparent text-bp-dim hover:text-bp-cyan/70 bg-bp-grid/10'
            }`}
        >
          {buildType === 'html-paste' && <div className="absolute top-0 left-0 w-full h-[2px] bg-bp-cyan" />}
          {t('upload.modePasteCode')}
        </button>
        <button
          onClick={() => handleModeChange('zip')}
          className={`flex-1 md:flex-none px-4 py-3 font-mono text-sm uppercase tracking-wider border-t border-l border-r relative transition-all ${buildType === 'zip'
            ? 'bg-bp-blue/10 border-bp-blue text-bp-blue'
            : 'border-transparent text-bp-dim hover:text-bp-blue/70 bg-bp-grid/10'
            }`}
        >
          {buildType === 'zip' && <div className="absolute top-0 left-0 w-full h-[2px] bg-bp-blue" />}
          {t('upload.modeReactZip')}
        </button>
      </div>

      {/* Main Area - Conditional based on buildType */}
      {buildType === 'html-paste' ? (
        /* HTML Code Paste Area */
        <div className="space-y-4">
          <div className="relative">
            {/* Corner Markers */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-bp-cyan z-10" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-bp-cyan z-10" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-bp-cyan z-10" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-bp-cyan z-10" />

            <textarea
              value={htmlCode}
              onChange={(e) => setHtmlCode(e.target.value)}
              placeholder={t('upload.textareaPlaceholder')}
              className="w-full h-64 bg-bp-dark/70 border border-bp-grid p-4 text-bp-text font-mono text-sm focus:border-bp-cyan focus:outline-none focus:bg-bp-cyan/5 transition-colors placeholder-bp-dim/40 resize-none"
              spellCheck={false}
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleHtmlCodeSubmit}
            disabled={!htmlCode.trim()}
            className={`w-full py-4 font-tech text-lg uppercase tracking-widest border relative overflow-hidden transition-all duration-300 ${htmlCode.trim()
              ? 'border-bp-cyan text-bp-cyan hover:bg-bp-cyan hover:text-bp-dark cursor-pointer'
              : 'border-bp-grid text-bp-dim cursor-not-allowed'
              }`}
          >
            {/* Animated gradient background on hover */}
            {htmlCode.trim() && (
              <div className="absolute inset-0 bg-gradient-to-r from-bp-cyan/0 via-bp-cyan/10 to-bp-cyan/0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-1000" />
            )}
            <span className="relative z-10">
              {htmlCode.trim() ? t('upload.submitReady') : t('upload.submitDisabled')}
            </span>
          </button>

          {/* Info Label */}
          <div className="flex justify-between items-center text-xs font-mono text-bp-dim">
            <span>{t('upload.charCount', { count: htmlCode.length.toLocaleString() })}</span>
            <span className="text-bp-cyan/70">{t('upload.htmlSupport')}</span>
          </div>
        </div>
      ) : (
        /* File Upload Area */
        <div
          {...getRootProps()}
          className={`
            relative h-64 border border-dashed transition-all duration-300 flex flex-col items-center justify-center group cursor-pointer
            ${isDragActive
              ? 'border-bp-blue bg-bp-blue/5 shadow-glow-blue'
              : 'border-bp-grid bg-bp-dark/50 hover:border-bp-blue/50 hover:bg-bp-blue/5'
            }
          `}
        >
          <input {...getInputProps()} />

          {/* Grid Overlay */}
          <div className="absolute inset-0 bg-blueprint-grid opacity-20 pointer-events-none" />

          {/* Corner Markers */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-bp-blue transition-all group-hover:w-4 group-hover:h-4" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-bp-blue transition-all group-hover:w-4 group-hover:h-4" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-bp-blue transition-all group-hover:w-4 group-hover:h-4" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-bp-blue transition-all group-hover:w-4 group-hover:h-4" />

          <div className="text-center z-10 space-y-4">
            <div className={`text-5xl transition-all duration-300 ${isDragActive ? 'text-bp-blue scale-110' : 'text-bp-dim group-hover:text-bp-blue'}`}>
              {buildType === 'html' ? '📄' : '📦'}
            </div>
            <div>
              <div className="text-xl font-tech text-bp-text tracking-widest uppercase group-hover:text-bp-blue transition-colors">
                {isDragActive ? t('upload.releaseToUpload') : t('upload.initTransfer')}
              </div>
              <div className="text-xs font-mono text-bp-dim mt-2">
                {t('upload.dragOrBrowse')}
              </div>
            </div>
          </div>

          {/* Spec Label */}
          <div className="absolute bottom-4 right-4 font-mono text-[10px] text-bp-dim bg-bp-dark px-2 border border-bp-grid">
            {t('upload.maxSizeLabel', { format: buildType.toUpperCase() })}
          </div>
        </div>
      )}

      {/* React White Screen Warning - Only show in ZIP mode */}
      {buildType === 'zip' && (
        <div className="border border-amber-500/50 bg-amber-500/5 p-4 relative">
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-amber-500" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-amber-500" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-amber-500" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-amber-500" />

          <div className="flex items-start gap-3">
            {/* Warning Icon */}
            <div className="text-amber-500 text-xl flex-shrink-0">⚠️</div>

            <div className="space-y-3 flex-1">
              <div className="font-tech text-amber-400 tracking-wider text-sm uppercase">
                {t('upload.warningTitle')}
              </div>

              <div className="text-xs font-mono text-bp-dim space-y-2">
                <p className="text-bp-text">
                  {t('upload.warningBody')}
                </p>

                <div className="bg-bp-dark/70 p-3 border border-bp-grid overflow-x-auto">
                  <pre className="text-[11px] text-bp-cyan whitespace-pre"><code>{`// vite.config.js
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({ targets: ['chrome >= 52'] })
  ],
  base: './'  // Required for APK
})`}</code></pre>
                </div>

                <div className="flex flex-wrap gap-4 text-[10px] pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-red-400">✗</span>
                    <span className="text-bp-dim">{t('upload.warningTip1')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-400">✓</span>
                    <span className="text-bp-dim">{t('upload.warningTip2')}</span>
                  </div>
                </div>
              </div>

              <a
                href="https://github.com/DeadWaveWave/demo2apk/blob/main/docs/REACT_PROJECT_REQUIREMENTS.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors group"
              >
                <span>{t('upload.docsLink')}</span>
                <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
