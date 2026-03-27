import React, { FC, useState } from 'react';

interface AutomationStationProps {
    onAutomate: (command: string) => void;
}

const AutomationStation: FC<AutomationStationProps> = ({ onAutomate }) => {
    const [command, setCommand] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!command.trim() || isLoading) return;
        setIsLoading(true);
        onAutomate(command);
    };
    
    return (
        <>
            <form onSubmit={handleSubmit}>
                <textarea
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="e.g., Find 10 perfect leads in Bristol..."
                    rows={4}
                    className="w-full"
                    disabled={isLoading}
                />
                <button type="submit" className="btn green w-full mt-4" disabled={isLoading || !command.trim()}>
                    {isLoading ? <span className="loader"/> : 'Automate'}
                </button>
            </form>
        </>
    );
};

export default AutomationStation;