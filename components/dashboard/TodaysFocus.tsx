import React, { FC } from 'react';
import type { Lead } from '@/types';
import { useAppStore } from '@/store/store';
import LeadScoreIndicator from '@/components/leads/LeadScoreIndicator';

interface TodaysFocusProps {
    leads: { lead: Lead; justification: string }[];
    isLoading: boolean;
}

const TodaysFocus: FC<TodaysFocusProps> = ({ leads, isLoading }) => {
    const { handleNavigationRequest } = useAppStore.getState();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="loader" />
                <p className="ml-4 text-sm text-text-secondary">AI is analyzing today's priorities...</p>
            </div>
        );
    }

    if (leads.length === 0) {
        return <p className="text-sm text-text-secondary text-center p-4">No high-priority new leads found for today. Good time to follow up on existing opportunities!</p>;
    }

    return (
        <div className="space-y-3">
            {leads.map(({ lead, justification }) => (
                <div 
                    key={lead.id} 
                    className="p-3 bg-surface rounded-lg cursor-pointer hover:bg-bg-primary border border-border-color"
                    onClick={() => handleNavigationRequest('lead-dossier', { lead })}
                >
                    <div className="flex justify-between items-start">
                        <div className="flex-grow">
                            <p className="font-bold text-sm truncate">{lead.title}</p>
                            <p className="text-xs text-text-secondary">{lead.address}</p>
                        </div>
                        <LeadScoreIndicator score={lead.totalScore} lead={lead} />
                    </div>
                    <p className="text-xs italic text-primary mt-2 p-2 bg-primary/10 rounded">
                        <strong>Why this lead?</strong> {justification}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default TodaysFocus;