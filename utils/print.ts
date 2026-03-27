
import type { LeadMarket } from '@/types';
import { FOOTER_TEXTS } from './translations';

export const printContent = (
    content: string, 
    title: string, 
    pageSize: string = 'A4',
    skipHeader: boolean = false,
    market: LeadMarket = 'UK',
    watermarkText?: string
) => {
    const printWindow = window.open('', '', 'height=800,width=1000');
    if (!printWindow) {
        alert("Could not open print window. Please disable your pop-up blocker.");
        return;
    }

    const printStyles = `
        :root { --font-main: 'Exo 2', sans-serif; }
        @page { 
            size: ${pageSize};
            margin: 1cm;
        }
        body {
            font-family: var(--font-main), sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: #ffffff !important;
            color: #2C3E50 !important;
            font-size: 10pt;
            position: relative;
        }
        .no-print { display: none !important; }
        a { color: #2980B9 !important; text-decoration: none; }
        
        .page-break { page-break-before: always; }
        .keep-together { page-break-inside: avoid; }
        .break-inside-auto { page-break-inside: auto; }
        
        h2 { font-size: 1.5em; border-bottom: 2px solid #2980B9; color: #2980B9; padding-bottom: 0.5rem; margin-bottom: 1rem; }
        h3 { font-size: 1.2em; color: #2c3e50; margin-top: 1.5rem; margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.2rem; }
        p { margin: 0.5rem 0; line-height: 1.5; }
        
        /* Grid for Contacts */
        .contacts-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin-top: 1rem;
        }
        .contact-card {
            background-color: #f8f9fa !important;
            border: 1px solid #e0e0e0 !important;
            padding: 0.8rem;
            border-radius: 6px;
            page-break-inside: avoid;
        }
        .contact-card h4 { margin: 0 0 0.5rem 0; font-size: 1.1em; color: #2980B9; }
        .contact-card p { margin: 0.2rem 0; font-size: 0.9em; }

        /* Map Image */
        .map-image {
            width: 100%;
            height: 250px;
            object-fit: cover;
            border: 1px solid #ccc;
            border-radius: 4px;
            margin: 1rem 0;
        }

        /* Strategy Box */
        .strategy-box {
            background-color: #f0f7fb !important;
            border: 1px solid #d0e3f0 !important;
            padding: 1.5rem;
            border-radius: 8px;
            white-space: pre-wrap;
        }

        .print-footer {
            margin-top: 2rem;
            text-align: center;
            font-size: 8pt;
            color: #888 !important;
            border-top: 1px solid #eee;
            padding-top: 1rem;
            padding-bottom: 1rem;
            background: #fff;
            page-break-inside: avoid;
        }

        /* Watermark Styles - Discrete Stamp */
        .watermark-overlay {
            position: fixed;
            bottom: 15mm;
            right: 0;
            font-size: 8pt;
            font-weight: 600;
            color: #a0a0a0;
            z-index: 9999;
            pointer-events: none;
            white-space: nowrap;
            text-transform: uppercase;
            text-align: right;
            user-select: none;
            border: 1px solid #e0e0e0;
            background-color: rgba(255, 255, 255, 0.9);
            padding: 4px 10px;
            border-radius: 4px 0 0 4px;
            border-right: none; /* Attached to side visually */
            box-shadow: -1px 1px 2px rgba(0,0,0,0.05);
            font-family: monospace;
            letter-spacing: 1px;
        }

        /* V53 STRICT LAYOUT COMPLIANCE */
        @media print {
            #dossier-overview {
                min-height: 95vh !important;
                height: auto !important;
                page-break-before: always !important;
                page-break-after: always !important;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            #strategy-section {
                min-height: 95vh !important;
                page-break-before: always !important;
                page-break-after: always !important;
            }
            /* CRITICAL: Hide interactive maps and UI elements in print view */
            .google-map-interactive, .buttons, .sidebar, .no-print {
                display: none !important;
            }
            /* Ensure images (like static maps) print correctly */
            img {
                max-width: 100% !important;
            }
            .watermark-overlay {
                display: block !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    `;

    const headerHtml = !skipHeader ? `
        <header style="display: flex; align-items: center; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #ccc; margin-bottom: 1rem; page-break-after: avoid;">
            <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" style="height: 50px; width: 50px; object-fit: contain;"/>
            <div>
                <h1 style="font-size: 1.6em; margin: 0; color: #2980B9;">Sales Intelligence Dossier</h1>
                <p style="margin: 0; color: #555; font-size: 0.9em;">${title} | ${new Date().toLocaleDateString()}</p>
            </div>
        </header>
    ` : '';

    const footerText = FOOTER_TEXTS[market] || FOOTER_TEXTS['UK'];
    const footerHtml = `
        <footer class="print-footer">
            ${footerText}
        </footer>
    `;

    const watermarkHtml = watermarkText ? `<div class="watermark-overlay">${watermarkText}</div>` : '';

    const printHTML = `
        <html>
            <head>
                <title>${title}</title>
                <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&display=swap" rel="stylesheet">
                <style>${printStyles}</style>
            </head>
            <body>
                ${watermarkHtml}
                ${headerHtml}
                <main>
                    ${content}
                </main>
                ${footerHtml}
            </body>
        </html>
    `;
    
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    printWindow.onload = function() {
        const images = printWindow.document.getElementsByTagName('img');
        const totalImages = images.length;
        let loadedImages = 0;

        const triggerPrint = () => {
             printWindow.focus();
             printWindow.print();
             // printWindow.close(); // Optional: Close after printing, but behavior varies
        };

        if (totalImages === 0) {
             setTimeout(triggerPrint, 500);
             return;
        }

        const onImageLoad = () => {
            loadedImages++;
            if (loadedImages === totalImages) {
                setTimeout(triggerPrint, 500); // Small buffer for rendering
            }
        };

        for (let i = 0; i < totalImages; i++) {
            if (images[i].complete) {
                onImageLoad();
            } else {
                images[i].onload = onImageLoad;
                images[i].onerror = onImageLoad; // Don't block if an image fails
            }
        }
        
        // Safety fallback in case image events hang
        setTimeout(triggerPrint, 4000);
    };
};
