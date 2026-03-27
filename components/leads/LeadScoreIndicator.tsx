import React, { FC, useState, useRef, useCallback } from 'react';
import type { Lead } from '@/types';
import { getScoreBreakdown, ScoreBreakdown } from '@/utils/leadScoring';

interface LeadScoreIndicatorProps {
    score?: number;
    lead: Lead; // Pass the full lead to get the breakdown
}

const getScoreTier = (score: number): { grade: string; color: string } => {
    if (score >= 95) return { grade: 'A+', color: '#2ECC71' }; // Emerald
    if (score >= 85) return { grade: 'A', color: 'var(--profit-color)' };
    if (score >= 75) return { grade: 'B+', color: '#f1c40f' }; // Sunflower
    if (score >= 60) return { grade: 'B', color: '#e67e22' }; // Carror
    if (score >= 40) return { grade: 'C', color: '#d35400' }; // Pumpkin
    return { grade: 'D', color: 'var(--loss-color)' };
};

const LeadScoreIndicator: FC<LeadScoreIndicatorProps> = ({ score, lead }) => {
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({ opacity: 0, pointerEvents: 'none' });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = useCallback(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const tooltipWidth = 256; // w-64
            const tooltipHeight = 200; // Approximate height of the tooltip
            const margin = 8;

            let top = rect.top - tooltipHeight - margin;
            if (top < margin) { // If it goes off the top of the screen
                top = rect.bottom + margin;
            }

            let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            if (left < margin) { // If it goes off the left
                left = margin;
            } else if (left + tooltipWidth > window.innerWidth - margin) { // If it goes off the right
                left = window.innerWidth - tooltipWidth - margin;
            }

            setTooltipStyle({
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                opacity: 1,
                pointerEvents: 'auto',
                transition: 'opacity 0.2s',
                zIndex: 100
            });
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        setTooltipStyle(prev => ({ ...prev, opacity: 0, pointerEvents: 'none' }));
    }, []);

    if (score === undefined || score === null) return null;

    const { grade, color } = getScoreTier(score);
    const circumference = 2 * Math.PI * 18;
    const offset = circumference - (score / 100) * circumference;
    const breakdown = getScoreBreakdown(lead);

    return (
        <div 
            ref={containerRef}
            className="relative h-10 w-10" 
            title={`Lead Score: ${score}/100`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <svg className="h-full w-full" viewBox="0 0 40 40">
                <circle
                    className="text-surface"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="currentColor"
                    r="18"
                    cx="20"
                    cy="20"
                />
                <circle
                    style={{ stroke: color, strokeDasharray: circumference, strokeDashoffset: offset }}
                    strokeWidth="4"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="18"
                    cx="20"
                    cy="20"
                    className="transform -rotate-90 origin-center transition-all duration-500"
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>
                {grade}
            </span>
            {/* Tooltip */}
            <div 
                style={{ ...tooltipStyle, backgroundColor: 'var(--bg-secondary)' }}
                className="w-64 p-3 rounded-lg shadow-2xl border border-border-color"
            >
                 <h4 className="font-bold text-sm text-text-primary border-b border-border-color pb-1 mb-2">4-Pillar Score Breakdown</h4>
                {breakdown.map((item: ScoreBreakdown) => (
                    <div key={item.label} className="text-xs">
                        <div className="flex justify-between">
                            <span className="text-text-secondary">{item.label}</span>
                            <span className="font-bold text-text-primary">{item.score} / {item.maxPoints}</span>
                        </div>
                        {item.details && <p className="text-right text-text-secondary italic -mt-1">{item.details}</p>}
                    </div>
                ))}
                <div className="border-t border-border-color mt-2 pt-1 flex justify-between">
                    <span className="font-bold text-text-primary">Total Score</span>
                    <span className="font-bold text-lg" style={{color}}>{score}</span>
                </div>
            </div>
        </div>
    );
};

export default LeadScoreIndicator;