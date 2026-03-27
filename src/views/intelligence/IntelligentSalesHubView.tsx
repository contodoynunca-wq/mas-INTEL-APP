import React from 'react';

const IntelligentSalesHubView: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full bg-bg-primary text-text-primary">
            <h1 className="text-2xl font-bold mb-4">Legacy Sales Hub</h1>
            <p className="text-text-secondary">This is the legacy Sales Intelligence Hub view.</p>
            <p className="text-text-secondary mt-2">Please use the new <strong>Sales Intel Center</strong> for the latest features.</p>
        </div>
    );
};

export default IntelligentSalesHubView;
