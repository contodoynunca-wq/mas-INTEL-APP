import React, { FC, useMemo, useState } from 'react';
import type { Lead } from '@/types';
import { useAppStore } from '@/store/store';
import { generateAccountStrategy as generateAccountStrategyService } from '@/services/ai/leadIntelService';
import { ICONS } from '@/constants';

interface KeyAccountModalProps {
    companyName: string;
    onClose: () => void;
}

const KeyAccountModal: FC<KeyAccountModalProps> = ({ companyName, onClose }) => {
    const { activeSearches, savedLeads, processAiJob } = useAppStore();
    const [strategy, setStrategy] = useState<string | null>(null);

    const associatedLeads = useMemo(() => {
        return [...activeSearches, ...savedLeads]
            .flatMap(job => job.leads)
            .filter(lead => lead.companies?.some(c => c.company === companyName))
            .sort((a, b) => (b.dateFound || '').localeCompare(a.dateFound || ''));
    }, [activeSearches, savedLeads, companyName]);

    const handleGenerateStrategy = async () => {
        // FIX: The function passed to processAiJob must accept `updateStatus` and `signal` parameters to match the expected signature, even if they are not used.
        const newStrategy = await processAiJob(async (updateStatus, signal) => {
            return await generateAccountStrategyService(companyName, associatedLeads);
        }, `Generating Account Strategy for ${companyName}`);

        if (newStrategy) {
            setStrategy(newStrategy);
        }
    };

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '800px' }}>
                <div className="modal-header">
                    <h2>Key Account Dossier: {companyName}</h2>
                    <button onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p className="text-sm text-text-secondary mb-4">This company has been identified as a key account because they are associated with <strong>{associatedLeads.length}</strong> of your leads.</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column: Associated Projects */}
                        <div>
                            <h4 className="font-semibold mb-2">Associated Projects</h4>
                            <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                                {associatedLeads.map(lead => (
                                    <div key={lead.id} className="p-3 bg-surface rounded-lg">
                                        <p className="font-bold text-sm truncate">{lead.title}</p>
                                        <p className="text-xs text-text-secondary">{lead.address}</p>
                                        <div className="flex justify-between items-center mt-1 text-xs">
                                            <span>{lead.projectStage}</span>
                                            <span className="font-mono">{lead.dateFound}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right Column: AI Strategy */}
                        <div>
                             <h4 className="font-semibold mb-2">High-Level Account Strategy</h4>
                             {strategy ? (
                                <div 
                                    className="p-3 bg-surface rounded-lg whitespace-pre-wrap text-sm max-h-64 overflow-y-auto"
                                    dangerouslySetInnerHTML={{ __html: strategy.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
                                >
                                </div>
                             ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center p-4 bg-surface rounded-lg">
                                    <p className="text-sm text-text-secondary mb-4">Generate an AI-powered strategy for building a relationship with this entire firm based on their project history.</p>
                                    <button className="btn" onClick={handleGenerateStrategy}>
                                        {ICONS.GENERATE_STRATEGY} Generate Account Strategy
                                    </button>
                                </div>
                             )}
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default KeyAccountModal;
