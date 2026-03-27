
import React, { FC, useMemo } from 'react';
import type { Quote } from '../../types';
import { safeTimestampToDate } from '../../utils/firestoreUtils';

interface QuoteComparisonModalProps {
    quotes: Quote[];
    onClose: () => void;
    onSelectQuote: (quote: Quote) => void;
}

const QuoteComparisonModal: FC<QuoteComparisonModalProps> = ({ quotes, onClose, onSelectQuote }) => {

    // Sorting quotes from newest to oldest using safe timestamp conversion
    const sortedQuotes = useMemo(() => 
        [...quotes].sort((a, b) => (safeTimestampToDate(b.createdAt)?.getTime() ?? 0) - (safeTimestampToDate(a.createdAt)?.getTime() ?? 0)), 
        [quotes]
    );

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Compare Quote Versions</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body" style={{ display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1.5rem' }}>
                    {sortedQuotes.map((quote, index) => (
                        <div key={quote.id} className="panel flex-shrink-0" style={{ width: '450px', display: 'flex', flexDirection: 'column' }}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="m-0 p-0 border-none">Version {sortedQuotes.length - index}</h4>
                                    <p className="text-xs text-text-secondary">{safeTimestampToDate(quote.createdAt)?.toLocaleString() ?? 'N/A'}</p>
                                </div>
                                <button className="btn sm" onClick={() => onSelectQuote(quote)}>Select this Version</button>
                            </div>
                            <div className="flex-grow overflow-y-auto" dangerouslySetInnerHTML={{ __html: quote.quoteHTML }} />
                        </div>
                    ))}
                    {sortedQuotes.length === 0 && <p>No quotes available to compare.</p>}
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default QuoteComparisonModal;