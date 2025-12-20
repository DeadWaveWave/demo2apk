import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CornerFrame from './CornerFrame'
import { DEFAULT_PERMISSIONS, getAllPermissionKeys, PERMISSION_CATEGORIES } from '../utils/permissions'

type PermissionSelectorProps = {
  value: string[]
  onChange: (next: string[]) => void
  expanded: boolean
  onToggleExpanded: () => void
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={['h-3 w-3 transition-transform', expanded ? 'rotate-180' : ''].filter(Boolean).join(' ')}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export default function PermissionSelector({
  value,
  onChange,
  expanded,
  onToggleExpanded,
}: PermissionSelectorProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.toLowerCase().startsWith('zh')

  const allKeys = useMemo(() => getAllPermissionKeys(), [])
  const visibleCategories = useMemo(() => {
    return expanded ? PERMISSION_CATEGORIES : []
  }, [expanded])

  const totalCount = allKeys.length

  const setDefaults = useCallback(() => {
    onChange([...DEFAULT_PERMISSIONS])
  }, [onChange])

  const selectAll = useCallback(() => {
    onChange([...allKeys])
  }, [onChange, allKeys])

  const clearAll = useCallback(() => {
    onChange([])
  }, [onChange])

  const togglePermission = useCallback((key: string) => {
    if (value.includes(key)) {
      onChange(value.filter((p) => p !== key))
      return
    }
    onChange([...value, key])
  }, [onChange, value])

  const hasDangerousSelected = useMemo(() => {
    const selected = new Set(value)
    return PERMISSION_CATEGORIES.some((cat) => cat.permissions.some((p) => p.dangerous && selected.has(p.key)))
  }, [value])

  return (
    <CornerFrame
      className="border border-bp-blue/30 bg-bp-dark/30 p-4 md:p-5"
      cornerClassName="border-bp-blue/70"
      cornerSizeClassName="w-3 h-3"
    >
      <div className="absolute -top-3 left-4 bg-bp-panel px-2 text-[10px] md:text-xs font-mono text-bp-dim z-20">
        {t('upload.permissionsTitle', 'APP PERMISSIONS')}
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex items-center gap-2 text-bp-dim hover:text-bp-text transition-colors font-mono text-xs w-fit"
        >
          <Chevron expanded={expanded} />
          <span>
            {expanded
              ? t('upload.permissionsShowLess', 'Show Less')
              : t('upload.permissionsShowMore', 'Show More Categories')}
          </span>
          <span className="px-1.5 py-0.5 border border-bp-grid bg-bp-dark/50 text-bp-blue/80 text-[10px] leading-none">
            {value.length}
          </span>
        </button>

        {expanded && (
          <div className="flex items-center gap-4 md:gap-6 text-[10px] md:text-xs font-mono text-bp-dim">
            <button type="button" onClick={setDefaults} className="hover:text-bp-text transition-colors">
              {t('upload.permissionsDefaults', 'Defaults')}
            </button>
            <button type="button" onClick={selectAll} className="hover:text-bp-text transition-colors">
              {t('upload.permissionsAll', 'All')}
            </button>
            <button type="button" onClick={clearAll} className="hover:text-bp-text transition-colors">
              {t('upload.permissionsClear', 'Clear')}
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 text-[10px] md:text-xs font-mono text-bp-dim flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <span>{t('upload.permissionsInfo', 'Select permissions your app needs. Default includes INTERNET access.')}</span>
        {hasDangerousSelected && (
          <span className="text-bp-alert/80">
            ▲ {t('upload.permissionsDangerousNote', 'Includes sensitive permissions')}
          </span>
        )}
      </div>

      {expanded && (
        <>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {visibleCategories.map((category) => (
              <CornerFrame
                key={category.id}
                className="border border-bp-grid/50 bg-bp-panel/20 p-3"
                cornerClassName="border-bp-grid/70"
                cornerSizeClassName="w-2 h-2"
              >
                <div className="text-bp-text/80 font-mono text-[10px] md:text-xs uppercase tracking-wider">
                  {isZh ? category.labelCn : category.label}
                </div>
                <div className="mt-2 space-y-2">
                  {category.permissions.map((perm) => (
                    <label key={perm.key} className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={value.includes(perm.key)}
                        onChange={() => togglePermission(perm.key)}
                        className="mt-0.5 h-3 w-3 accent-bp-blue"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 font-mono text-xs md:text-sm text-bp-text">
                          <span className="truncate">{isZh ? perm.labelCn : perm.label}</span>
                          {perm.dangerous && (
                            <span
                              className="text-bp-alert/80 text-[10px] leading-none"
                              title={t('upload.permissionsDangerousNote', 'Includes sensitive permissions')}
                            >
                              ▲
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-bp-dim">
                          {isZh ? perm.descriptionCn : perm.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </CornerFrame>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-mono text-bp-dim">
            <span>
              {value.length} / {totalCount} {t('upload.permissionsSelected', 'permissions selected')}
            </span>
          </div>
        </>
      )}
    </CornerFrame>
  )
}
