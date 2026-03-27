import React, { FC, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/store';

interface MiniSystemMonitorProps {
    logs: { id: number; timestamp: Date; type: 'AI' | 'DB' | 'SYS' | 'ERR'; message: string }[];
    apiCallCount: number;
    onHeaderClick: () => void;
}

const MiniSystemMonitor: FC<MiniSystemMonitorProps> = ({ logs, apiCallCount, onHeaderClick }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = logContainerRef.current;
        if (element) {
            // FIX: The scroll behavior was inconsistent because the scroll update sometimes ran before the DOM was fully updated with the new log entry.
            // Using requestAnimationFrame defers the scroll operation until just before the next repaint, ensuring that the `scrollHeight` is accurate.
            requestAnimationFrame(() => {
                element.scrollTop = element.scrollHeight;
            });
        }
    }, [logs]);
    
    const logTypeStyles = {
        AI: 'text-cyan-400',
        DB: 'text-green-400',
        SYS: 'text-yellow-400',
        ERR: 'text-red-400',
    };

    return (
        <div className="flex flex-col h-full bg-bg-secondary p-2">
            <div 
                className="flex justify-between items-center pb-1 border-b border-border-color cursor-pointer"
                onClick={onHeaderClick}
                title="Click to open full System Monitor"
            >
                <h3 className="text-sm font-bold m-0 p-0 border-none">System Monitor</h3>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-surface px-2 py-0.5 rounded">API Calls: {apiCallCount}</span>
                </div>
            </div>
            <div ref={logContainerRef} className="flex-grow overflow-y-auto font-mono text-xs pt-1 pr-1">
                {[...logs].slice(-50).map(log => (
                    <div key={log.id} className="flex gap-2">
                        <span className="text-text-secondary flex-shrink-0">{log.timestamp.toLocaleTimeString()}</span>
                        <span className={`${logTypeStyles[log.type]} flex-shrink-0`}>[{log.type}]</span>
                        <span className="break-all">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MiniSystemMonitor;