
import React, { FC, useState, useRef } from 'react';
import type { Customer, Project, ModalState } from '../../types';
import QuoteGenerator from '../../utils/QuoteGenerator';
import { generateSvg, generateText } from '../../services/ai/genericService';
import EmailDraftModal from '../common/EmailDraftModal';
import { printContent } from '../../utils/print';

interface QuoteModalProps {
    quote: QuoteGenerator;
    customer: Customer | null;
    existingProject?: Project;
    onClose: () => void;
    onSave: (d: any) => Promise<void>;
    showModal: (c: Omit<ModalState, 'onResolve'>) => Promise<any>;
}

const QuoteModal: FC<QuoteModalProps> = ({ quote, customer, existingProject, onClose, onSave, showModal }) => {
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [diagram, setDiagram] = useState<string | null>(null);
    const [aiStrategy, setAiStrategy] = useState<string | null>(null);
    const [quoteNotes, setQuoteNotes] = useState('');
    const modalBodyRef = useRef<HTMLDivElement>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [emailDraft, setEmailDraft] = useState({ isOpen: false, text: '', subject: '', to: '' });

    const handleReDraftEmail = async () => {
        setIsLoading('email');
        try {
            const customerName = customer?.contactName || quote.details.customerName || "[Customer Name]";
            const prompt = `Draft a professional follow-up email to ${customerName} for an attached quote. Product: ${quote.product.name}, Total Cost: £${quote.format(quote.totalCost)}. Start with "Dear ${customerName},". Keep it concise and friendly, highlighting one key benefit of the slate, and end by inviting them to reply with any questions.`;
            const body = await generateText(prompt);
            setEmailDraft(prev => ({ ...prev, text: body }));
        } catch(error) {
             await showModal({type: 'alert', title: 'AI Error', message: 'The AI request failed.'});
        } finally {
            setIsLoading(null);
        }
    };

    const handleAiFeature = async (feature: 'diagram' | 'tips' | 'email') => {
        setIsLoading(feature);
        try {
            if(feature === 'diagram') {
                 const prompt = `Draw a diagram for a roof with these specs: Area: ${quote.details.roofArea}m², Pitch: ${quote.details.roofPitch}°, Rafter Length: ${quote.details.rafterLength}m, Eaves Length: ${quote.details.eavesLength}m, Exposure: ${quote.details.exposure}.`;
                 const svg = await generateSvg(prompt); setDiagram(svg);
            } else if(feature === 'tips') {
                const prompt = `You are an expert sales strategist for Mont Azul, a premium roofing slate company. Generate highly-tailored sales tips for the following scenario:

                - **Customer Profile:** A ${quote.details.customerType}.
                - **Product:** ${quote.product.name} (${quote.product.size}, ${quote.product.thickness}mm thick).
                - **Project Location:** ${quote.details.siteLocation}.
                - **Project Size:** ${quote.details.roofArea}m² roof.

                Your advice must be clever and specific. Provide 3 distinct tips in bullet points formatted with markdown (e.g., **Tip 1:** ...):
                1.  **Tailored to Customer Type:** Provide a tip specifically for engaging a ${quote.details.customerType}. For an Architect, focus on aesthetic flexibility, technical specifications, and historical precedent. For a Roofer, focus on ease of installation, grading consistency, and durability which reduces callbacks. For a Builder, emphasize value, warranty, and supply chain reliability. For a Homeowner, focus on curb appeal, longevity, and investment value.
                2.  **Product Differentiation:** Explain why *this specific slate* (${quote.product.name}) is a better choice than a common alternative (e.g., a cheaper slate or a different material like concrete tiles). Mention its unique selling points.
                3.  **Location-Specific Insight:** Based on the location (${quote.details.siteLocation}), mention any relevant architectural styles, weather patterns (e.g., severe exposure areas), or local building preferences that make this slate an ideal choice.

                The tone should be professional, confident, and persuasive.`;
                const text = await generateText(prompt); setAiStrategy(text);
            } else if(feature === 'email') {
                const customerName = customer?.contactName || quote.details.customerName || "[Customer Name]";
                const prompt = `Draft a professional follow-up email to ${customerName} for an attached quote. Product: ${quote.product.name}, Total Cost: £${quote.format(quote.totalCost)}. Start with "Dear ${customerName},". Keep it concise and friendly, highlighting one key benefit of the slate, and end by inviting them to reply with any questions.`;
                const body = await generateText(prompt);
                const subject = `Quote for ${quote.product.name}`;
                setEmailDraft({ isOpen: true, text: body, subject: subject, to: customer?.email || '' });
            }
        } catch (error) {
            await showModal({type: 'alert', title: 'AI Error', message: 'The AI request failed.'});
        } finally { 
            setIsLoading(null);
            if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
        }
    };
    
    const handleSaveClick = async () => {
        setIsSaving(true);
        let projectName = existingProject?.name;
        if (!projectName) {
            projectName = await showModal({type: 'prompt', title: "Save Project", message: "Enter a name for this new project:"});
        }
        
        if (projectName) {
            await onSave({ diagram, strategy: aiStrategy, notes: quoteNotes, projectName });
        }
        setIsSaving(false);
    };

    const handlePrint = async () => {
        const recipient = await showModal({ type: 'prompt', title: 'Recipient Name', message: 'Enter the name of the recipient for the security watermark (e.g. Jewson):' });
        let watermarkText: string | undefined = undefined;
        if (recipient && typeof recipient === 'string' && recipient.trim()) {
            const dateStr = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            watermarkText = `Licensed to ${recipient.trim()} - ${dateStr}`;
        }

        const quoteHTML = quote.generateHTML();
        const notesHTML = quoteNotes ? `<h4>Notes</h4><p style="white-space: pre-wrap; border: 1px solid #eee; padding: 10px; border-radius: 5px;">${quoteNotes}</p>` : '';
        const diagramHTML = diagram ? `<div><h4>Technical Diagram</h4>${diagram}</div>` : '';
        const strategyHTML = aiStrategy ? `<h4>Sales Strategy</h4><pre style="white-space: pre-wrap; font-family: inherit; background-color: #f8f8f8; padding: 10px; border-radius: 5px;">${aiStrategy}</pre>` : '';

        printContent(`${quoteHTML}<br/>${notesHTML}<br/>${strategyHTML}<br/>${diagramHTML}`, `Quote for ${quote.details.customerName || 'Project'}`, 'A4', false, 'UK', watermarkText);
    };
    
    return (
         <div className="modal">
            {emailDraft.isOpen && <EmailDraftModal 
                initialDraft={emailDraft}
                onClose={() => setEmailDraft({ isOpen: false, text: '', subject: '', to: '' })}
                onReDraft={handleReDraftEmail}
                isLoading={isLoading === 'email'}
            />}
            <div className="modal-content" style={{ maxWidth: '90vw', width: '1200px', height: '90vh' }}>
                <div className="modal-header">
                    <h2>Quote Preview & Tools</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', overflow: 'hidden', padding: '1rem' }}>
                    {/* Left Column: Quote Preview */}
                    <div className="bg-surface rounded-lg overflow-y-auto" ref={modalBodyRef}>
                        <div id="quote-output-content" dangerouslySetInnerHTML={{ __html: quote.generateHTML() }} />
                    </div>

                    {/* Right Column: Tools */}
                    <div className="flex flex-col gap-4 overflow-y-auto pr-2">
                        {/* Notes Section */}
                        <div className="panel p-4">
                            <h4 className="mt-0 font-semibold">Quote Notes</h4>
                            <textarea value={quoteNotes} onChange={e => setQuoteNotes(e.target.value)} rows={4} className="w-full text-sm" placeholder="Add internal notes for this quote..."></textarea>
                        </div>

                        {/* AI Tools Section */}
                        <div className="panel p-4">
                            <h4 className="mt-0 font-semibold">AI Toolkit</h4>
                            
                            {/* Diagram Tool */}
                            <div className="bg-bg-secondary p-3 rounded-lg border border-border-color mb-3">
                                <div className="flex justify-between items-center">
                                    <h5 className="font-semibold text-sm">Technical Diagram</h5>
                                    <button className='btn sm' onClick={() => handleAiFeature('diagram')} disabled={!!isLoading || !!diagram}>
                                        {isLoading === 'diagram' ? <span className='loader' /> : (diagram ? 'Generated' : 'Generate')}
                                    </button>
                                </div>
                                {isLoading === 'diagram' && <div className="flex justify-center p-4"><div className="loader"/></div>}
                                {diagram && <div id="roof-diagram-image" className="mt-2 pt-2 border-t border-border-color" dangerouslySetInnerHTML={{__html: diagram}} />}
                            </div>
                            
                            {/* Strategy Tool */}
                            <div className="bg-bg-secondary p-3 rounded-lg border border-border-color">
                                <div className="flex justify-between items-center">
                                    <h5 className="font-semibold text-sm">AI Sales Strategy</h5>
                                    <button className='btn sm' onClick={() => handleAiFeature('tips')} disabled={!!isLoading || !!aiStrategy}>
                                        {isLoading === 'tips' ? <span className='loader' /> : (aiStrategy ? 'Generated' : 'Generate')}
                                    </button>
                                </div>
                                {isLoading === 'tips' && <div className="flex justify-center p-4"><div className="loader"/></div>}
                                {aiStrategy && <div className="mt-2 pt-2 border-t border-border-color whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: aiStrategy.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="modal-footer no-print">
                    <button className='btn secondary' onClick={onClose}>Close</button>
                    <div className="flex-grow"></div>
                    <button className='btn' onClick={() => handleAiFeature('email')} disabled={!!isLoading}>Draft Follow-up Email</button>
                    <button className='btn' onClick={handlePrint}>Print Quote</button>
                    <button className='btn green' onClick={handleSaveClick} disabled={isSaving}>
                        {isSaving ? <span className='loader' /> : (existingProject ? 'Save New Version' : 'Save as New Project')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuoteModal;
