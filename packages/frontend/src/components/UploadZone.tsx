import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useBuildStore } from '../hooks/useBuildStore'

type BuildType = 'html' | 'zip'

export default function UploadZone() {
  const [buildType, setBuildType] = useState<BuildType>('html')
  const [appName, setAppName] = useState('')
  const { startBuild } = useBuildStore()

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0]
      startBuild(file, buildType, appName || undefined)
    }
  }, [buildType, appName, startBuild])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: buildType === 'html' 
      ? { 'text/html': ['.html', '.htm'] }
      : { 'application/zip': ['.zip'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
  })

  return (
    <div className="space-y-8">
      {/* Parameter Configuration Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* App Name Input (Primary Config) */}
        <div className="md:col-span-2 relative group">
           <div className="absolute -top-3 left-4 bg-bp-panel px-2 text-xs font-mono text-bp-blue z-10">
            PARAMETER: APP_IDENTIFIER
          </div>
          <div className="relative">
            {/* Decorative corners for input */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-bp-blue/50" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-bp-blue/50" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-bp-blue/50" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-bp-blue/50" />
            
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="ENTER_APP_NAME (OPTIONAL)"
              className="w-full bg-bp-dark/50 border border-bp-grid p-4 text-bp-text font-mono text-lg focus:border-bp-blue focus:outline-none focus:bg-bp-blue/5 transition-colors placeholder-bp-dim/30"
            />
          </div>
        </div>

        {/* Mode Display (Secondary Info) */}
        <div className="border border-bp-grid bg-bp-dark/30 p-4 flex flex-col justify-center relative">
           <div className="absolute -top-3 left-4 bg-bp-panel px-2 text-xs font-mono text-bp-dim">
            CURRENT_MODE
          </div>
          <div className="font-tech text-xl text-bp-blue tracking-widest uppercase">
             {buildType === 'html' ? 'SINGLE_HTML' : 'REACT_BUNDLE'}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 pt-4 border-t border-bp-grid/30">
        <div className="text-bp-blue/70 font-mono text-xs">SECTION: DATA_INGESTION</div>
        <div className="ruler-x w-1/3 opacity-30" />
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-1">
        <button 
          onClick={() => setBuildType('html')}
          className={`flex-1 md:flex-none px-6 py-3 font-mono text-sm uppercase tracking-wider border-t border-l border-r relative transition-all ${
            buildType === 'html' 
              ? 'bg-bp-blue/10 border-bp-blue text-bp-blue' 
              : 'border-transparent text-bp-dim hover:text-bp-blue/70 bg-bp-grid/10'
          }`}
        >
          {buildType === 'html' && <div className="absolute top-0 left-0 w-full h-[2px] bg-bp-blue" />}
          MODE_A: HTML
        </button>
        <button 
          onClick={() => setBuildType('zip')}
          className={`flex-1 md:flex-none px-6 py-3 font-mono text-sm uppercase tracking-wider border-t border-l border-r relative transition-all ${
            buildType === 'zip' 
              ? 'bg-bp-blue/10 border-bp-blue text-bp-blue' 
              : 'border-transparent text-bp-dim hover:text-bp-blue/70 bg-bp-grid/10'
          }`}
        >
           {buildType === 'zip' && <div className="absolute top-0 left-0 w-full h-[2px] bg-bp-blue" />}
          MODE_B: REACT_ZIP
        </button>
      </div>

      {/* Main Upload Area */}
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
               {isDragActive ? '>> RELEASE TO UPLOAD <<' : 'INITIALIZE DATA TRANSFER'}
             </div>
             <div className="text-xs font-mono text-bp-dim mt-2">
               DRAG FILE OR CLICK TO BROWSE
             </div>
           </div>
        </div>
        
        {/* Spec Label */}
        <div className="absolute bottom-4 right-4 font-mono text-[10px] text-bp-dim bg-bp-dark px-2 border border-bp-grid">
           MAX_SIZE: 50MB // FMT: {buildType.toUpperCase()}
        </div>
      </div>
    </div>
  )
}
