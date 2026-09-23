import React, { useState, useEffect } from 'react';

type ObjType = 'FILE' | 'APP' | 'NET' | 'PROCESS';

interface OsObject {
  id: string;
  type: ObjType;
  label: string;
  x: number;
  y: number;
}

interface Connection {
  from: string;
  to: string;
}

const getAppIconBg = (id: string) => {
  if (id === 'browser') return 'bg-gradient-to-br from-blue-500 to-blue-700 text-white';
  if (id === 'calculator') return 'bg-gradient-to-br from-amber-500 to-orange-600 text-white';
  if (id === 'vscode') return 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white';
  if (id === 'file') return 'bg-gradient-to-br from-amber-400 to-yellow-600 text-white';
  if (id === 'term') return 'bg-gradient-to-br from-emerald-600 to-green-800 text-white';
  return 'bg-gradient-to-br from-gray-600 to-gray-800 text-white';
};

const getObjectIcon = (obj: OsObject) => {
  if (obj.id === 'browser') return '🌐';
  if (obj.id === 'calculator') return '🧮';
  if (obj.id === 'vscode') return '⚡';
  if (obj.id === 'term') return '📟';
  if (obj.type === 'FILE') return '📁';
  if (obj.type === 'PROCESS') return '⚙️';
  return '📦';
};

const BrowserWindow = ({ onClose, pos, onMove }: { onClose: () => void, pos: {x: number, y: number}, onMove: (x: number, y: number) => void }) => {
  return (
    <div 
      className="absolute bg-[#121212] border border-[#2e7d32] rounded-2xl z-50 flex flex-col shadow-2xl overflow-hidden"
      style={{ 
        left: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.x, 
        top: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.y,
        width: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '720px',
        height: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '480px'
      }}
    >
      <div 
        className="bg-[#1b5e20] text-white px-4 py-2.5 flex justify-between items-center font-sans select-none shadow-md cursor-move"
        onMouseDown={(e) => {
          const startX = e.clientX - pos.x;
          const startY = e.clientY - pos.y;
          const handleMove = (moveEvent: MouseEvent) => {
            onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
          };
          const handleUp = () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
          };
          document.addEventListener('mousemove', handleMove);
          document.addEventListener('mouseup', handleUp);
        }}
      >
          <span className="text-sm font-medium flex items-center gap-2">🌐 Internet Browser</span>
          <button 
            onClick={onClose}
            className="bg-[#c62828] hover:bg-[#b71c1c] text-white px-3 py-0.5 text-xs rounded-full cursor-pointer font-bold shadow"
          >
            ✕
          </button>
      </div>
      <div className="bg-[#1e1e1e] p-2 border-b border-[#2c2c2c] flex gap-2 items-center">
          <span className="text-xs text-emerald-400 font-sans pl-2">URL</span>
          <input 
            defaultValue="https://en.wikipedia.org"
            className="flex-1 bg-[#2c2c2c] border border-[#3a3a3a] text-gray-200 px-3 py-1.5 text-xs rounded-lg outline-none font-sans"
            readOnly
          />
      </div>
      <iframe 
        src="https://en.wikipedia.org" 
        title="Browser"
        className="flex-1 w-full bg-white" 
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
};

const FilesWindow = ({ onClose, files, pos, onMove }: { onClose: () => void, files: any[], pos: {x: number, y: number}, onMove: (x: number, y: number) => void }) => (
  <div 
    className="absolute bg-[#121212] border border-[#2e7d32] rounded-2xl z-50 flex flex-col shadow-2xl overflow-hidden font-sans"
    style={{ 
      left: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.x, 
      top: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.y,
      width: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '420px',
      height: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '360px'
    }}
  >
      <div 
        className="bg-[#1b5e20] text-white px-4 py-2.5 flex justify-between items-center font-medium select-none shadow-md cursor-move"
        onMouseDown={(e) => {
          const startX = e.clientX - pos.x;
          const startY = e.clientY - pos.y;
          const handleMove = (moveEvent: MouseEvent) => {
            onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
          };
          const handleUp = () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
          };
          document.addEventListener('mousemove', handleMove);
          document.addEventListener('mouseup', handleUp);
        }}
      >
          <span className="text-sm flex items-center gap-2">📁 My Files (J-Series Storage)</span>
          <button onClick={onClose} className="bg-[#c62828] hover:bg-[#b71c1c] text-white px-3 py-0.5 text-xs rounded-full cursor-pointer font-bold">✕</button>
      </div>
      <div className="px-4 py-2 bg-[#181818] text-xs text-emerald-400 border-b border-[#2c2c2c]">
          /storage/emulated/0/documents
      </div>
      <div className="flex-1 p-4 overflow-auto grid grid-cols-3 gap-4 bg-[#121212]">
          {files.map(f => (
              <div key={f.id} className="border border-[#2e7d32]/40 rounded-xl p-3 bg-[#1a1a1a] hover:bg-[#222] flex flex-col items-center justify-center cursor-pointer group shadow transition-all">
                  <span className="text-3xl mb-1">📄</span>
                  <span className="text-xs text-gray-200 text-center truncate w-full">{f.name}</span>
                  <span className="text-[9px] text-emerald-500">{f.type}</span>
              </div>
          ))}
          <div className="border border-dashed border-[#2e7d32]/60 rounded-xl p-3 bg-[#1a1a1a] flex flex-col items-center justify-center cursor-pointer hover:bg-[#222]">
              <span className="text-2xl mb-1 text-emerald-400">+</span>
              <span className="text-xs text-emerald-400">New File</span>
          </div>
      </div>
  </div>
);

const TerminalWindow = ({ onClose, pos, onMove }: { onClose: () => void, pos: {x: number, y: number}, onMove: (x: number, y: number) => void }) => {
  const [history, setHistory] = useState<string[]>([
    'Samsung Galaxy J Shell [Android Jelly Bean 4.2.2]',
    'Type "help", "ls", "props", "status", or "clear" below.',
    ''
  ]);
  const [input, setInput] = useState('');

  const handleCmd = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;
    
    let res = '';
    if (cmd === 'help') res = 'Commands: ls, props, status, clear, uptime';
    else if (cmd === 'ls') res = 'DCIM   Download   Music   Pictures   project.code';
    else if (cmd === 'props') res = 'ro.product.model=Galaxy J Series\nro.build.version.release=4.2.2 Jelly Bean\nro.board.platform=msm8916';
    else if (cmd === 'status') res = 'Battery: 100% (AC Powered) | RAM: 1.5GB / 2.0GB';
    else if (cmd === 'uptime') res = 'up 42 mins, load average: 0.45, 0.32, 0.28';
    else if (cmd === 'clear') {
      setHistory([]);
      setInput('');
      return;
    } else {
      res = `sh: ${cmd}: not found`;
    }

    setHistory(prev => [...prev, `shell@j7lte:/ $ ${cmd}`, res, '']);
    setInput('');
  };

  return (
    <div 
      className="absolute bg-[#121212] border border-[#2e7d32] rounded-2xl z-50 flex flex-col shadow-2xl overflow-hidden font-sans"
      style={{ 
        left: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.x, 
        top: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.y,
        width: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '500px',
        height: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '320px'
      }}
    >
      <div 
        className="bg-[#1b5e20] text-white px-4 py-2.5 flex justify-between items-center font-medium select-none shadow-md cursor-move"
        onMouseDown={(e) => {
          const startX = e.clientX - pos.x;
          const startY = e.clientY - pos.y;
          const handleMove = (moveEvent: MouseEvent) => {
            onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
          };
          const handleUp = () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
          };
          document.addEventListener('mousemove', handleMove);
          document.addEventListener('mouseup', handleUp);
        }}
      >
        <span className="text-sm">📟 Terminal Emulator (Android Shell)</span>
        <button onClick={onClose} className="bg-[#c62828] hover:bg-[#b71c1c] text-white px-3 py-0.5 text-xs rounded-full cursor-pointer font-bold">✕</button>
      </div>
      <div className="flex-1 p-3 font-mono text-xs text-emerald-300 overflow-auto bg-[#0d0d0d] flex flex-col">
        {history.map((h, i) => <div key={i} className="whitespace-pre-wrap">{h}</div>)}
      </div>
      <form onSubmit={handleCmd} className="bg-[#181818] border-t border-[#2c2c2c] p-2.5 flex gap-2 items-center">
        <span className="text-xs text-emerald-400 font-mono">shell@j7lte:/ $</span>
        <input 
          value={input}
          onChange={e => setInput(e.target.value)}
          className="flex-1 bg-transparent text-emerald-200 text-xs font-mono outline-none"
          autoFocus
        />
      </form>
    </div>
  );
};

const CalculatorWindow = ({ onClose, pos, onMove }: { onClose: () => void, pos: {x: number, y: number}, onMove: (x: number, y: number) => void }) => {
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrev, setCalcPrev] = useState<number | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);
  const [calcResetOnNext, setCalcResetOnNext] = useState(false);

  const handleCalcBtn = (val: string | number) => {
    if (typeof val === 'number') {
      setCalcDisplay(prev => (prev === '0' || calcResetOnNext) ? String(val) : prev + val);
      setCalcResetOnNext(false);
    } else if (val === 'C') {
      setCalcDisplay('0');
      setCalcPrev(null);
      setCalcOp(null);
      setCalcResetOnNext(false);
    } else if (val === '=') {
      if (calcOp && calcPrev !== null) {
        const current = parseFloat(calcDisplay);
        let res = current;
        if (calcOp === '+') res = calcPrev + current;
        if (calcOp === '-') res = calcPrev - current;
        if (calcOp === '*') res = calcPrev * current;
        if (calcOp === '/') res = current !== 0 ? calcPrev / current : 0;
        setCalcDisplay(String(Number(res.toFixed(6))));
        setCalcPrev(null);
        setCalcOp(null);
        setCalcResetOnNext(true);
      }
    } else {
      setCalcPrev(parseFloat(calcDisplay));
      setCalcOp(val);
      setCalcResetOnNext(true);
    }
  };

  return (
    <div 
      className="absolute bg-[#121212] border border-[#2e7d32] rounded-2xl z-50 p-5 shadow-2xl flex flex-col justify-center font-sans"
      style={{ 
        left: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.x, 
        top: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.y,
        width: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '320px'
      }}
    >
        <div 
          className="flex justify-between items-center mb-3 border-b border-[#2c2c2c] pb-2.5 select-none cursor-move"
          onMouseDown={(e) => {
            const startX = e.clientX - pos.x;
            const startY = e.clientY - pos.y;
            const handleMove = (moveEvent: MouseEvent) => {
              onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
            };
            const handleUp = () => {
              document.removeEventListener('mousemove', handleMove);
              document.removeEventListener('mouseup', handleUp);
            };
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
          }}
        >
            <span className="font-bold text-sm text-white">🧮 Calculator</span>
            <button 
              onClick={onClose}
              className="bg-[#c62828] hover:bg-[#b71c1c] text-white px-3 py-0.5 text-xs rounded-full cursor-pointer font-bold"
            >
              ✕
            </button>
        </div>
        <div className="bg-[#1b5e20]/20 border border-[#2e7d32] rounded-xl p-3 mb-4 text-right text-3xl font-mono text-emerald-400 overflow-x-auto shadow-inner">
          {calcDisplay}
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-sm font-bold">
          {['C', '/', '*', '-'].map(btn => (
            <button 
              key={btn} 
              onClick={() => handleCalcBtn(btn)}
              className="border border-[#333] rounded-xl bg-[#1e1e1e] text-emerald-400 p-3.5 hover:bg-[#2c2c2c] active:bg-[#383838] transition-colors cursor-pointer shadow"
            >
              {btn}
            </button>
          ))}
          {[7, 8, 9, '+'].map(btn => (
            <button 
              key={btn} 
              onClick={() => handleCalcBtn(btn)}
              className="border border-[#333] rounded-xl bg-[#181818] text-white p-3.5 hover:bg-[#2c2c2c] active:bg-[#383838] transition-colors cursor-pointer shadow"
            >
              {btn}
            </button>
          ))}
          {[4, 5, 6, '='].map(btn => (
            <button 
              key={btn} 
              onClick={() => handleCalcBtn(btn)}
              className={`border border-[#333] rounded-xl p-3.5 transition-colors active:scale-95 cursor-pointer shadow ${btn === '=' ? 'bg-[#2e7d32] text-white row-span-2 flex items-center justify-center font-black hover:bg-[#388e3c]' : 'bg-[#181818] text-white hover:bg-[#2c2c2c]'}`}
            >
              {btn}
            </button>
          ))}
          {[1, 2, 3].map(btn => (
            <button 
              key={btn} 
              onClick={() => handleCalcBtn(btn)}
              className="border border-[#333] rounded-xl bg-[#181818] text-white p-3.5 hover:bg-[#2c2c2c] active:bg-[#383838] transition-colors cursor-pointer shadow"
            >
              {btn}
            </button>
          ))}
          <button 
            onClick={() => handleCalcBtn(0)}
            className="col-span-2 border border-[#333] rounded-xl bg-[#181818] text-white p-3.5 hover:bg-[#2c2c2c] active:bg-[#383838] transition-colors cursor-pointer shadow"
          >
            0
          </button>
          <button 
            onClick={() => {
              if (!calcDisplay.includes('.')) {
                setCalcDisplay(prev => prev + '.');
              }
            }}
            className="border border-[#333] rounded-xl bg-[#181818] text-white p-3.5 hover:bg-[#2c2c2c] active:bg-[#383838] transition-colors cursor-pointer shadow"
          >
            .
          </button>
        </div>
    </div>
  );
};

const VSCodeWindow = ({ onClose, pos, onMove }: { onClose: () => void, pos: {x: number, y: number}, onMove: (x: number, y: number) => void }) => {
  const [codeContent, setCodeContent] = useState(`// Android Jelly Bean App Environment
// TouchWiz Nature UX Sandbox

function createJellyBeanApp() {
  const app = { name: "GalaxyJApp", sdk: 18 };
  console.log("Initialized TouchWiz SDK:", app.name);
  return app;
}

createJellyBeanApp();`);
  const [codeOutput, setCodeOutput] = useState<string>('Ready.');

  const runCode = () => {
    try {
      const logs: string[] = [];
      const customConsole = {
        log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '))
      };
      const runFn = new Function('console', codeContent);
      runFn(customConsole);
      setCodeOutput(logs.length > 0 ? logs.join('\n') : 'Code executed with no output.');
    } catch (err: unknown) {
      setCodeOutput(`Error: ${(err as Error).message}`);
    }
  };

  return (
    <div 
      className="absolute bg-[#121212] border border-[#2e7d32] rounded-2xl z-50 flex flex-col shadow-2xl overflow-hidden font-sans"
      style={{ 
        left: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.x, 
        top: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.y,
        width: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '800px',
        height: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '520px'
      }}
    >
        <div 
          className="bg-[#1b5e20] text-white px-4 py-2.5 flex justify-between items-center font-medium select-none shadow-md cursor-move"
          onMouseDown={(e) => {
            const startX = e.clientX - pos.x;
            const startY = e.clientY - pos.y;
            const handleMove = (moveEvent: MouseEvent) => {
              onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
            };
            const handleUp = () => {
              document.removeEventListener('mousemove', handleMove);
              document.removeEventListener('mouseup', handleUp);
            };
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">⚡ TouchWiz Code Studio</span>
            <span className="text-xs text-emerald-300 font-mono">App.js</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={runCode}
              className="bg-[#2e7d32] hover:bg-[#388e3c] text-white font-bold px-3 py-1 text-xs rounded-full cursor-pointer shadow"
            >
              ▶ Run
            </button>
            <button 
              onClick={onClose}
              className="bg-[#c62828] hover:bg-[#b71c1c] text-white px-3 py-0.5 text-xs rounded-full cursor-pointer font-bold"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-[#121212]">
          <div className="flex-1 flex flex-col border-r border-[#2c2c2c] min-h-[150px]">
            <div className="bg-[#181818] px-4 py-1.5 text-xs text-emerald-400 border-b border-[#2c2c2c] select-none">
              Source Editor
            </div>
            <textarea 
              value={codeContent}
              onChange={(e) => setCodeContent(e.target.value)}
              className="flex-1 w-full bg-[#121212] text-gray-200 p-4 font-mono text-xs outline-none resize-none selection:bg-[#2e7d32]"
              spellCheck={false}
            />
          </div>
          <div className="w-full md:w-80 flex flex-col bg-[#181818] border-t md:border-t-0 border-[#2c2c2c] h-36 md:h-auto">
            <div className="bg-[#1e1e1e] px-4 py-1.5 text-xs text-emerald-400 border-b border-[#2c2c2c] font-medium select-none">
              Logcat Output
            </div>
            <pre className="flex-1 p-4 text-emerald-300 font-mono text-xs overflow-auto whitespace-pre-wrap bg-[#0d0d0d]">
              {codeOutput}
            </pre>
          </div>
        </div>
    </div>
  );
};

const SettingsWindow = ({ 
  onClose, pos, onMove
}: { 
  onClose: () => void, pos: {x: number, y: number}, onMove: (x: number, y: number) => void
}) => {
  return (
    <div 
      className="absolute bg-[#121212] border border-[#2e7d32] rounded-2xl z-50 flex flex-col shadow-2xl overflow-hidden font-sans"
      style={{ 
        left: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.x, 
        top: typeof window !== 'undefined' && window.innerWidth < 640 ? '8px' : pos.y,
        width: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '480px',
        height: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100% - 16px)' : '360px'
      }}
    >
      <div 
        className="bg-[#1b5e20] text-white px-4 py-3 flex justify-between items-center font-medium select-none shadow-md cursor-move"
        onMouseDown={(e) => {
          const startX = e.clientX - pos.x;
          const startY = e.clientY - pos.y;
          const handleMove = (moveEvent: MouseEvent) => {
            onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
          };
          const handleUp = () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
          };
          document.addEventListener('mousemove', handleMove);
          document.addEventListener('mouseup', handleUp);
        }}
      >
        <span className="text-sm">⚙️ Galaxy J Settings</span>
        <button onClick={onClose} className="bg-[#c62828] hover:bg-[#b71c1c] text-white px-3 py-0.5 text-xs rounded-full cursor-pointer font-bold">✕</button>
      </div>
      <div className="flex-1 p-6 flex flex-col gap-6 text-sm text-gray-200 overflow-auto bg-[#121212]">
        <div className="flex flex-col gap-2">
          <label className="text-emerald-400 font-bold uppercase tracking-wider text-xs">About Phone (J-Series)</label>
          <div className="p-3.5 border border-[#333] rounded-xl bg-[#181818] flex flex-col gap-1.5 text-xs text-gray-300 font-mono">
            <div>Model number: SM-J700F (TouchWiz Nature UX)</div>
            <div>Android version: 4.2.2 Jelly Bean</div>
            <div>Kernel version: 3.10.0-jellybean-g99</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PixelObject = ({ 
  obj, 
  onLaunch
}: { 
  obj: OsObject, 
  onLaunch?: (id: string) => void
}) => {
  return (
    <div
      className="absolute p-3 sm:p-4 flex flex-col items-center cursor-pointer select-none group active:scale-95 w-20 sm:w-24 z-10"
      style={{ left: obj.x, top: obj.y }}
      onDoubleClick={() => onLaunch && onLaunch(obj.id)}
      onClick={() => onLaunch && onLaunch(obj.id)}
    >
      <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${getAppIconBg(obj.id)} flex items-center justify-center text-2xl sm:text-3xl shadow-xl group-hover:scale-110 transition-transform border border-white/10`}>
        {getObjectIcon(obj)}
      </div>
      <div className="text-[11px] sm:text-xs font-sans text-center font-medium tracking-tight text-white mt-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate w-full">
        {obj.label}
      </div>
    </div>
  );
};

export default function App() {
  const [objects, setObjects] = useState<OsObject[]>([
    { id: 'browser', type: 'APP', label: 'Internet', x: 20, y: 80 },
    { id: 'calculator', type: 'APP', label: 'Calculator', x: 130, y: 80 },
    { id: 'vscode', type: 'APP', label: 'Code Studio', x: 240, y: 80 },
    { id: 'file', type: 'FILE', label: 'My Files', x: 20, y: 220 },
    { id: 'term', type: 'PROCESS', label: 'Terminal', x: 130, y: 220 },
  ]);

  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isVSCodeOpen, setIsVSCodeOpen] = useState(false);
  const [isTermOpen, setIsTermOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Window positions
  const [winPos, setWinPos] = useState({
    browser: { x: 100, y: 50 },
    files: { x: 40, y: 80 },
    calc: { x: 400, y: 100 },
    vscode: { x: 150, y: 60 },
    term: { x: 300, y: 200 },
    settings: { x: 200, y: 120 }
  });

  const updateWinPos = (id: string, x: number, y: number) => {
    setWinPos(prev => ({ ...prev, [id]: { x, y } }));
  };

  const [filesList, setFilesList] = useState<any[]>([
    { id: 'f1', name: 'project.code', type: 'FILE' },
    { id: 'f2', name: 'wallpaper.jpg', type: 'FILE' },
    { id: 'f3', name: 'notes.txt', type: 'FILE' }
  ]);

  useEffect(() => {
    const pollState = async () => {
        try {
            const res = await fetch('/os/state');
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                return;
            }
            const data = await res.json();
            if (data.files && Array.isArray(data.files)) {
                setFilesList(data.files);
            }
        } catch {
            // Silently fall back to local state if backend route is unavailable
        }
    };
    pollState();
    const interval = setInterval(pollState, 10000);
    return () => clearInterval(interval);
  }, []);

  const launchApp = async (id: string) => {
    if (id === 'browser') setIsBrowserOpen(true);
    else if (id === 'calculator') setIsCalculatorOpen(true);
    else if (id === 'vscode') setIsVSCodeOpen(true);
    else if (id === 'file') setIsFilesOpen(true);
    else if (id === 'term') setIsTermOpen(true);
  };

  return (
    <div className="h-screen w-screen bg-[#081c15] text-gray-100 font-sans overflow-hidden flex flex-col relative select-none">
      {/* Top TouchWiz Status Bar */}
      <div className="bg-[#0b251d] border-b border-[#1b4332] px-4 py-2 flex justify-between items-center text-xs font-medium text-emerald-100 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-wider text-emerald-400">GALAXY J</span>
          <span className="text-[11px] text-emerald-300/70 hidden sm:inline">| Android 4.2.2 Jelly Bean</span>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-emerald-200">
          <span>📶 3G / H+</span>
          <span>🔋 100%</span>
          <span className="font-bold">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Desktop / TouchWiz Nature UX Workspace */}
      <div className="flex-1 relative overflow-hidden bg-[radial-gradient(#1b4332_1px,transparent_1px)] [background-size:32px_32px]">
        {/* Jelly Bean Nature Wallpaper Widget Header */}
        <div className="absolute top-6 left-6 right-6 sm:w-80 bg-[#122820]/90 border border-[#2d6a4f]/50 rounded-2xl p-4 shadow-xl backdrop-blur-sm pointer-events-none select-none flex flex-col gap-1">
          <div className="text-2xl font-bold text-white tracking-tight">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-xs text-emerald-300 font-medium">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div className="text-[11px] text-emerald-400/80 mt-1 flex items-center gap-1">
            <span>⛅ 24°C • TouchWiz Nature UX</span>
          </div>
        </div>

        {/* Desktop Objects / Icons */}
        {objects.map(obj => (
          <PixelObject 
            key={obj.id} 
            obj={obj} 
            onLaunch={launchApp}
          />
        ))}

        {/* Windows */}
        {isBrowserOpen && <BrowserWindow onClose={() => setIsBrowserOpen(false)} pos={winPos.browser} onMove={(x, y) => updateWinPos('browser', x, y)} />}
        {isFilesOpen && <FilesWindow onClose={() => setIsFilesOpen(false)} files={filesList} pos={winPos.files} onMove={(x, y) => updateWinPos('files', x, y)} />}
        {isCalculatorOpen && <CalculatorWindow onClose={() => setIsCalculatorOpen(false)} pos={winPos.calc} onMove={(x, y) => updateWinPos('calc', x, y)} />}
        {isVSCodeOpen && <VSCodeWindow onClose={() => setIsVSCodeOpen(false)} pos={winPos.vscode} onMove={(x, y) => updateWinPos('vscode', x, y)} />}
        {isTermOpen && <TerminalWindow onClose={() => setIsTermOpen(false)} pos={winPos.term} onMove={(x, y) => updateWinPos('term', x, y)} />}
        {isSettingsOpen && <SettingsWindow onClose={() => setIsSettingsOpen(false)} pos={winPos.settings} onMove={(x, y) => updateWinPos('settings', x, y)} />}
      </div>

      {/* Bottom TouchWiz Nature UX Dock */}
      <div className="bg-[#0b251d] border-t border-[#1b4332] h-16 px-4 flex justify-between items-center z-40 shadow-2xl">
        <div className="flex gap-2 sm:gap-4 overflow-x-auto py-1 w-full justify-around sm:justify-start">
          <button 
            onClick={() => setIsFilesOpen(prev => !prev)}
            className="flex flex-col items-center justify-center px-3 py-1 rounded-xl hover:bg-[#1b4332]/50 text-xs text-emerald-200 cursor-pointer transition-colors"
          >
            <span className="text-xl">📁</span> 
            <span className="text-[10px] font-medium">Files</span>
          </button>
          <button 
            onClick={() => setIsBrowserOpen(prev => !prev)}
            className="flex flex-col items-center justify-center px-3 py-1 rounded-xl hover:bg-[#1b4332]/50 text-xs text-emerald-200 cursor-pointer transition-colors"
          >
            <span className="text-xl">🌐</span> 
            <span className="text-[10px] font-medium">Internet</span>
          </button>
          <button 
            onClick={() => setIsCalculatorOpen(prev => !prev)}
            className="flex flex-col items-center justify-center px-3 py-1 rounded-xl hover:bg-[#1b4332]/50 text-xs text-emerald-200 cursor-pointer transition-colors"
          >
            <span className="text-xl">🧮</span> 
            <span className="text-[10px] font-medium">Calc</span>
          </button>
          <button 
            onClick={() => setIsVSCodeOpen(prev => !prev)}
            className="flex flex-col items-center justify-center px-3 py-1 rounded-xl hover:bg-[#1b4332]/50 text-xs text-emerald-200 cursor-pointer transition-colors"
          >
            <span className="text-xl">⚡</span> 
            <span className="text-[10px] font-medium">Code</span>
          </button>
          <button 
            onClick={() => setIsTermOpen(prev => !prev)}
            className="flex flex-col items-center justify-center px-3 py-1 rounded-xl hover:bg-[#1b4332]/50 text-xs text-emerald-200 cursor-pointer transition-colors"
          >
            <span className="text-xl">📟</span> 
            <span className="text-[10px] font-medium">Terminal</span>
          </button>
          <button 
            onClick={() => setIsSettingsOpen(prev => !prev)}
            className="flex flex-col items-center justify-center px-3 py-1 rounded-xl hover:bg-[#1b4332]/50 text-xs text-emerald-200 cursor-pointer transition-colors"
          >
            <span className="text-xl">⚙️</span> 
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
