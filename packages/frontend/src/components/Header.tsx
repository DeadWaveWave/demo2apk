import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from './LanguageSwitcher'

const GITHUB_REPO = 'DeadWaveWave/demo2apk'
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`

export default function Header() {
  const { t } = useTranslation()
  const [starCount, setStarCount] = useState<number | null>(null)

  useEffect(() => {
    // Fetch star count from GitHub API
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`)
      .then(res => res.json())
      .then(data => {
        if (data.stargazers_count !== undefined) {
          setStarCount(data.stargazers_count)
        }
      })
      .catch(() => {
        // Silently fail - star count is not critical
      })
  }, [])

  return (
    <header className="blueprint-box p-4 md:p-6 flex items-center justify-between bg-bp-panel border-b border-bp-blue/30 relative">
      {/* Top Tech Line */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-bp-blue/50" />

      <div className="flex items-center gap-3 md:gap-6">
        {/* Logo */}
        <div className="w-10 h-10 md:w-14 md:h-14 flex-shrink-0 relative">
          <img 
            src="/logo.png" 
            alt="Demo2APK Logo" 
            className="w-full h-full object-contain"
          />
        </div>

        <div>
          <h1 className="text-xl md:text-3xl font-bold text-bp-text tracking-[0.1em] md:tracking-[0.2em] font-tech whitespace-nowrap">
            DEMO<span className="text-bp-blue">2</span>APK
          </h1>
          <div className="flex items-center gap-4 text-xs text-bp-blue/60 font-mono mt-1 hidden md:flex">
            <span>{t('header.tagline')}</span>
            <span>::</span>
            <span>{t('header.mode')}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-6">
        <LanguageSwitcher />
        {/* GitHub Star Button */}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 md:gap-3 px-2 md:px-4 py-1.5 md:py-2 border border-bp-grid hover:border-amber-400 bg-bp-dark/50 hover:bg-amber-400/10 transition-all duration-300 relative"
        >
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-400/50 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-400/50 opacity-0 group-hover:opacity-100 transition-opacity" />

          {/* GitHub Icon - Hidden on very small screens if needed, or keep icon */}
          <svg
            className="w-4 h-4 md:w-5 md:h-5 text-bp-dim group-hover:text-white transition-colors"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>

          {/* Star Icon & Count - Show count on mobile, reduced size */}
          <div className="flex items-center gap-1 md:gap-1.5">
            <svg
              className="w-3 h-3 md:w-4 md:h-4 text-amber-400 group-hover:animate-pulse"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="font-mono text-[10px] md:text-sm text-bp-dim group-hover:text-amber-400 transition-colors">
              {starCount !== null ? starCount.toLocaleString() : t('common.loading', { defaultValue: '...' })}
            </span>
          </div>

          {/* Divider - Hidden on mobile */}
          <div className="h-4 w-[1px] bg-bp-grid hidden md:block" />

          {/* CTA Text - Hidden on mobile */}
          <span className="font-mono text-xs text-bp-dim group-hover:text-amber-400 transition-colors uppercase tracking-wider hidden md:block">
            {t('header.starCta')}
          </span>
        </a>
      </div>
    </header>
  )
}
