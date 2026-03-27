import React, { FC } from 'react';
import { useAppStore } from '@/store/store';

const MiniMonitors: FC = () => {
    const { 
        logs, 
        apiCallCount,
        processJobs,
        toggleMonitor,
        toggleProcessMonitor,
    } = useAppStore();

    const activeJob = processJobs.find(j => j.status === 'running');
    const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

    const logTypeStyles = {
        AI: 'text-cyan-400',
        DB: 'text-green-400',
        SYS: 'text-yellow-400',
        ERR: 'text-red-400 font-bold',
    };

    return (
        <footer className="h-8 bg-bg-secondary border-t border-border-color flex items-center justify-between px-4 text-xs no-print select-none z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            {/* Left: System Status / Latest Log */}
            <div 
                className="flex items-center gap-3 flex-grow cursor-pointer overflow-hidden mr-4"
                onClick={toggleMonitor}
                title="Click to open System Monitor"
            >
                <div className="flex items-center gap-1 text-text-secondary font-mono bg-surface px-1.5 py-0.5 rounded">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    API: {apiCallCount}
                </div>
                
                <div className="h-4 w-[1px] bg-border-color mx-1"></div>

                {latestLog ? (
                    <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap font-mono opacity-80 hover:opacity-100 transition-opacity">
                        <span className={logTypeStyles[latestLog.type]}>[{latestLog.type}]</span>
                        <span className="truncate text-text-secondary">{latestLog.message}</span>
                    </div>
                ) : (
                    <span className="text-text-secondary opacity-50">System Ready</span>
                )}
            </div>

            {/* Right: Process Status */}
            <div 
                className="flex items-center gap-3 flex-shrink-0 cursor-pointer pl-4 border-l border-border-color"
                onClick={toggleProcessMonitor}
                title="Click to open Process Monitor"
            >
                {activeJob ? (
                    <div className="flex items-center gap-2">
                        <div className="loader !w-3 !h-3 !border-2"></div>
                        <span className="font-semibold text-primary truncate max-w-[150px]">{activeJob.name}</span>
                        <div className="w-16 bg-surface rounded-full h-1.5">
                            <div 
                                className="h-1.5 rounded-full bg-primary transition-all duration-300" 
                                style={{ width: `${activeJob.progress}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <span className="text-text-secondary">No active jobs</span>
                )}
            </div>
        </footer>
    );
};

export default MiniMonitors;