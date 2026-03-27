
import React, { FC, useState } from 'react';
import type { ForensicResult, Lead } from '@/types';
import { useAppStore } from '@/store/store';

interface ForensicReportModalProps {
    results: ForensicResult[];
    onClose: () => void;
}

const ForensicReportModal: FC<ForensicReportModalProps> = ({ results, onClose }) => {
    const { updateLeadInJob, findParentJob, showModal } = useAppStore();
    const [applying, setApplying] = useState(false);

    const handleApplyUpdates = async () => {
        setApplying(true);
        try {
            for (const res of results) {
                // Only apply logic if actionable
                if (res.newProjectStage || res.criticalAnomaly) {
                    const { job, isSaved } = findParentJob(res.leadId);
                    if (job) {
                        const update: Partial<Lead> = {};
                        let notesToAdd = `[Forensic Audit]: ${res.forensicReality}`;
                        
                        if (res.newProjectStage) {
                            update.projectStage = res.newProjectStage;
                            notesToAdd += ` | Status updated to ${res.newProjectStage}`;
                        }
                        
                        if (res.criticalAnomaly) {
                            notesToAdd += ` | CRITICAL: ${res.criticalAnomaly}`;
                            // Auto-tag logic could go here
                        }

                        // Get existing lead to append notes
                        const existingLead = job.leads.find(l => l.id === res.leadId);
                        const currentNotes = existingLead?.notes || '';
                        update.notes = (currentNotes + '\n' + notesToAdd).trim();

                        await updateLeadInJob(job.id, res.leadId, update, isSaved);
                    }
                }
            }
            await showModal({ type: 'alert', title: 'Updates Applied', message: 'Forensic updates have been applied to the lead records.' });
            onClose();
        } catch (e) {
            console.error(e);
            await showModal({ type: 'alert', title: 'Error', message: 'Failed to apply updates.' });
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '1000px' }}>
                <div className="modal-header">
                    <h2>Forensic Lead Verification Report</h2>
                    <button onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p className="text-sm text-text-secondary mb-4">
                        The AI has cross-referenced your selected leads against real-time news, legal appeals, and construction phases. 
                        Review the "Forensic Reality" before applying updates.
                    </p>
                    
                    <div className="overflow-x-auto max-h-[60vh]">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-surface text-xs uppercase sticky top-0 z-10">
                                <tr>
                                    <th className="p-3">Project Name</th>
                                    <th className="p-3">Reported Status</th>
                                    <th className="p-3 text-primary">Forensic Reality (The Truth)</th>
                                    <th className="p-3 text-loss-color">Critical Anomaly</th>
                                    <th className="p-3 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-color">
                                {results.map((res) => (
                                    <tr key={res.leadId} className="hover:bg-bg-secondary transition-colors">
                                        <td className="p-3 font-bold">{res.projectName}</td>
                                        <td className="p-3 text-text-secondary">{res.reportedStatus}</td>
                                        <td className="p-3 font-medium text-primary">{res.forensicReality}</td>
                                        <td className="p-3 font-bold text-loss-color">
                                            {res.criticalAnomaly || '-'}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                res.strategicAction === 'Pitch' ? 'bg-profit-bg text-profit-color' :
                                                res.strategicAction === 'Monitor' ? 'bg-yellow-500/20 text-yellow-500' :
                                                'bg-loss-bg text-loss-color'
                                            }`}>
                                                {res.strategicAction.toUpperCase()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose} disabled={applying}>Discard Results</button>
                    <button className="btn green" onClick={handleApplyUpdates} disabled={applying}>
                        {applying ? <span className="loader" /> : 'Apply Updates to Database'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ForensicReportModal;
