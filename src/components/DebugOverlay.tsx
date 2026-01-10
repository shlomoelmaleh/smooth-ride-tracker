import React, { useState, useEffect } from 'react';
import { debugLog } from '@/lib/debugLog';
import { X, Terminal, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DebugOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    state: Record<string, any>;
}

const DebugOverlay: React.FC<DebugOverlayProps> = ({ isOpen, onClose, state }) => {
    const [logs, setLogs] = useState(debugLog.getLogs());

    useEffect(() => {
        return debugLog.subscribe(() => {
            setLogs(debugLog.getLogs());
        });
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col p-4 font-mono text-[10px] animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-primary">
                    <Terminal size={16} />
                    <span className="font-bold uppercase tracking-widest text-xs">System Debug v0.4.0</span>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => debugLog.clear()} className="h-8 w-8 p-0">
                        <Trash2 size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
                        <X size={16} />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.entries(state).map(([key, val]) => (
                    <div key={key} className="bg-muted/20 p-2 rounded border border-white/5">
                        <span className="text-muted-foreground block uppercase font-bold text-[8px] mb-0.5">{key}</span>
                        <span className={val === true ? 'text-green-500' : val === false ? 'text-red-500' : 'text-white'}>
                            {String(val)}
                        </span>
                    </div>
                ))}
            </div>

            <div className="flex-1 overflow-auto bg-black/50 rounded-lg p-2 border border-white/5 space-y-1 select-text">
                {logs.length === 0 && (
                    <div className="text-muted-foreground italic h-full flex items-center justify-center">
                        No logs recorded yet...
                    </div>
                )}
                {logs.map((log, i) => (
                    <div key={i} className={`flex gap-2 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : 'text-green-400/80'}`}>
                        <span className="opacity-30 flex-shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                        <span className="break-all">{log.message}</span>
                    </div>
                ))}
            </div>

            <div className="mt-4 p-2 bg-primary/10 rounded flex items-center gap-2 text-[9px] text-primary/80">
                <Info size={12} />
                <span>Use this screen to diagnose storage or sensor issues on mobile.</span>
            </div>
        </div>
    );
};

export default DebugOverlay;
