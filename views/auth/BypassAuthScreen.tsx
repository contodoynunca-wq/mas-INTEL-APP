import React, { useState, FC } from 'react';
import { useAppStore } from '../../store/store';

interface BypassAuthScreenProps {
    error: string;
}

const BypassAuthScreen: FC<BypassAuthScreenProps> = ({ error }) => {
    const { bypassWord, performBypassLogin, logEvent } = useAppStore.getState();
    const [inputWord, setInputWord] = useState('');
    const [authError, setAuthError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setAuthError('');

        if (!bypassWord) {
            setAuthError('No bypass word is configured or cached. Cannot proceed.');
            logEvent('ERR', 'Bypass attempt failed: No cached bypass word available.');
            setLoading(false);
            return;
        }

        // Simple delay to prevent brute-forcing
        await new Promise(resolve => setTimeout(resolve, 500));

        if (inputWord.trim() === bypassWord) {
            performBypassLogin();
            // The app will re-render to the main view, so no need to setLoading(false).
        } else {
            setAuthError('Incorrect bypass word.');
            logEvent('SYS', 'Bypass attempt failed: Incorrect word entered.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="auth-container text-center">
                <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" className="h-28 w-28 mx-auto mb-4"/>
                <h1 className="text-xl font-bold mb-2 text-loss-color">Authentication Service Unavailable</h1>
                <p className="text-sm text-text-secondary mb-4">The main login service is currently down. You can enter the emergency bypass word to access the application in offline mode with cached data.</p>
                <details className="text-xs text-text-secondary bg-surface p-2 rounded mb-4 text-left">
                    <summary className="cursor-pointer">Error Details</summary>
                    <pre className="whitespace-pre-wrap mt-1">{error}</pre>
                </details>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="password" placeholder="Emergency Bypass Word" value={inputWord} onChange={e => setInputWord(e.target.value)} required />
                    <button type="submit" className="btn secondary w-full justify-center" disabled={loading}>
                        {loading ? <span className='loader' /> : 'Bypass Login'}
                    </button>
                    {authError && <p className="text-loss-color text-sm h-4 mt-2">{authError}</p>}
                </form>
            </div>
        </div>
    );
};

export default BypassAuthScreen;