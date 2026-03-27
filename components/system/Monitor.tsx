import React, { FC } from 'react';

interface MonitorProps {
    logs: {id: number, timestamp: Date, type: 'AI' | 'DB' | 'SYS' | 'ERR', message: string}[];
    onClose: () => void;
    onPrint: () => void;
    apiCallCount: number;
}

const MonitorComponent: FC<MonitorProps> = ({ logs, onClose, onPrint, apiCallCount }) => {
    const logTypeStyles = {
        AI: 'text-cyan-400',
        DB: 'text-green-400',
        SYS: 'text-yellow-400',
        ERR: 'text-red-400 font-bold',
    };

    return (
        <div className="modal no-print">
            <div className="modal-content" style={{ width: '800px', maxWidth: '90vw', height: '70vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-bold m-0 p-0 border-none">System Monitor</h2>
                        <span className="text-sm font-mono bg-surface px-2 py-1 rounded">API Calls: {apiCallCount}</span>
                    </div>
                     <div className="flex items-center gap-4">
                        <button onClick={onPrint} className="btn tertiary sm">Print Logs</button>
                        <button onClick={onClose} className="text-2xl hover:text-primary">&times;</button>
                    </div>
                </div>
                <div className="modal-body font-mono text-sm">
                    {logs.map(log => (
                        <div key={log.id} className="flex gap-4 border-b border-border-color/20 py-1">
                            <span className="text-text-secondary">{log.timestamp.toLocaleTimeString()}</span>
                            <span className={`${logTypeStyles[log.type]} flex-shrink-0`}>[{log.type}]</span>
                            <span className="flex-grow whitespace-pre-wrap break-all">{log.message}</span>
                        </div>
                    ))}
                    {logs.length === 0 && <p className="text-text-secondary text-center">No log events recorded yet.</p>}
                </div>
            </div>
        </div>
    );
};

export default MonitorComponent;