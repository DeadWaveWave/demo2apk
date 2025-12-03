import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const LANG_STORAGE_KEY = 'demo2apk-lang'
const LANG_OPTIONS = [
  { code: 'en', labelKey: 'language.en' },
  { code: 'zh', labelKey: 'language.zh' },
]

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()

  useEffect(() => {
    const storedLang = localStorage.getItem(LANG_STORAGE_KEY)
    if (storedLang && storedLang !== i18n.language) {
      i18n.changeLanguage(storedLang)
    }
  }, [i18n])

  const handleChange = (code: string) => {
    i18n.changeLanguage(code)
    localStorage.setItem(LANG_STORAGE_KEY, code)
  }

  return (
    <div className="flex items-center gap-2 md:gap-3 text-xs font-mono uppercase tracking-wider text-bp-dim">
      <span className="text-bp-blue/70 hidden md:inline-block">{t('language.label')}</span>
      <div className="flex rounded-sm border border-bp-grid bg-bp-dark/60 overflow-hidden shadow-sm">
        {LANG_OPTIONS.map((option, index) => {
          const isActive = i18n.language === option.code
          const isFirst = index === 0
          return (
            <button
              key={option.code}
              type="button"
              onClick={() => handleChange(option.code)}
              className={`px-2 md:px-3 py-1 flex items-center gap-2 transition-all duration-200 ${
                isActive
                  ? 'bg-bp-blue/20 text-bp-blue border-bp-blue shadow-glow-blue'
                  : 'text-bp-dim hover:text-bp-blue/70 hover:bg-bp-grid/20'
              } ${!isFirst ? 'border-l border-bp-grid/40' : ''}`}
            >
              <span className="text-[10px] tracking-[0.1em] md:tracking-[0.2em]">{option.code.toUpperCase()}</span>
              <span className="hidden md:inline">{t(option.labelKey)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

