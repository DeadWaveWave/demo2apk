import React, { useState, useEffect, memo, useRef } from 'react';
import { 
  Play, 
  Check, 
  X,
  Zap,
  MoreHorizontal,
  RotateCcw,
  Gamepad2,
  Headphones,
  Award,
  ChevronDown
} from 'lucide-react';

// --- 1. 数据结构定义 (Data Structure) ---

// 基础选项类型
type Option = {
  id: string;
  text: string;
  isCorrect: boolean;
};

// 学习卡片 (Study Card) - 仅用于词汇/语法学习
type StudyCardData = {
  id: number;
  uniqueId: string;
  type: 'word' | 'image' | 'audio'; // 细分学习类型
  content: string;     // 核心展示内容 (比如 "你好")
  subContent?: string; // 辅助展示 (比如 "Nǐ hǎo")
  hint: string;        // 提示问题
  options: Option[];
  tag: string;         // e.g. "Vocabulary"
};

// 视频数据 (Video Data)
type VideoItemData = {
  id: string;
  type: 'video';
  title: string;
  duration: string;
  thumbnail: string;
  description: string;
};

// 游戏数据 (Game Data)
type GameItemData = {
  id: string;
  type: 'game';
  title: string;
  description: string;
  accentColor: string; // 游戏的主题色
};

// 混合流数据项 (Union Type)
type FeedItem = 
  | { type: 'stack', id: string, title: string, cards: StudyCardData[] }
  | VideoItemData
  | GameItemData;

// --- 2. 模拟数据 (Mock Data) ---

const MOCK_FEED: FeedItem[] = [
  // Item 1: 学习卡片堆 (主线)
  {
    type: 'stack',
    id: 'stack-01',
    title: 'Greetings Basics',
    cards: [
      {
        id: 1, uniqueId: 'c1', type: 'word',
        content: '你好', subContent: 'Nǐ hǎo', hint: 'Select the meaning',
        tag: 'New Word',
        options: [
          { id: '1', text: 'Hello', isCorrect: true },
          { id: '2', text: 'Thanks', isCorrect: false },
          { id: '3', text: 'Bye', isCorrect: false },
        ]
      },
      {
        id: 2, uniqueId: 'c2', type: 'image',
        content: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&q=80&w=600',
        subContent: 'Māo', hint: 'What animal is this?',
        tag: 'Visual',
        options: [
          { id: '1', text: '猫 (Cat)', isCorrect: true },
          { id: '2', text: '狗 (Dog)', isCorrect: false },
          { id: '3', text: '马 (Horse)', isCorrect: false },
        ]
      },
      {
        id: 3, uniqueId: 'c3', type: 'word',
        content: '谢谢', subContent: 'Xiè xie', hint: 'Meaning?',
        tag: 'Phrase',
        options: [
          { id: '1', text: 'Sorry', isCorrect: false },
          { id: '2', text: 'Thanks', isCorrect: true },
        ]
      }
    ]
  },
  // Item 2: 全屏视频 (讲解)
  {
    id: 'vid-01',
    type: 'video',
    title: 'Understanding Tones',
    duration: '2:45',
    description: 'Master the 4 tones of Mandarin in under 3 minutes.',
    thumbnail: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&q=80&w=1000'
  },
  // Item 3: 学习卡片堆 (巩固)
  {
    type: 'stack',
    id: 'stack-02',
    title: 'Common Foods',
    cards: [
      {
        id: 10, uniqueId: 'c10', type: 'word',
        content: '米饭', subContent: 'Mǐ fàn', hint: 'Select the image',
        tag: 'Food',
        options: [
          { id: '1', text: 'Rice', isCorrect: true },
          { id: '2', text: 'Noodles', isCorrect: false },
        ]
      },
      {
        id: 11, uniqueId: 'c11', type: 'audio',
        content: '🔊', subContent: 'Listen carefully', hint: 'What did you hear?',
        tag: 'Listening',
        options: [
          { id: '1', text: 'Water', isCorrect: false },
          { id: '2', text: 'Tea', isCorrect: true },
        ]
      }
    ]
  },
  // Item 4: 全屏小游戏 (娱乐/复习)
  {
    id: 'game-01',
    type: 'game',
    title: 'Tone Rush',
    description: 'Tap the correct tone marks before they fall!',
    accentColor: 'from-violet-500 to-fuchsia-600'
  }
];

// --- 3. 组件 (Components) ---

// 3.1 选项按钮 (Clean, Soft Interaction)
const OptionBtn = ({ option, onSelect, state }: { option: Option, onSelect: () => void, state: 'idle'|'correct'|'wrong' }) => {
  let styles = "w-full p-4 rounded-2xl border-2 font-bold text-lg transition-all duration-200 flex justify-between items-center active:scale-[0.98] cursor-pointer shadow-sm";
  
  if (state === 'idle') styles += " bg-white border-gray-100 text-gray-700 hover:border-indigo-100 hover:bg-gray-50";
  else if (state === 'correct') styles += " bg-green-50 border-green-500 text-green-700 shadow-md";
  else if (state === 'wrong') styles += " bg-red-50 border-red-200 text-red-500";

  return (
    <div onClick={(e) => { e.stopPropagation(); if (state === 'idle') onSelect(); }} className={styles}>
      <span>{option.text}</span>
      {state === 'correct' && <div className="bg-green-500 text-white rounded-full p-1"><Check size={16} strokeWidth={3} /></div>}
      {state === 'wrong' && <div className="bg-red-100 text-red-500 rounded-full p-1"><X size={16} strokeWidth={3} /></div>}
    </div>
  );
};

// 3.2 学习卡片 (The Stack Card)
const StudyCard = ({ data, stackIndex, onResult }: { data: StudyCardData, stackIndex: number, onResult: (ok: boolean) => void }) => {
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [status, setStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [isExiting, setIsExiting] = useState<'none'|'success'|'requeue'>('none');

  // Reset when data changes (e.g. reused component)
  useEffect(() => {
    setSelectedId(null);
    setStatus('idle');
    setIsExiting('none');
  }, [data.uniqueId]);

  const handleSelect = (opt: Option) => {
    if (status !== 'idle') return;
    setSelectedId(opt.id);
    
    if (opt.isCorrect) {
      setStatus('correct');
      setTimeout(() => { setIsExiting('success'); setTimeout(() => onResult(true), 300); }, 600);
    } else {
      setStatus('wrong');
      if (navigator.vibrate) navigator.vibrate(50);
      setTimeout(() => { setIsExiting('requeue'); setTimeout(() => onResult(false), 300); }, 800);
    }
  };

  // Stack Styles
  let containerStyle = "absolute inset-0 transition-all duration-500 cubic-bezier(0.2, 0.8, 0.2, 1) origin-bottom will-change-transform";
  
  if (isExiting === 'success') containerStyle += " -translate-y-[120%] rotate-6 opacity-0";
  else if (isExiting === 'requeue') containerStyle += " translate-y-[20%] scale-90 opacity-0";
  else {
    // Elegant Stacking
    if (stackIndex === 0) containerStyle += " z-30 translate-y-0 scale-100 opacity-100";
    else if (stackIndex === 1) containerStyle += " z-20 translate-y-4 scale-[0.95] opacity-60";
    else containerStyle += " z-10 translate-y-8 scale-[0.90] opacity-30";
  }

  // Content Rendering
  const renderContent = () => {
    if (data.type === 'image') return (
      <div className="w-full aspect-square bg-gray-100 rounded-3xl overflow-hidden mb-6 shadow-inner">
        <img src={data.content} className="w-full h-full object-cover" alt="quiz" />
      </div>
    );
    if (data.type === 'audio') return (
      <div className="w-32 h-32 bg-indigo-50 rounded-full flex items-center justify-center mb-10 text-indigo-500 animate-pulse">
        <Headphones size={48} />
      </div>
    );
    return (
      <div className="text-center mb-12">
        <h2 className="text-5xl font-black text-gray-800 mb-2 tracking-tight">{data.content}</h2>
        <p className="text-xl text-gray-400 font-medium">{data.subContent}</p>
      </div>
    );
  };

  return (
    <div className={containerStyle}>
      <div className="w-full h-full p-4 pb-8 flex flex-col">
        <div className="flex-1 bg-white rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col overflow-hidden relative">
          
          {/* Card Tag */}
          <div className="px-6 py-4 flex justify-between items-center">
            <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">{data.tag}</span>
            <MoreHorizontal className="text-gray-300" size={20} />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-6">
            {renderContent()}
            <p className="text-gray-500 font-medium">{data.hint}</p>
          </div>

          {/* Options Area */}
          <div className="p-4 bg-gray-50/50 space-y-3">
            {data.options.map(opt => (
              <OptionBtn 
                key={opt.id} 
                option={opt} 
                onSelect={() => stackIndex === 0 && handleSelect(opt)}
                state={status !== 'idle' && selectedId === opt.id ? status : 'idle'}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// 3.3 全屏视频组件 (Immersive Video Mode)
const VideoView = ({ data, isActive }: { data: VideoItemData, isActive: boolean }) => {
  return (
    <div className={`w-full h-full relative bg-gray-900 flex flex-col text-white transition-opacity duration-700 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
      {/* Immersive Background */}
      <div className="absolute inset-0">
        <img src={data.thumbnail} className="w-full h-full object-cover opacity-60" alt="video bg" />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col justify-end p-8 pb-20">
        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-6 cursor-pointer hover:bg-white/30 transition-transform active:scale-95">
          <Play size={28} fill="white" className="ml-1" />
        </div>
        
        <div className="flex items-center gap-3 mb-3">
          <span className="bg-indigo-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Lesson</span>
          <span className="text-gray-300 text-xs font-medium">{data.duration}</span>
        </div>
        
        <h2 className="text-3xl font-bold mb-3 leading-tight">{data.title}</h2>
        <p className="text-gray-300 text-sm leading-relaxed max-w-xs">{data.description}</p>
      </div>

      {/* Play Controls Mockup */}
      <div className="absolute bottom-0 w-full h-1 bg-gray-800">
        <div className="h-full bg-white w-1/3 relative">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow" />
        </div>
      </div>
    </div>
  );
};

// 3.4 全屏游戏组件 (Game Mode)
const GameView = ({ data, isActive }: { data: GameItemData, isActive: boolean }) => {
  return (
    <div className={`w-full h-full relative bg-gradient-to-br ${data.accentColor} text-white flex flex-col items-center justify-center text-center p-8 transition-all duration-700 ${isActive ? 'scale-100 opacity-100' : 'scale-95 opacity-50'}`}>
      
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
         <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl animate-pulse" />
         <div className="absolute bottom-20 left-10 w-40 h-40 bg-black/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center mb-8 mx-auto shadow-xl rotate-3 border border-white/30">
          <Gamepad2 size={48} className="text-white drop-shadow-md" />
        </div>
        
        <span className="font-bold tracking-[0.3em] text-white/60 text-xs uppercase mb-2 block">Bonus Round</span>
        <h2 className="text-4xl font-black italic uppercase mb-4 drop-shadow-sm">{data.title}</h2>
        <p className="text-white/90 font-medium mb-10 max-w-[240px] mx-auto leading-relaxed">{data.description}</p>
        
        <button className="bg-white text-indigo-600 w-64 py-4 rounded-2xl font-black uppercase tracking-wide shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
           <Zap size={20} fill="currentColor" /> Play Now
        </button>
      </div>
    </div>
  );
};

// 3.5 堆叠逻辑容器 (Stack Logic Wrapper)
const StackSection = ({ data, isActive }: { data: FeedItem & {type: 'stack'}, isActive: boolean }) => {
  const [queue, setQueue] = useState<StudyCardData[]>(data.cards);
  
  // Re-queue logic for errors
  const handleResult = (success: boolean) => {
    setQueue(prev => {
      const [current, ...rest] = prev;
      if (success) return rest; // Done
      // Move to back with new ID to force animation reset
      return [...rest, { ...current, uniqueId: current.uniqueId + '_r' }];
    });
  };

  const isFinished = queue.length === 0;
  
  // Simple reset for demo
  const handleReset = () => setQueue(data.cards);

  return (
    <div className={`w-full h-full relative transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-20'}`}>
      
      {/* Context Header (Only visible for stacks) */}
      <div className="absolute top-0 left-0 w-full px-6 pt-6 pb-2 z-40 flex justify-between items-end">
         <div>
            <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Unit</span>
            <h3 className="text-xl font-bold text-gray-900 leading-none">{data.title}</h3>
         </div>
         <div className="flex gap-1">
           {data.cards.map((_, i) => (
             <div key={i} className={`h-1.5 w-4 rounded-full transition-colors ${i < (data.cards.length - queue.length) ? 'bg-indigo-500' : 'bg-gray-200'}`} />
           ))}
         </div>
      </div>

      {!isFinished ? (
        <div className="w-full h-full relative pt-20">
          {queue.map((card, index) => {
            // Optimization: Only render top 3 cards
            if (index > 2) return null;
            return (
              <StudyCard 
                key={card.uniqueId} 
                data={card} 
                stackIndex={index} 
                onResult={handleResult} 
              />
            );
          }).reverse()} 
          {/* Reverse map to put first item on top of stack visually if using absolute */}
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-10 bg-white/50 animate-in fade-in zoom-in">
           <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
             <Award size={40} className="text-green-600" />
           </div>
           <h2 className="text-2xl font-bold text-gray-800">Set Complete!</h2>
           <button onClick={handleReset} className="mt-8 flex items-center gap-2 text-gray-400 hover:text-indigo-600 font-bold transition-colors">
             <RotateCcw size={18} /> Review Again
           </button>
           
           <div className="absolute bottom-20 animate-bounce text-gray-400 flex flex-col items-center">
             <span className="text-xs font-bold uppercase tracking-widest mb-1">Next</span>
             <ChevronDown size={20} />
           </div>
        </div>
      )}
    </div>
  );
};

// --- 4. 主程序 (Main App) ---

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Simple Scroll Snapping Logic
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollTop / el.clientHeight);
      if (idx !== activeIndex) setActiveIndex(idx);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [activeIndex]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 text-gray-800 font-sans select-none">
      
      {/* Phone Mockup */}
      <div className="relative w-[375px] h-[812px] bg-white rounded-[40px] border-[8px] border-gray-900 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Dynamic Status Bar (Optional, keeps it clean) */}
        
        {/* Main Feed Container */}
        <div 
          ref={scrollRef}
          className="w-full h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide scroll-smooth bg-gray-50"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {MOCK_FEED.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <div key={item.id} className="w-full h-full snap-start flex-shrink-0 relative overflow-hidden">
                {item.type === 'stack' && <StackSection data={item} isActive={isActive} />}
                {item.type === 'video' && <VideoView data={item} isActive={isActive} />}
                {item.type === 'game' && <GameView data={item} isActive={isActive} />}
              </div>
            );
          })}
          
          {/* End of Feed */}
          <div className="w-full h-full snap-start flex items-center justify-center bg-gray-100 text-gray-400">
             <p className="font-medium">You're all caught up!</p>
          </div>
        </div>

      </div>
      
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}