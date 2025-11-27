export default function Header() {
  return (
    <header className="blueprint-box p-6 flex items-center justify-between bg-bp-panel border-b border-bp-blue/30 relative">
      {/* Top Tech Line */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-bp-blue/50" />
      
      <div className="flex items-center gap-6">
        {/* Technical Logo Block */}
        <div className="w-12 h-12 border border-bp-blue flex flex-col items-center justify-center bg-bp-blue/5 relative corner-brackets">
          <span className="text-xs font-tech text-bp-blue/50 absolute top-1 left-1">01</span>
          <div className="w-6 h-6 border border-bp-blue transform rotate-45" />
        </div>
        
        <div>
          <h1 className="text-3xl font-bold text-bp-text tracking-[0.2em] font-tech">
            DEMO<span className="text-bp-blue">2</span>APK
          </h1>
          <div className="flex items-center gap-4 text-xs text-bp-blue/60 font-mono mt-1">
            <span>// AUTOMATED BUILD SYSTEM</span>
            <span>::</span>
            <span>ENG-MODE</span>
          </div>
        </div>
      </div>

      {/* Data Block */}
      <div className="hidden md:flex gap-8 items-center font-mono text-xs text-bp-dim">
        <div className="text-right">
          <div className="text-bp-blue/50 text-[10px]">CPU_LOAD</div>
          <div className="text-bp-cyan">12%</div>
        </div>
        <div className="h-8 w-[1px] bg-bp-grid" />
        <div className="text-right">
          <div className="text-bp-blue/50 text-[10px]">MEM_ALLOC</div>
          <div className="text-bp-cyan">512MB</div>
        </div>
        <div className="h-8 w-[1px] bg-bp-grid" />
        <div className="text-right">
          <div className="text-bp-blue/50 text-[10px]">NET_IO</div>
          <div className="text-bp-cyan animate-pulse">ACTIVE</div>
        </div>
      </div>
    </header>
  )
}
