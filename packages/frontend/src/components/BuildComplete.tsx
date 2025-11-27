import { useBuildStore } from '../hooks/useBuildStore'

export default function BuildComplete() {
  const { fileName, reset, downloadUrl } = useBuildStore()

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank')
    }
  }

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
        SEQUENCE COMPLETE
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
           <div className="text-bp-dim">OUTPUT_NAME:</div>
           <div className="text-bp-text truncate">{fileName?.replace(/\.(html|zip)$/i, '')}-debug.apk</div>
           
           <div className="text-bp-dim">FORMAT:</div>
           <div className="text-bp-blue">ANDROID_APK (DEBUG)</div>
           
           <div className="text-bp-dim">STATUS:</div>
           <div className="text-bp-cyan">READY_FOR_DEPLOYMENT</div>

           <div className="text-bp-dim">EXPIRY:</div>
           <div className="text-bp-alert">T-MINUS 24H</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-center gap-4">
        <button 
          onClick={handleDownload}
          className="btn-blueprint-primary group"
        >
          <span className="flex items-center gap-2">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
             </svg>
             DOWNLOAD ARTIFACT
          </span>
        </button>
        
        <button 
          onClick={reset}
          className="btn-blueprint text-bp-dim hover:text-bp-text border-bp-grid hover:border-bp-text"
        >
          INITIATE NEW BUILD
        </button>
      </div>
    </div>
  )
}
