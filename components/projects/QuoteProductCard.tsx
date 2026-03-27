import React, { FC, useState } from 'react';
import type { Product, ProjectDetails, Accessory } from '../../types';
import { calculateQuoteForProduct } from '../../utils/QuoteGenerator';

interface QuoteProductCardProps {
    product: Product;
    details: ProjectDetails;
    accessories: Accessory[];
    onSelect: (product: Product) => void;
    onGenerateQuote: (price: number) => void;
}

const QuoteProductCard: FC<QuoteProductCardProps> = ({ product, details, accessories, onSelect, onGenerateQuote }) => {
    const [price, setPrice] = useState(product.sellPriceGBP);
    
    const quote = calculateQuoteForProduct(product, price, details, accessories);
    const hasValidDetails = details.roofArea > 0;
    
    return (
        <div className="product-card">
            <img src={product.imageUrl} alt={product.name} onClick={() => onSelect(product)} className="cursor-pointer" />
            <div className="product-card-content">
                <h4>{product.name} ({product.size})</h4>
                <p className="product-card-description">{product.description}</p>
                <div className="form-group mt-auto">
                    <label>Selling Price (£ per slate)</label>
                    <input
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                        step="0.01"
                    />
                </div>
                <div className="mt-4 flex justify-between items-center">
                    <div>
                        <span className="text-text-secondary">Total Quote:</span>
                        <div className="text-xl font-bold text-primary">
                            {hasValidDetails && quote ? `£${quote.totalCost.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </div>
                    </div>
                    <button onClick={() => onGenerateQuote(price)} className="btn" disabled={!quote || !hasValidDetails}>Generate Quote</button>
                </div>
            </div>
        </div>
    );
};

export default QuoteProductCard;