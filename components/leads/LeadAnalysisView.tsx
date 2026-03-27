
import React, { FC } from 'react';
import type { Lead } from '../../types';

interface LeadAnalysisViewProps {
    lead: Lead;
}

export const LeadAnalysisView: FC<LeadAnalysisViewProps> = ({ lead }) => {
  if (!lead || !lead.ai_analysis) {
    // If no analysis exists, we can return null or a placeholder.
    // Returning null keeps the UI clean until analysis is run.
    return null;
  }

  const { summary, materials, images } = lead.ai_analysis;

  return (
    <div className="p-4 bg-surface rounded-lg border border-border-color mb-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-4 border-b border-border-color pb-2">
        <span className="text-xl">🏗️</span>
        <h3 className="text-lg font-bold text-primary m-0 border-none">AI Plan Analysis</h3>
      </div>

      <div className="mb-4">
        <h4 className="text-sm font-bold text-text-secondary uppercase mb-2">Executive Summary</h4>
        <div className="p-3 bg-bg-secondary rounded text-sm text-text-primary border-l-4 border-primary">
          {summary || "No summary available."}
        </div>
      </div>

      {materials && materials.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-bold text-text-secondary uppercase mb-2">Detected Materials</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-bg-secondary text-xs uppercase text-text-secondary">
                <tr>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-left">Quantity/Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {materials.map((item, index) => (
                  <tr key={index}>
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2 text-text-secondary">{item.quantity || 'Specified'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {images && images.length > 0 && (
        <div>
            <h4 className="text-sm font-bold text-text-secondary uppercase mb-2">Extracted Visuals</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {images.map((img, idx) => (
                <div key={idx} className="group relative border border-border-color rounded overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <a href={img.url} target="_blank" rel="noreferrer" className="block aspect-video bg-black/5 relative overflow-hidden">
                        <img 
                        src={img.url} 
                        alt={img.label} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                    </a>
                    <div className="p-2 bg-surface text-xs font-medium truncate border-t border-border-color">
                        {img.label}
                    </div>
                </div>
            ))}
            </div>
        </div>
      )}
    </div>
  );
};
