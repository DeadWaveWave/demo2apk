import { useTranslation } from 'react-i18next'
import { useState } from 'react'

export default function GuideSection() {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="mb-6 border border-bp-blue/30 bg-bp-dark/50 overflow-hidden relative group">
      {/* Decorative Corner */}
      <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-bp-blue/50" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-bp-blue/50" />

      {/* Header / Toggle Bar */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-bp-blue/5 hover:bg-bp-blue/10 transition-colors border-b border-bp-blue/20"
      >
        <div className="flex items-center gap-2">
          <span className="text-bp-cyan text-lg">💡</span>
          <span className="font-tech text-bp-text uppercase tracking-wider text-sm md:text-base">
            {t('guide.title', 'USER GUIDE: HOW TO START')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-bp-dim text-xs font-mono">
          <span className="hidden md:inline">{isExpanded ? t('guide.collapse', '[COLLAPSE]') : t('guide.expand', '[EXPAND]')}</span>
          <svg 
            className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Content Area */}
      <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          
          {/* Intro Text */}
          <div className="md:col-span-3 text-center mb-2">
            <p className="text-bp-text text-sm md:text-base font-mono">
              {t('guide.intro', 'Turn your HTML, React, or Vite projects into installable Android APKs in seconds. No coding required.')}
            </p>
          </div>

          {/* Mode A Guide */}
          <div className="bg-bp-dark border border-bp-grid p-3 md:p-4 relative hover:border-bp-blue/50 transition-colors group/card">
            <div className="text-bp-blue text-xs font-mono mb-2 uppercase tracking-wider border-b border-bp-blue/20 pb-1 flex justify-between">
              <span>{t('guide.modeA_title', 'MODE A: SINGLE FILE')}</span>
              <span className="text-bp-blue/50 group-hover/card:text-bp-blue">01</span>
            </div>
            <p className="text-bp-dim text-xs leading-relaxed">
              {t('guide.modeA_desc', 'Best for simple demos. Upload a single .html file, or a .js/.tsx script. We handle the rest.')}
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <span className="px-1.5 py-0.5 bg-bp-blue/10 text-bp-blue text-[10px] font-mono border border-bp-blue/20">index.html</span>
              <span className="px-1.5 py-0.5 bg-bp-blue/10 text-bp-blue text-[10px] font-mono border border-bp-blue/20">App.tsx</span>
            </div>
          </div>

          {/* Mode B Guide */}
          <div className="bg-bp-dark border border-bp-grid p-3 md:p-4 relative hover:border-bp-cyan/50 transition-colors group/card">
            <div className="text-bp-cyan text-xs font-mono mb-2 uppercase tracking-wider border-b border-bp-cyan/20 pb-1 flex justify-between">
              <span>{t('guide.modeB_title', 'MODE B: PASTE CODE')}</span>
              <span className="text-bp-cyan/50 group-hover/card:text-bp-cyan">02</span>
            </div>
            <p className="text-bp-dim text-xs leading-relaxed">
              {t('guide.modeB_desc', 'Copy code from ChatGPT/Gemini/Claude and paste it here. We intelligently detect if it is HTML or React.')}
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <span className="px-1.5 py-0.5 bg-bp-cyan/10 text-bp-cyan text-[10px] font-mono border border-bp-cyan/20">Ctrl+V</span>
              <span className="px-1.5 py-0.5 bg-bp-cyan/10 text-bp-cyan text-[10px] font-mono border border-bp-cyan/20">AI Code</span>
            </div>
          </div>

          {/* Mode C Guide */}
          <div className="bg-bp-dark border border-bp-grid p-3 md:p-4 relative hover:border-bp-orange/50 transition-colors group/card">
            <div className="text-bp-orange text-xs font-mono mb-2 uppercase tracking-wider border-b border-bp-orange/20 pb-1 flex justify-between">
              <span>{t('guide.modeC_title', 'MODE C: ZIP ARCHIVE')}</span>
              <span className="text-bp-orange/50 group-hover/card:text-bp-orange">03</span>
            </div>
            <p className="text-bp-dim text-xs leading-relaxed">
              {t('guide.modeC_desc', 'For complex projects. Upload a ZIP file containing package.json (React) or index.html + assets.')}
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <span className="px-1.5 py-0.5 bg-bp-orange/10 text-bp-orange text-[10px] font-mono border border-bp-orange/20">project.zip</span>
              <span className="px-1.5 py-0.5 bg-bp-orange/10 text-bp-orange text-[10px] font-mono border border-bp-orange/20">Assets</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

