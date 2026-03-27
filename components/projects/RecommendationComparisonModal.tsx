// Refactored by Janitor 2.0 for performance and clarity
import React, { FC, useMemo } from 'react';
import type { Product, ProjectDetails, Accessory, TechnicalRule } from '../../types';
import QuoteGenerator, { calculateQuoteForProduct } from '../../utils/QuoteGenerator';
import { TECHNICAL_DATA } from '../../constants';

type LineItem = { name: string; quantity: number; unit: string; price: number, notes?: string };

interface RecommendationComparisonModalProps {
    products: Product[];
    details: ProjectDetails;
    accessories: Accessory[];
    onClose: () => void;
    lineItems?: LineItem[];
}

const RecommendationComparisonModal: FC<RecommendationComparisonModalProps> = ({ products, details, accessories, onClose, lineItems }) => {
    const quotes = useMemo(() => {
        return products
            .map(p => calculateQuoteForProduct(p, p.sellPriceGBP, details, accessories, lineItems))
            .filter((q): q is QuoteGenerator => q !== null)
            .sort((a, b) => a.totalCost - b.totalCost);
    }, [products, details, accessories, lineItems]);

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Recommendation Comparison</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body" style={{ display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1.5rem' }}>
                    {quotes.map((quote, index) => (
                        <div key={quote.product.id} className="p-4 bg-bg-light rounded-lg flex-shrink-0 relative" style={{ width: '450px', border: index === 0 ? '2px solid var(--accent-primary)' : 'none' }}>
                            {index === 0 && <div className="absolute top-0 right-2 bg-accent-primary text-bg-base px-2 py-1 text-xs font-bold rounded-b-lg">BEST VALUE</div>}
                            <div dangerouslySetInnerHTML={{ __html: quote.generateHTML() }} />
                        </div>
                    ))}
                    {quotes.length === 0 && <p>No comparable quotes could be generated for the given project details.</p>}
                </div>
                <div className="modal-footer">
                    <button className="st-button" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default RecommendationComparisonModal;