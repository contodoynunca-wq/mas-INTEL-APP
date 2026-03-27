import React, { FC } from 'react';
import type { StatusJob } from '@/types';

interface MiniProcessMonitorProps {
    jobs: StatusJob[];
    onHeaderClick: () => void;
    onClearCompleted: () => void;
}

const MiniProcessMonitor: FC<MiniProcessMonitorProps> = ({ jobs, onHeaderClick, onClearCompleted }) => {
    return (
        <div className="flex flex-col h-full bg-bg-secondary p-2 border-l border-border-color">
            <div 
                className="flex justify-between items-center pb-1 border-b border-border-color cursor-pointer"
                onClick={onHeaderClick}
                title="Click to open full Process Monitor"
            >
                <h3 className="text-sm font-bold m-0 p-0 border-none">Process Monitor</h3>
                <button 
                    onClick={(e) => { e.stopPropagation(); onClearCompleted(); }}
                    className="btn tertiary sm !py-0.5 !px-1.5"
                    title="Clear completed jobs"
                >
                    Clear
                </button>
            </div>
            <div className="flex-grow overflow-y-auto pt-1 pr-1">
                {jobs.length === 0 ? <p className="text-xs text-text-secondary text-center pt-4">No active processes.</p> :
                    [...jobs].reverse().map(job => (
                        <div key={job.id} className="mb-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold truncate pr-2">{job.name}</span>
                                <span className="text-xs uppercase flex-shrink-0" style={{ color: job.status === 'complete' ? 'var(--profit-color)' : job.status === 'error' ? 'var(--loss-color)' : 'var(--text-secondary)'}}>{job.status}</span>
                            </div>
                            <div className="w-full bg-surface rounded-full h-1.5 mt-0.5">
                                <div className="h-1.5 rounded-full transition-all duration-300" style={{ width: `${job.progress}%`, backgroundColor: job.color || 'var(--primary)' }}></div>
                            </div>
                        </div>
                    ))
                }
            </div>
        </div>
    );
};

export default MiniProcessMonitor;