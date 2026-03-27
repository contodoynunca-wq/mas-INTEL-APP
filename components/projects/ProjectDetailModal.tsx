


// Refactored by Janitor 3.0 for performance and safety
import React, { FC, useState, useMemo } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { Project, Quote } from '../../types';
import QuoteComparisonModal from './QuoteComparisonModal';
import { printContent } from '../../utils/print';
import { useAppStore } from '../../store/store';
import { getDb, getAuth } from '@/services/firebase';
import { safeTimestampToDate } from '../../utils/firestoreUtils';

interface ProjectDetailModalProps {
    project: Project;
    onClose: () => void;
}

const ProjectDetailModal: FC<ProjectDetailModalProps> = ({ project, onClose }) => {
    // Performance Optimization: Use granular selectors
    const customerDirectory = useAppStore(state => state.customerDirectory);
    const { showModal, handleNavigationRequest } = useAppStore.getState(); // Actions are stable

    const customer = customerDirectory.find(c => c.id === project.customerId);

    const sortedQuotes = useMemo(() => 
        [...project.quotes].sort((a, b) => (safeTimestampToDate(b.createdAt)?.getTime() ?? 0) - (safeTimestampToDate(a.createdAt)?.getTime() ?? 0)), 
        [project.quotes]
    );

    const activeQuoteId = useState<string | null>(sortedQuotes.length > 0 ? sortedQuotes[0].id : null)[0];
    const setActiveQuoteId = useState<string | null>(sortedQuotes.length > 0 ? sortedQuotes[0].id : null)[1];
    const activeQuote = useMemo(() => project.quotes.find(q => q.id === activeQuoteId), [project.quotes, activeQuoteId]);
    
    const [isComparing, setIsComparing] = useState(false);
    const [updatingStatusTo, setUpdatingStatusTo] = useState<Project['status'] | null>(null);
    const [newNoteText, setNewNoteText] = useState('');
    
    const handleUpdateStatus = async (status: Project['status']) => {
        const db = getDb();
        if (project.status === status || updatingStatusTo) return;
        setUpdatingStatusTo(status);
        try {
            await db.collection("projects").doc(project.id).update({ status });
        } catch (error) {
            await showModal({type: 'alert', title: 'Update Error', message: 'Failed to update project status.'});
        } finally {
            setUpdatingStatusTo(null);
        }
    };

    const handleAddNote = async () => { 
        const db = getDb();
        const auth = getAuth();
        if(!auth?.currentUser || !newNoteText.trim()) return; 
        const newNote = { text: newNoteText.trim(), author: auth.currentUser?.email || 'Unknown', date: new Date().toLocaleDateString() };
        await db.collection("projects").doc(project.id).update({ notes: firebase.firestore.FieldValue.arrayUnion(newNote) });
        setNewNoteText('');
    };

    const handlePrintQuote = async () => {
        if (!activeQuote) {
            showModal({type: 'alert', title: 'No Quote Selected', message: 'Please select a quote version to print.'});
            return;
        }
        
        const recipient = await showModal({ type: 'prompt', title: 'Recipient Name', message: 'Enter the name of the recipient for the security watermark (e.g. Jewson):' });
        let watermarkText: string | undefined = undefined;
        if (recipient && typeof recipient === 'string' && recipient.trim()) {
            const dateStr = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            watermarkText = `Licensed to ${recipient.trim()} - ${dateStr}`;
        }
        
        const quoteHTML = activeQuote.quoteHTML || '<p>Quote details not available.</p>';
        const notesHTML = activeQuote.quoteNotes ? `<h4>Notes</h4><p style="white-space: pre-wrap; border: 1px solid #eee; padding: 10px; border-radius: 5px;">${activeQuote.quoteNotes}</p>` : '';
        const diagramHTML = activeQuote.diagramSVG ? `<div><h4>Technical Diagram</h4>${activeQuote.diagramSVG}</div>` : '';
        const strategyHTML = activeQuote.aiSalesStrategy ? `<h4>Sales Strategy</h4><pre style="white-space: pre-wrap; font-family: inherit; background-color: #f8f8f8; padding: 10px; border-radius: 5px;">${activeQuote.aiSalesStrategy}</pre>` : '';

        printContent(
            `${quoteHTML}<br/>${notesHTML}<br/>${strategyHTML}<br/>${diagramHTML}`, 
            `Quote for ${project.name}`,
            'A4',
            false,
            'UK',
            watermarkText
        );
    };
    
    const customerDisplay = customer?.company || customer?.contactName || project.customerName || 'N/A';

    return (
        <div className="modal">
            {isComparing && <QuoteComparisonModal quotes={project.quotes} onClose={() => setIsComparing(false)} onSelectQuote={(q) => { setActiveQuoteId(q.id); setIsComparing(false); }} />}
            <div className="modal-content" style={{ maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <div className="flex-grow">
                        <h2>{project.name}</h2>
                        <p className="text-sm text-secondary">{customerDisplay}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {(['Quoted', 'Won', 'Lost'] as const).map(status => (
                            <button key={status} onClick={() => handleUpdateStatus(status)} disabled={!!updatingStatusTo} className={`px-2 py-1 text-xs rounded-md transition-colors ${project.status === status ? (status === 'Won' ? 'bg-[var(--profit-bg)] text-[var(--profit-color)]' : status === 'Lost' ? 'bg-[var(--loss-bg)] text-[var(--loss-color)]' : 'bg-[var(--secondary)]/20 text-[var(--secondary)]') : 'bg-surface'}`}>
                                {updatingStatusTo === status ? '...' : status}
                            </button>
                        ))}
                         <button onClick={handlePrintQuote} className="btn tertiary sm" title="Print Active Quote">
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v3a2 2 0 002 2h6a2 2 0 002-2v-3h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm3 0h4v3H8V4zm6 8H6v4h8v-4z" clipRule="evenodd"></path></svg>
                        </button>
                    </div>
                    <button onClick={onClose}>×</button>
                </div>
                 <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', flexGrow: 1, overflow: 'hidden', padding: '1rem' }}>
                    {/* Left Column: Quote Details */}
                    <div className="bg-surface rounded-lg overflow-y-auto p-4">
                        {activeQuote ? (
                            <>
                                <div dangerouslySetInnerHTML={{ __html: activeQuote.quoteHTML }} />
                                {activeQuote.diagramSVG && (
                                    <div className="mt-6 pt-4 border-t border-border-color">
                                        <h4 className="mb-2">Technical Diagram</h4>
                                        <div className="p-4 bg-bg-secondary rounded" dangerouslySetInnerHTML={{ __html: activeQuote.diagramSVG }} />
                                    </div>
                                )}
                                {activeQuote.aiSalesStrategy && (
                                    <div className="mt-6 pt-4 border-t border-border-color">
                                        <h4 className="mb-2">AI Sales Strategy</h4>
                                        <div className="p-4 bg-bg-secondary rounded whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: activeQuote.aiSalesStrategy.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                    </div>
                                )}
                                {activeQuote.quoteNotes && (
                                    <div className="mt-6 pt-4 border-t border-border-color">
                                        <h4 className="mb-2">Quote Notes</h4>
                                        <p className="p-4 bg-bg-secondary rounded whitespace-pre-wrap text-sm">{activeQuote.quoteNotes}</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-secondary">Select a quote version to view its details.</div>
                        )}
                    </div>

                    {/* Right Column: Project Info, Quotes, Notes */}
                    <div className="flex flex-col gap-6 overflow-y-auto pr-2">
                        {/* Quote Versions */}
                        <div className="panel p-4">
                            <h4 className="m-0 border-none">Quote Versions</h4>
                            <div className="space-y-2 mt-4 max-h-48 overflow-y-auto">
                                {sortedQuotes.map((q, i) => (
                                    <div key={q.id} onClick={() => setActiveQuoteId(q.id)} className={`p-3 rounded-lg cursor-pointer transition-colors ${activeQuoteId === q.id ? 'bg-primary text-bg-secondary' : 'bg-surface hover:bg-bg-primary'}`}>
                                        <p className="font-semibold">Version {project.quotes.length - i}: {q.product.name}</p>
                                        <p className="text-xs opacity-80">{safeTimestampToDate(q.createdAt)?.toLocaleString() ?? 'N/A'}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-4">
                                <button onClick={() => setIsComparing(true)} className="btn tertiary w-full" disabled={project.quotes.length < 2}>Compare</button>
                                <button onClick={() => handleNavigationRequest('new-quote', { existingProject: project })} className="btn w-full">New Quote</button>
                            </div>
                        </div>

                        {/* Project Notes */}
                        <div className="panel p-4">
                            <h4 className="m-0 border-none">Project Notes</h4>
                            <div className="space-y-2 mt-4 mb-4 max-h-48 overflow-y-auto">
                                {project.notes.length === 0 ? <p className="text-xs text-secondary">No notes yet.</p> :
                                    [...project.notes].reverse().map((note, i) => (
                                        <div key={i} className="p-2 bg-surface rounded text-xs">
                                            <p className="whitespace-pre-wrap">{note.text}</p>
                                            <p className="text-right opacity-70 mt-1">- {note.author} on {note.date}</p>
                                        </div>
                                    ))
                                }
                            </div>
                            <div className="flex gap-2">
                                <input type="text" value={newNoteText} onChange={e => setNewNoteText(e.target.value)} placeholder="Add a new note..." className="flex-grow"/>
                                <button onClick={handleAddNote} className="btn">Add</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectDetailModal;
