
import React, { FC, useEffect } from 'react';
import { useAppStore } from '@/store/store';

const SupervisorView: FC = () => {
    const { 
        latestSupervisorReport, 
        checkAndRunSupervisorReport, 
        fetchLatestSupervisorReport,
        isAiJobRunning 
    } = useAppStore();

    useEffect(() => {
        fetchLatestSupervisorReport();
    }, [fetchLatestSupervisorReport]);

    const handleForceRun = () => {
        if (confirm("Force run Supervisor Analysis? This uses significant AI tokens.")) {
            // We manually trigger it via the same check function but we assume logic handles the date check
            // Actually, let's just call the process job logic directly or rely on checkAndRun logic
            // For now, we rely on checkAndRunSupervisorReport which has the date guard.
            // To FORCE it, we might need a separate action or just clear the date in store dev tools.
            // Simplified: just call the check function, usually intended for cron-like behavior.
            checkAndRunSupervisorReport();
        }
    };

    if (!latestSupervisorReport) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <div className="p-8 text-center bg-surface rounded-lg border border-border-color max-w-md">
                    <h2 className="text-xl font-bold text-primary mb-2">System Supervisor Offline</h2>
                    <p className="text-text-secondary mb-6">No evolution report has been generated yet.</p>
                    <button className="btn green" onClick={checkAndRunSupervisorReport} disabled={isAiJobRunning}>
                        {isAiJobRunning ? <span className="loader" /> : 'Initialize Supervisor AI'}
                    </button>
                </div>
            </div>
        );
    }

    const { insights, recommendations, rawSummary, generatedAt } = latestSupervisorReport;

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-primary mb-1">Supervisor AI Dashboard</h1>
                    <p className="text-text-secondary text-sm font-mono">
                        REPORT ID: {latestSupervisorReport.id} | GENERATED: {new Date(generatedAt).toLocaleString()}
                    </p>
                </div>
                <button className="btn secondary" onClick={checkAndRunSupervisorReport} disabled={isAiJobRunning}>
                    Run New Analysis
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* System Health Card */}
                <div className="panel bg-surface border-l-4 border-l-primary">
                    <h3 className="text-lg font-bold mb-4">System Vitality</h3>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-text-secondary">Health Status:</span>
                        <span className={`font-bold px-3 py-1 rounded ${insights.systemHealth.includes('Optimal') ? 'bg-profit-bg text-profit-color' : 'bg-loss-bg text-loss-color'}`}>
                            {insights.systemHealth}
                        </span>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs font-bold text-text-secondary uppercase">Usage Patterns</p>
                            <ul className="list-disc list-inside text-sm pl-1">
                                {insights.usagePatterns.map((p, i) => <li key={i}>{p}</li>)}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Friction Points Card */}
                <div className="panel bg-surface border-l-4 border-l-loss-color">
                    <h3 className="text-lg font-bold mb-4">Friction & Resistance</h3>
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs font-bold text-text-secondary uppercase text-loss-color">Identified Pain Points</p>
                            <ul className="list-disc list-inside text-sm pl-1">
                                {insights.frictionPoints.map((p, i) => <li key={i}>{p}</li>)}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <div className="panel mb-8">
                <h3 className="text-xl font-bold mb-4 text-primary">Strategic Evolution Plan</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h4 className="font-bold border-b border-border-color pb-2 mb-4">Automation Opportunities</h4>
                        <ul className="space-y-2">
                            {insights.automationOpportunities.map((opp, i) => (
                                <li key={i} className="flex items-start gap-2 bg-bg-secondary p-3 rounded">
                                    <span className="text-primary">⚡</span>
                                    <span className="text-sm">{opp}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    
                    <div>
                        <h4 className="font-bold border-b border-border-color pb-2 mb-4">Developer Recommendations</h4>
                        <ul className="space-y-2">
                            {recommendations.map((rec, i) => (
                                <li key={i} className="flex items-start gap-2 bg-bg-secondary p-3 rounded border border-primary/20">
                                    <span className="text-primary">🛠️</span>
                                    <span className="text-sm">{rec}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            <div className="panel">
                <h3 className="text-lg font-bold mb-4">Executive Summary</h3>
                <div className="prose prose-sm max-w-none text-text-primary" dangerouslySetInnerHTML={{ __html: rawSummary }} />
            </div>
        </div>
    );
};

export default SupervisorView;
