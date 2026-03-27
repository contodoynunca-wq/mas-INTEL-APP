import React, { FC } from 'react';
import type { StatusJob } from '../../types';

interface ProcessMonitorProps {
    jobs: StatusJob[];
    onClose: () => void;
    onClearCompleted: () => void;
}

const ProcessMonitorModal: FC<ProcessMonitorProps> = ({ jobs, onClose, onClearCompleted }) => {
    return (
        <div className="modal no-print">
             <div className="modal-content" style={{ width: '600px', maxWidth: '90vw', height: '50vh', display: 'flex', flexDirection: 'column' }}>
                 <div className="modal-header">
                    <h2 className="text-lg font-bold m-0 p-0 border-none">Process Monitor</h2>
                    <div className="flex items-center gap-4">
                        <button onClick={onClearCompleted} className="btn tertiary sm">Clear Completed</button>
                        <button onClick={onClose} className="text-2xl hover:text-primary">&times;</button>
                    </div>
                </div>
                 <div className="modal-body">
                    {jobs.length === 0 ? <p className="text-text-secondary text-center">No active processes.</p> :
                        [...jobs].reverse().map(job => (
                            <div key={job.id} className="mb-4">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-semibold">{job.name}</span>
                                    <span className="text-xs uppercase" style={{ color: job.status === 'complete' ? 'var(--profit-color)' : job.status === 'error' ? 'var(--loss-color)' : 'var(--text-secondary)'}}>{job.status}</span>
                                </div>
                                <div className="w-full bg-surface rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full transition-all duration-300" style={{ width: `${job.progress}%`, backgroundColor: job.color || 'var(--primary)' }}></div>
                                </div>
                                {job.description && <p className="text-xs text-text-secondary mt-1">{job.description}</p>}
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
};

export default ProcessMonitorModal;