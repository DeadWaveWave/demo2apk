import { useEffect, useRef } from 'react'
import { useBuildStore } from '../hooks/useBuildStore'

export default function BuildProgress() {
  const { progress, logs, taskId, fileName } = useBuildStore()
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="text-bp-blue/70 font-mono text-xs animate-pulse">STATUS: PROCESSING...</div>
        <div className="ruler-x w-1/3 opacity-30" />
      </div>

      {/* Task Information Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6 font-mono text-xs">
        <div className="border border-bp-grid p-2 flex justify-between items-center bg-bp-dark/30">
           <span className="text-bp-dim">TARGET_FILE</span>
           <span className="text-bp-text">{fileName}</span>
        </div>
        <div className="border border-bp-grid p-2 flex justify-between items-center bg-bp-dark/30">
           <span className="text-bp-dim">TASK_HASH</span>
           <span className="text-bp-blue">{taskId?.slice(0, 8)}</span>
        </div>
      </div>

      {/* Progress Visualization */}
      <div className="relative h-12 border border-bp-blue/30 bg-bp-dark/50 p-1 mb-8">
        {/* Progress Bar */}
        <div 
          className="h-full bg-bp-blue/20 border-r border-bp-blue relative transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 bg-[url('/scanline.png')] opacity-30" />
          <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-bp-cyan shadow-glow-cyan" />
        </div>
        
        {/* Percentage Text */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-tech text-xl text-bp-text z-10 mix-blend-difference">
          {Math.round(progress)}%
        </div>

        {/* Grid Lines */}
        <div className="absolute inset-0 flex justify-between px-2 pointer-events-none">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-full w-[1px] bg-bp-grid/50" />
          ))}
        </div>
      </div>

      {/* Terminal Log Output */}
      <div className="relative">
        <div className="absolute -top-3 left-4 bg-bp-panel px-2 text-xs font-mono text-bp-dim">
          SYSTEM_LOGS
        </div>
        <div className="h-[300px] border border-bp-grid bg-[#030508] p-4 font-mono text-xs overflow-y-auto custom-scrollbar shadow-inner">
          {logs.map((log, i) => {
             const isError = log.includes('ERROR') || log.includes('FAILURE');
             const isSuccess = log.includes('SUCCESS') || log.includes('COMPLETE');
             
             return (
               <div key={i} className={`mb-1 flex gap-2 ${
                 isError ? 'text-bp-alert' : isSuccess ? 'text-bp-cyan' : 'text-bp-dim'
               }`}>
                 <span className="opacity-30">{String(i + 1).padStart(2, '0')}</span>
                 <span>{log}</span>
               </div>
             )
          })}
          <div ref={logsEndRef} />
          <div className="w-2 h-4 bg-bp-blue animate-pulse mt-2" />
        </div>
      </div>
    </div>
  )
}
