
import React, { FC } from 'react';
import type { Lead } from '../../types';

interface LeadAnalysisViewProps {
    lead: Lead;
}

export const LeadAnalysisView: FC<LeadAnalysisViewProps> = ({ lead }) => {
  if (!lead || !lead.ai_analysis) {
    return (
      <div className="p-4 bg-bg-secondary rounded border border-border-color my-4">
        <p className="text-text-secondary">Waiting for AI Analysis...</p>
      </div>
    );
  }

  const { summary, materials, images } = lead.ai_analysis;

  return (
    <div className="panel my-4 bg-surface shadow-sm rounded-lg p-6 border border-border-color">
      <h2 className="text-xl font-bold mb-4 text-primary">🏗️ AI Plan Analysis</h2>

      <div className="mb-6">
        <h3 className="font-semibold text-text-primary mb-2">Project Summary</h3>
        <p className="text-text-secondary bg-primary/10 p-3 rounded border-l-4 border-primary">
          {summary || "No summary available."}
        </p>
      </div>

      <div className="mb-6">
        <h3 className="font-semibold text-text-primary mb-2">📦 Detected Materials</h3>
        {materials && materials.length > 0 ? (
          <div className="overflow-x-auto rounded border border-border-color">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-bg-secondary text-text-secondary uppercase text-xs">
                <tr>
                  <th className="px-4 py-2 font-semibold">Item</th>
                  <th className="px-4 py-2 font-semibold">Estimated Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color bg-surface">
                {materials.map((item, index) => (
                  <tr key={index} className="hover:bg-bg-secondary transition-colors">
                    <td className="px-4 py-2 font-medium text-text-primary">{item.name}</td>
                    <td className="px-4 py-2 text-text-secondary">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-secondary italic">No specific materials identified yet.</p>
        )}
      </div>

      {images && images.length > 0 && (
        <div>
            <h3 className="font-semibold text-text-primary mb-2">📸 Blueprint Evidence</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {images.map((img, idx) => (
                <div key={idx} className="relative group rounded border border-border-color overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <a href={img.url} target="_blank" rel="noreferrer" className="block relative">
                    <img 
                    src={img.url} 
                    alt={img.label} 
                    className="h-32 w-full object-cover group-hover:opacity-90 transition-opacity"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </a>
                <span className="absolute bottom-0 left-0 bg-black/70 text-white text-[10px] p-1 w-full truncate font-medium">
                    {img.label}
                </span>
                </div>
            ))}
            </div>
        </div>
      )}
    </div>
  );
};
