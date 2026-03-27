import React, { FC } from 'react';
import { RoofingEstimator } from '@/src/components/tools/roofing-estimator/RoofingEstimator';

const RoofingEstimatorView: FC = () => {
    return (
        <div className="h-full flex flex-col bg-bg-primary overflow-hidden">
            <div className="p-4 border-b border-border-color bg-surface flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-text-primary">3D Roofing Estimator</h2>
                    <p className="text-sm text-text-secondary">Design, visualize, and estimate roofing projects in real-time.</p>
                </div>
            </div>
            <div className="flex-grow p-4 overflow-auto">
                <RoofingEstimator />
            </div>
        </div>
    );
};

export default RoofingEstimatorView;
