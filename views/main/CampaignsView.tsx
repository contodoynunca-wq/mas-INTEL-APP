
import React, { FC, useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/store';
import CampaignCreatorModal from '../../components/campaigns/CampaignCreatorModal';
import ContactUploadModal from '../../components/campaigns/ContactUploadModal';
import ManualContactModal from '../../components/campaigns/ManualContactModal';
import DirectorySelectorModal from '../../components/campaigns/DirectorySelectorModal';
import ClickSendListModal from '../../components/campaigns/ClickSendListModal';
import CampaignReviewModal from '../../components/campaigns/CampaignReviewModal';
import type { Campaign } from '../../types';
import { fetchEmailCampaignStats, fetchSmsCampaignStats, fetchInboundSms } from '../../services/clicksendService';
import { getDb } from '../../services/firebase';
import firebase from 'firebase/compat/app';
import { generateCampaignAssets } from '@/services/ai/campaignService';
import TinyMceEditor from '../../components/common/TinyMceEditor';
import { safeTimestampToDate } from '../../utils/firestoreUtils';


const CampaignsView: FC = () => {
    // Performance Optimization: Use granular selectors
    const campaigns = useAppStore(state => state.campaigns);
    const campaignContacts = useAppStore(state => state.campaignContacts);
    const isAiJobRunning = useAppStore(state => state.isAiJobRunning);
    const { 
        showModal, 
        clicksendConfig, 
        processAiJob, 
        handleNavigationRequest,
        clearCampaignAudience,
        logEvent,
    } = useAppStore.getState();
    
    const [modal, setModal] = useState<'creator' | 'uploader' | 'manual' | 'directory' | 'clicksend' | null>(null);
    const [reviewingCampaign, setReviewingCampaign] = useState<Campaign | null>(null);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [selectedCampaignType, setSelectedCampaignType] = useState<'email' | 'sms'>('email');
    const [activeTemplateIndex, setActiveTemplateIndex] = useState(0);
    const [draftBody, setDraftBody] = useState('');
    const [draftSubject, setDraftSubject] = useState('');
    const [presetCampaign, setPresetCampaign] = useState<{name: string, goal: string} | null>(null);

    // Definitive Fix for Draft Display Bug: This consolidated useEffect manages all state related
    // to the editor content. The logic is now more direct to prevent race conditions.
    useEffect(() => {
        if (!selectedCampaign) {
            setDraftBody('');
            setDraftSubject('');
            return;
        }

        const templates = selectedCampaign.type === 'email' ? selectedCampaign.emailTemplates : selectedCampaign.smsTemplates;
        
        let newIndex = activeTemplateIndex;
        // If the current index is out of bounds for the newly selected campaign, reset it to 0.
        if (activeTemplateIndex >= (templates?.length || 0)) {
            newIndex = 0;
            // If we have to correct the index, update the state.
            // This is non-blocking and the rest of the effect will use the corrected `newIndex`.
            if (activeTemplateIndex !== newIndex) {
                 setActiveTemplateIndex(newIndex);
            }
        }

        const template = templates?.[newIndex];

        setDraftBody(template?.body || '');
        setDraftSubject((template as any)?.subject || '');

    }, [selectedCampaign, activeTemplateIndex]);


    const handleSelectCampaign = (campaign: Campaign, type: 'email' | 'sms') => {
        // When selecting a completely new campaign, always reset the template index to 0.
        // This ensures we start with the first template of the new campaign.
        if (campaign.id !== selectedCampaign?.id) {
            setActiveTemplateIndex(0);
        }
        setSelectedCampaign(campaign);
        setSelectedCampaignType(type);
    };

    const transformGoogleDriveLink = (html: string): string => {
        const regex = /href="https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view\?usp=sharing"/g;
        return html.replace(regex, (match, fileId) => `href="https://drive.google.com/uc?export=download&id=${fileId}"`);
    };

    const handleSaveDraft = async () => {
        if (!selectedCampaign) return;

        let updates: Partial<Campaign> = {};
        if (selectedCampaignType === 'sms' && selectedCampaign.smsTemplates) {
            const newTemplates = [...selectedCampaign.smsTemplates];
            newTemplates[activeTemplateIndex] = { ...newTemplates[activeTemplateIndex], body: draftBody };
            updates = { smsTemplates: newTemplates };
        }
        if (selectedCampaignType === 'email' && selectedCampaign.emailTemplates) {
            const transformedBody = transformGoogleDriveLink(draftBody);
            const newTemplates = [...selectedCampaign.emailTemplates];
            newTemplates[activeTemplateIndex] = { ...newTemplates[activeTemplateIndex], subject: draftSubject, body: transformedBody };
            updates = { emailTemplates: newTemplates };
        }
        
        // FIX: Replaced direct usage of 'db' with a call to 'getDb()' to fix module export error.
        const db = getDb();
        await db.collection('campaigns').doc(selectedCampaign.id).update(updates);
        await showModal({type: 'alert', title: 'Draft Saved', message: 'Your changes have been saved.'});
    };
    
    const handleCloneCampaign = async (campaign: Campaign) => {
        const newName = await showModal({type: 'prompt', title: 'Clone Campaign', message: 'Enter a name for the new cloned campaign:', placeholder: `${campaign.name} (Copy)`});
        if (newName) {
            const { id, createdAt, ...originalData } = campaign;
            const newCampaign: Omit<Campaign, 'id'> = {
                ...(originalData as Omit<Campaign, 'id' | 'createdAt'>),
                name: newName,
                status: 'draft',
                createdAt: firebase.firestore.FieldValue.serverTimestamp() as firebase.firestore.Timestamp,
                clicksendListId: undefined, // Reset integration-specific fields
                clicksendEmailCampaignId: undefined,
                clicksendSmsCampaignId: undefined,
            };
            // FIX: Replaced direct usage of 'db' with a call to 'getDb()' to fix module export error.
            const db = getDb();
            await db.collection('campaigns').add(newCampaign);
        }
    };
    
    const handleDeleteCampaign = async (campaignId: string) => {
        const confirmed = await showModal({type: 'confirm', title: 'Delete Campaign', message: 'Are you sure you want to permanently delete this campaign?'});
        if (confirmed) {
            // FIX: Replaced direct usage of 'db' with a call to 'getDb()' to fix module export error.
            const db = getDb();
            await db.collection('campaigns').doc(campaignId).delete();
            if (selectedCampaign?.id === campaignId) {
                setSelectedCampaign(null);
            }
        }
    };

    const handleReDraftCampaign = async () => {
        if (!selectedCampaign) return;
        const confirmed = await showModal({type: 'confirm', title: 'Re-Draft with AI', message: 'This will generate new content for all templates in this campaign. Are you sure?'});
        if (!confirmed) return;

        processAiJob(async (updateStatus) => {
            updateStatus({ progress: 20, description: 'Analyzing campaign goal...'});
            const contacts = selectedCampaign.contacts || [];
            const assets = await generateCampaignAssets(selectedCampaign.name, selectedCampaign.goal, contacts);
            
            updateStatus({ progress: 80, description: 'Updating campaign with new content...'});
            // FIX: Replaced direct usage of 'db' with a call to 'getDb()' to fix module export error.
            const db = getDb();
            await db.collection('campaigns').doc(selectedCampaign.id).update({
                emailTemplates: assets.emailTemplates,
                smsTemplates: assets.smsTemplates,
                strategy: assets.strategy,
            });
            // The local state will update automatically via the Firestore listener
        }, `Re-Drafting: ${selectedCampaign.name}`);
    };

    const handlePresetClick = () => {
        setPresetCampaign({
            name: "Q4 2025 Roofers Outreach",
            goal: "Promote an end-of-year offer on our premium slate products, we offer the Mont Azul Lombeiro MA12 @ 1.72gbp, get it quick before the price rise from the quarries next year"
        });
        setModal('creator');
    };

    const emailDrafts = useMemo(() => campaigns.filter(c => c.type === 'email' && c.status === 'draft' && Array.isArray(c.contacts)), [campaigns]);
    const smsDrafts = useMemo(() => campaigns.filter(c => c.type === 'sms' && c.status === 'draft' && Array.isArray(c.contacts)), [campaigns]);
    const sentCampaigns = useMemo(() => campaigns.filter(c => c.status !== 'draft' && Array.isArray(c.contacts)), [campaigns]);


    return (
        <div className="grid grid-cols-1 lg:grid-cols-[450px_1fr] gap-8 h-full">
            {modal === 'creator' && <CampaignCreatorModal 
                onClose={() => { setModal(null); setPresetCampaign(null); }} 
                initialName={presetCampaign?.name}
                initialGoal={presetCampaign?.goal}
            />}
            {modal === 'uploader' && <ContactUploadModal onClose={() => setModal(null)} />}
            {modal === 'manual' && <ManualContactModal onClose={() => setModal(null)} />}
            {modal === 'directory' && <DirectorySelectorModal onClose={() => setModal(null)} />}
            {modal === 'clicksend' && <ClickSendListModal onClose={() => setModal(null)} />}
            {reviewingCampaign && <CampaignReviewModal campaign={reviewingCampaign} onClose={() => setReviewingCampaign(null)} />}

            {/* Left Panel */}
            <div className="panel flex flex-col h-full">
                <h2 className="flex-shrink-0">Campaign Command Center</h2>

                <div className="p-4 bg-surface rounded-lg mb-4 flex-shrink-0">
                    <p className="font-bold">1. Build Campaign Audience ({campaignContacts.length} Contacts)</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <button className="btn tertiary" onClick={() => setModal('uploader')}>Upload List</button>
                        <button className="btn tertiary" onClick={() => setModal('directory')}>Add from Directory</button>
                        <button className="btn tertiary" onClick={() => setModal('manual')}>Add Manually</button>
                    </div>
                    <button className="btn red w-full mt-2" onClick={clearCampaignAudience} disabled={campaignContacts.length === 0}>Clear Audience</button>
                </div>

                <div className="p-4 bg-surface rounded-lg mb-4 flex-shrink-0">
                     <p className="font-bold">2. Create New Campaign</p>
                     <button className="btn green w-full mt-2" onClick={() => setModal('creator')} disabled={campaignContacts.length === 0}>
                        + Generate Campaign with AI
                    </button>
                    <div className="mt-4">
                        <p className="text-xs text-text-secondary mb-2">Or use a quick-start template:</p>
                        <div 
                            className="p-3 bg-bg-secondary rounded-lg cursor-pointer hover:bg-bg-primary border border-border-color"
                            onClick={handlePresetClick}
                            role="button"
                            tabIndex={0}
                        >
                            <p className="font-semibold text-primary">🚀 Q4 2025 Roofers Outreach</p>
                            <p className="text-xs text-text-secondary mt-1">Preset offer for the Mont Azul Lombeiro MA12 slate.</p>
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto">
                    <h3 className="text-base">Campaign Drafts</h3>
                     <div className="space-y-2">
                        {emailDrafts.map(c => <CampaignCard key={c.id} campaign={c} type="email" onSelect={handleSelectCampaign} onClone={handleCloneCampaign} onDelete={handleDeleteCampaign} selectedId={selectedCampaign?.id || null} />)}
                        {smsDrafts.map(c => <CampaignCard key={c.id} campaign={c} type="sms" onSelect={handleSelectCampaign} onClone={handleCloneCampaign} onDelete={handleDeleteCampaign} selectedId={selectedCampaign?.id || null}/>)}
                     </div>
                     <h3 className="text-base mt-4">Active & Sent Campaigns</h3>
                     <div className="space-y-2">
                         {sentCampaigns.map(c => <CampaignCard key={c.id} campaign={c} type={c.type} onSelect={handleSelectCampaign} onClone={handleCloneCampaign} onDelete={handleDeleteCampaign} selectedId={selectedCampaign?.id || null} />)}
                     </div>
                </div>
            </div>

            {/* Right Panel */}
            <div className="panel overflow-y-auto">
                {!selectedCampaign ? (
                    <div className="flex items-center justify-center h-full text-center"><p className="text-secondary">Select a campaign to view its details and edit content.</p></div>
                ) : (
                    <div>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl mb-1">{selectedCampaign.name}</h3>
                                <p className="text-sm text-text-secondary"><strong>Goal:</strong> {selectedCampaign.goal}</p>
                            </div>
                            {selectedCampaign.status === 'draft' && (
                                <div className="flex gap-2">
                                    <button className="btn tertiary" onClick={handleReDraftCampaign} disabled={isAiJobRunning}>Re-Draft with AI</button>
                                    <button className="btn" onClick={handleSaveDraft}>Save Draft</button>
                                    <button className="btn green" onClick={() => setReviewingCampaign(selectedCampaign)}>Review & Approve</button>
                                </div>
                            )}
                        </div>

                        {selectedCampaign.status === 'draft' ? (
                            <>
                                <div className="flex border-b border-border-color mb-4">
                                    {(selectedCampaignType === 'email' ? selectedCampaign.emailTemplates : selectedCampaign.smsTemplates)?.map((template, index) => (
                                        <button key={index} onClick={() => setActiveTemplateIndex(index)} className={`px-4 py-2 text-sm rounded-t-lg ${activeTemplateIndex === index ? 'bg-surface text-text-primary' : 'text-text-secondary'}`}>
                                            {template.name}
                                        </button>
                                    ))}
                                </div>
                                {selectedCampaignType === 'email' ? (
                                    <div>
                                        <div className="form-group mb-4">
                                            <label>Subject</label>
                                            <input type="text" value={draftSubject} onChange={e => setDraftSubject(e.target.value)} />
                                        </div>
                                        <h4>Email Content</h4>
                                        <TinyMceEditor
                                            key={`${selectedCampaign.id}-${activeTemplateIndex}`}
                                            value={draftBody}
                                            onEditorChange={setDraftBody}
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <h4>SMS Content (Max 1500 chars)</h4>
                                        <textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={8} maxLength={1500}></textarea>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-text-secondary mt-1">To include an image, paste its full URL into the text. Most phones will show a preview.</p>
                                            <p className="text-right text-xs text-text-secondary">{draftBody.length} / 1500</p>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : <AnalyticsPanel campaign={selectedCampaign} />}
                    </div>
                )}
            </div>
        </div>
    );
};

interface CampaignCardProps {
    campaign: Campaign;
    type: 'email' | 'sms';
    onSelect: (c: Campaign, t: 'email' | 'sms') => void;
    onClone: (c: Campaign) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    selectedId: string | null;
}

const getStatusStyles = (status: Campaign['status']) => {
    switch (status) {
        case 'draft': return 'bg-yellow-500/20 text-yellow-500';
        case 'sending': return 'bg-blue-500/20 text-blue-500 animate-pulse';
        case 'sent': return 'bg-profit-bg text-profit-color';
        case 'failed': return 'bg-loss-bg text-loss-color';
        case 'scheduled': return 'bg-purple-500/20 text-purple-500';
        default: return 'bg-surface text-text-secondary';
    }
};

const CampaignCard: FC<CampaignCardProps> = ({ campaign, type, onSelect, onClone, onDelete, selectedId }) => {
    const isSelected = selectedId === campaign.id && type === campaign.type;
    return (
        <div onClick={() => onSelect(campaign, type)} className={`p-3 rounded-lg cursor-pointer transition-colors relative group ${isSelected ? 'bg-primary text-bg-secondary' : 'bg-surface hover:bg-bg-primary'}`}>
            <p className="font-semibold">{type === 'email' ? '📧' : '📱'} {campaign.name}</p>
            <div className="flex justify-between items-center">
                <p className="text-xs opacity-80">{campaign.contacts.length} contacts | {safeTimestampToDate(campaign.createdAt)?.toLocaleDateString() ?? 'N/A'}</p>
                <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ${getStatusStyles(campaign.status)}`}>
                    {campaign.status}
                </span>
            </div>
            <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button title="Clone" onClick={(e) => { e.stopPropagation(); onClone(campaign);}} className="btn tertiary sm !p-1"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>
                {onDelete && <button title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(campaign.id);}} className="btn red sm !p-1"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"></path></svg></button>}
            </div>
        </div>
    );
};

const AnalyticsPanel = ({ campaign }: { campaign: Campaign }) => {
    if (campaign.status === 'sending') {
        return (
            <div className="flex flex-col justify-center items-center h-48 text-center">
                <div className="loader !w-12 !h-12 mb-4" />
                <p className="text-lg font-semibold text-primary">Campaign is Sending</p>
                <p className="text-sm text-text-secondary">Analytics will be available shortly after the campaign is sent.</p>
            </div>
        );
    }

    return (
        <div>
            <h4>Campaign Analytics</h4>
            <p className="text-sm text-text-secondary">Campaign analytics are currently unavailable.</p>
        </div>
    );
};


export default CampaignsView;