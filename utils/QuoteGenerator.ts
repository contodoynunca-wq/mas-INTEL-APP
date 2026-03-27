
import type { Product, ProjectDetails, Accessory, TechnicalRule } from '@/types';
import { TECHNICAL_DATA } from '@/constants';

type LineItem = {
    name: string;
    quantity: number;
    unit: string;
    price: number;
    notes?: string;
};

interface SectionBreakdown {
    name: string;
    pitch: number;
    area: number;
    items: LineItem[];
    total: number;
}

export default class QuoteGenerator {
    product: Product;
    details: ProjectDetails;
    accessories: Accessory[];
    lineItems: LineItem[];
    sectionBreakdowns: SectionBreakdown[] = [];

    constructor(product: Product, price: number, details: ProjectDetails, accessories: Accessory[], lineItems: LineItem[] = []) {
        this.product = { ...product, sellPriceGBP: price };
        this.details = details;
        this.accessories = accessories;
        // Global items from user additions
        this.lineItems = lineItems;
        
        this.calculateAll();
    }

    private calculateAll() {
        // If we have detailed sections, calculate per section
        if (this.details.sections && this.details.sections.length > 0) {
            this.details.sections.forEach(section => {
                const items = this.calculateItemsForArea(section.area, section.pitch, section.name);
                const total = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
                this.sectionBreakdowns.push({
                    name: section.name,
                    pitch: section.pitch,
                    area: section.area,
                    items,
                    total
                });
            });
        } else {
            // Legacy / Single Section Mode
            const items = this.calculateItemsForArea(this.details.roofArea, this.details.roofPitch, "Main Roof");
            const total = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
            this.sectionBreakdowns.push({
                name: "Main Roof",
                pitch: this.details.roofPitch,
                area: this.details.roofArea,
                items,
                total
            });
        }
    }

    private calculateItemsForArea(area: number, pitch: number, sectionName: string): LineItem[] {
        const items: LineItem[] = [];
        
        // Determine technical rule based on this section's pitch and global exposure
        // Fallback to moderate if exposure is unknown
        const exposure = this.details.exposure || 'moderate';
        let rule = TECHNICAL_DATA[exposure];
        
        // Adjust headlap/gauge based on pitch if needed (Basic logic, can be expanded)
        // Using simplified lookup from TECHNICAL_DATA which usually has ranges
        // For more precise control, one might need the full ROOFING_STANDARDS logic here
        
        // Example override: steeper pitch might allow smaller headlap
        let effectiveHeadlap = rule.headlap;
        let effectiveGauge = rule.battenGauge;

        if (pitch > 45) {
             effectiveHeadlap = Math.max(75, effectiveHeadlap - 10); // Just an example logic
             // Recalculate gauge for slate size (assuming 500mm standard if not in product)
             // Gauge = (Length - Headlap) / 2
             // We need product length parsed from string "500x250" etc.
             const sizeParts = this.product.size.match(/(\d+)x(\d+)/);
             if (sizeParts) {
                 const length = parseInt(sizeParts[1]);
                 effectiveGauge = (length - effectiveHeadlap) / 2;
             }
        }

        // Main slate calculation
        const slatesAndHalves = this.product.slatesAndHalves || 500; // Default if missing
        // Slates per m2 formula: 1 / ((Gauge/1000) * ((Width+Gap)/1000)) 
        // Simplified estimate:
        const slatesPerM2 = 1000000 / (slatesAndHalves * effectiveGauge);
        const totalSlates = Math.ceil(area * slatesPerM2 * 1.05); // 5% wastage

        items.push({
            name: `${this.product.name} (${this.product.size}) - ${sectionName}`,
            quantity: totalSlates,
            unit: 'slates',
            price: this.product.sellPriceGBP,
            notes: `${slatesPerM2.toFixed(2)}/m² @ ${effectiveGauge}mm gauge (${effectiveHeadlap}mm lap)`
        });

        // Accessories per section
        this.accessories.filter(a => a.isDefault).forEach(acc => {
            const quantityNeeded = area / (acc.coverage || 1);
            if (quantityNeeded > 0) {
                items.push({
                    name: `${acc.name} (${sectionName})`,
                    quantity: Math.ceil(quantityNeeded),
                    unit: acc.unit,
                    price: acc.priceGBP
                });
            }
        });

        return items;
    }

    get totalCost(): number {
        const sectionsTotal = this.sectionBreakdowns.reduce((sum, s) => sum + s.total, 0);
        const extraItemsTotal = this.lineItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
        return sectionsTotal + extraItemsTotal;
    }

    format = (num: number) => num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    generateHTML(): string {
        const renderSection = (section: SectionBreakdown) => `
            <tr style="background-color: #e8f4fd; font-weight: bold; border-top: 2px solid #2980b9;">
                <td colspan="4" style="padding: 8px;">${section.name} (${section.area}m² @ ${section.pitch.toFixed(1)}°)</td>
            </tr>
            ${section.items.map(item => `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px;">
                        ${item.name}
                        ${item.notes ? `<br/><small style="color: #666;">${item.notes}</small>` : ''}
                    </td>
                    <td style="padding: 8px; text-align: right;">${item.quantity.toLocaleString()} ${item.unit}</td>
                    <td style="padding: 8px; text-align: right;">£${this.format(item.price)}</td>
                    <td style="padding: 8px; text-align: right;">£${this.format(item.quantity * item.price)}</td>
                </tr>
            `).join('')}
            <tr style="background-color: #f9f9f9; font-weight: bold;">
                <td colspan="3" style="padding: 8px; text-align: right;">Section Subtotal</td>
                <td style="padding: 8px; text-align: right;">£${this.format(section.total)}</td>
            </tr>
        `;

        const renderExtras = () => {
            if (this.lineItems.length === 0) return '';
            const total = this.lineItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
            return `
                <tr style="background-color: #f2f2f2; font-weight: bold; border-top: 2px solid #ddd;">
                    <td colspan="4" style="padding: 8px;">Additional Items</td>
                </tr>
                ${this.lineItems.map(item => `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px;">${item.name} ${item.notes ? `<br/><small>${item.notes}</small>` : ''}</td>
                        <td style="padding: 8px; text-align: right;">${item.quantity.toLocaleString()} ${item.unit}</td>
                        <td style="padding: 8px; text-align: right;">£${this.format(item.price)}</td>
                        <td style="padding: 8px; text-align: right;">£${this.format(item.quantity * item.price)}</td>
                    </tr>
                `).join('')}
                <tr style="background-color: #f9f9f9; font-weight: bold;">
                    <td colspan="3" style="padding: 8px; text-align: right;">Extras Subtotal</td>
                    <td style="padding: 8px; text-align: right;">£${this.format(total)}</td>
                </tr>
            `;
        };
        
        // Nano Banana Image Injection
        const visualImageHtml = this.details.visualImage ? `
            <div style="margin-bottom: 20px; border: 1px solid #ddd; padding: 10px; border-radius: 8px; text-align: center;">
                <h3 style="margin-top: 0; color: #2980b9; font-size: 16px; margin-bottom: 10px;">Visual Summary (3D Concept)</h3>
                <img src="${this.details.visualImage}" style="max-width: 100%; max-height: 300px; object-fit: contain; border-radius: 4px;" alt="AI Visual Summary" />
            </div>
        ` : '';
    
        return `
            <div style="font-family: 'Exo 2', sans-serif; color: #333; background-color: #fff; padding: 30px; border-radius: 8px;">
                <header style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #2980b9; padding-bottom: 15px; margin-bottom: 20px;">
                    <div>
                        <h1 style="font-size: 28px; margin: 0; color: #2980b9;">Quotation</h1>
                        <p style="margin: 5px 0 0 0; color: #555;">For: ${this.product.name}</p>
                    </div>
                    <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" style="height: 60px; width: 60px; object-fit: contain;"/>
                </header>
    
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                    <div>
                        <h2 style="font-size: 14px; color: #555; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px;">Project Details</h2>
                        <p style="margin: 2px 0;"><strong>Customer:</strong> ${this.details.customerName}</p>
                        <p style="margin: 2px 0;"><strong>Location:</strong> ${this.details.siteLocation}</p>
                        <p style="margin: 2px 0;"><strong>Exposure:</strong> ${this.details.exposure}</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="font-size: 14px; color: #555; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px;">Quote Summary</h2>
                        <p style="margin: 10px 0 0 0; font-size: 16px; color: #555;">Grand Total</p>
                        <p style="margin: 0; font-size: 40px; font-weight: bold; color: #2980b9;">£${this.format(this.totalCost)}</p>
                    </div>
                </div>
                
                ${visualImageHtml}
    
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #f2f2f2; color: #333;">
                            <th style="padding: 10px; text-align: left;">Description</th>
                            <th style="padding: 10px; text-align: right;">Quantity</th>
                            <th style="padding: 10px; text-align: right;">Unit Price</th>
                            <th style="padding: 10px; text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.sectionBreakdowns.map(renderSection).join('')}
                        ${renderExtras()}
                    </tbody>
                    <tfoot>
                        <tr style="border-top: 2px solid #333;">
                            <td colspan="3" style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 18px;">Grand Total</td>
                            <td style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 18px; color: #2980b9;">£${this.format(this.totalCost)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }
}


export const calculateQuoteForProduct = (
    product: Product,
    price: number,
    details: ProjectDetails,
    accessories: Accessory[],
    lineItems?: LineItem[]
): QuoteGenerator | null => {
    if (!product || !details) return null;
    return new QuoteGenerator(product, price, details, accessories, lineItems);
};
