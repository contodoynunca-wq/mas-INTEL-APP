
import React, { FC, useState, useRef } from 'react';
import { useAppStore } from '../../store/store';
import { PlanReaderResultDisplay } from '../../components/tools/PlanReaderResultDisplay';
import type { PlanReaderResult, CountryCode } from '../../types';
import { generateRoofPlanSvg } from '../../services/ai/genericService';
import { generateVisualSummary3D, generateGenericImage } from '../../services/ai/imageGenerationService';

const AiToolsView: FC = () => {
    const planReaderState = useAppStore(state => state.planReaderState);
    const processJobs = useAppStore(state => state.processJobs);
    const { 
        showModal, 
        setPlanReaderState,
        startPlanReaderAnalysis,
        handleNavigationRequest,
        processAiJob,
        abortJob
    } = useAppStore.getState();

    const [dragOver, setDragOver] = useState(false);

    // Plan Reader state
    const [scale, setScale] = useState('');
    const [pitch, setPitch] = useState('');
    const [slateSize, setSlateSize] = useState('');
    const [country, setCountry] = useState<CountryCode>('UK');

    // Visualizer State
    const [visualizerPrompt, setVisualizerPrompt] = useState('');
    const [visualizerMode, setVisualizerMode] = useState<'svg' | '3d' | 'generic'>('svg');
    const [visualizerSvg, setVisualizerSvg] = useState<string | null>(null);
    const [visualizerImage, setVisualizerImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const { analysisState, analysisResultData, uploadedFiles, error } = planReaderState;
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const handleDiscardReport = () => setPlanReaderState({ analysisState: 'idle', analysisResultData: null, uploadedFiles: [], error: '' });
    
    const handleStopAnalysis = () => {
        const job = processJobs.find(j => j.name === 'Plan Reader Analysis' && j.status === 'running');
        if (job) abortJob(job.id);
        setPlanReaderState({ analysisState: 'idle', error: 'Analysis stopped by user.', uploadedFiles: [] });
    };

    const onFileSelected = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const currentFiles = planReaderState.uploadedFiles;
        const newFiles = Array.from(files).filter(file => 
            ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(file.type) &&
            !currentFiles.some(f => f.name === file.name && f.size === file.size)
        );
        if (newFiles.length === 0 && files.length > 0) {
            showModal({type: 'alert', title: 'File(s) Skipped', message: 'Duplicate or unsupported files.'});
            return;
        }
        setPlanReaderState({ uploadedFiles: [...currentFiles, ...newFiles], analysisState: 'idle', analysisResultData: null, error: '' });
    };

    const ensureApiKey = async () => {
        const win = window as any;
        if (win.aistudio && !await win.aistudio.hasSelectedApiKey()) await win.aistudio.openSelectKey();
    };

    const handleStartPlanReader = async (e: React.FormEvent) => {
        e.preventDefault();
        await ensureApiKey();
        startPlanReaderAnalysis(scale, pitch, slateSize, country);
    };

    const handleGenerateVisualization = async () => {
        if (!visualizerPrompt.trim()) return;
        await ensureApiKey();
        setIsGenerating(true);
        setVisualizerSvg(null);
        setVisualizerImage(null);

        if (visualizerMode === 'svg') {
            const result = await processAiJob(() => generateRoofPlanSvg(visualizerPrompt), `Generating SVG...`);
            if (result) setVisualizerSvg(result);
        } else if (visualizerMode === '3d') {
            const result = await processAiJob(() => generateVisualSummary3D(visualizerPrompt), `Generating 3D Concept...`);
            if (result) setVisualizerImage(`data:${result.mimeType};base64,${result.base64Image}`);
        } else if (visualizerMode === 'generic') {
            const result = await processAiJob(() => generateGenericImage(visualizerPrompt), `Generating Image...`);
            if (result) setVisualizerImage(`data:${result.mimeType};base64,${result.base64Image}`);
        }
        setIsGenerating(false);
    };

    return (
        <div className="space-y-8">
            <div className="panel">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="m-0 p-0 border-none">AI Plan Reader & Materials Take-Off</h2>
                    {analysisState === 'running' && <button className="btn red sm" onClick={handleStopAnalysis}>STOP ANALYSIS ⬛</button>}
                </div>
                
                {analysisState === 'idle' && (
                    <form onSubmit={handleStartPlanReader}>
                        <input type="file" ref={fileInputRef} onChange={e => onFileSelected(e.target.files)} accept="image/*,application/pdf" multiple className="hidden" />
                        <div 
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => { e.preventDefault(); setDragOver(false); onFileSelected(e.dataTransfer.files); }}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed ${dragOver ? 'border-primary bg-primary/10' : 'border-border-color'} p-10 rounded-lg cursor-pointer transition-colors`}
                        >
                            {uploadedFiles.length > 0 ? (
                                <div className="text-left">
                                    <p className="font-semibold text-center mb-2">{uploadedFiles.length}/20 files selected.</p>
                                    <ul className="max-h-40 overflow-y-auto space-y-2 text-sm pr-2">
                                        {uploadedFiles.map((file, i) => (
                                            <li key={i} className="flex justify-between items-center bg-surface p-2 rounded">
                                                <span className="truncate pr-2">{file.name}</span>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); setPlanReaderState({ uploadedFiles: uploadedFiles.filter((_, idx) => idx !== i) }); }} className="btn red sm !p-1">&times;</button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : <p className="text-center">Drag & Drop up to 20 plan images or PDFs here.</p>}
                        </div>

                        {uploadedFiles.length > 0 && (
                            <div className="mt-6">
                                <h4 className="font-semibold">Analysis Parameters</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
                                    <div className="form-group"><label>Standard</label><select value={country} onChange={e => setCountry(e.target.value as CountryCode)}><option value="UK">🇬🇧 UK</option><option value="ES">🇪🇸 Spain</option><option value="FR">🇫🇷 France</option><option value="DE">🇩🇪 Germany</option></select></div>
                                    <div className="form-group"><label>Scale</label><input type="text" value={scale} onChange={e => setScale(e.target.value)} placeholder="e.g., 1:100" /></div>
                                    <div className="form-group"><label>Pitch</label><input type="text" value={pitch} onChange={e => setPitch(e.target.value)} placeholder="e.g., 35" /></div>
                                    <div className="form-group"><label>Slate Size</label><input type="text" value={slateSize} onChange={e => setSlateSize(e.target.value)} placeholder="e.g., 500x250" /></div>
                                </div>
                            </div>
                        )}
                        <button type="submit" className="btn green w-full mt-6" disabled={uploadedFiles.length === 0}>Start Analysis</button>
                    </form>
                )}
                
                {analysisState === 'running' && <div className="text-center p-10"><div className="loader !w-16 !h-16 mx-auto mb-4"></div><p className="text-lg font-bold text-primary">Analyzing Plans...</p></div>}
                {(analysisState === 'error' || error) && <div className="mt-4 p-4 bg-loss-bg border border-loss-color rounded-lg"><p className="text-loss-color font-bold">Failed</p><p>{error}</p><button className="btn secondary mt-2" onClick={handleDiscardReport}>Reset</button></div>}
                
                {/* Use the extracted component */}
                {analysisResultData && uploadedFiles.length > 0 && analysisState === 'complete' && (
                    <PlanReaderResultDisplay 
                        result={analysisResultData} 
                        imageFiles={uploadedFiles} 
                        onDiscard={handleDiscardReport} 
                        onUseForQuote={(data) => handleNavigationRequest('new-quote', { planReaderData: data })} 
                        onUpdateResult={(res) => setPlanReaderState({ analysisResultData: res })} 
                    />
                )}
            </div>

            <div className="panel">
                <h2 className="mb-4">AI Roof Visualizer</h2>
                <div className="flex gap-4 mb-4 border-b border-border-color">
                    <button className={`px-4 py-2 border-b-2 ${visualizerMode === 'svg' ? 'border-primary text-primary' : 'border-transparent text-text-secondary'}`} onClick={() => setVisualizerMode('svg')}>SVG</button>
                    <button className={`px-4 py-2 border-b-2 ${visualizerMode === '3d' ? 'border-primary text-primary' : 'border-transparent text-text-secondary'}`} onClick={() => setVisualizerMode('3d')}>3D Concept</button>
                    <button className={`px-4 py-2 border-b-2 ${visualizerMode === 'generic' ? 'border-primary text-primary' : 'border-transparent text-text-secondary'}`} onClick={() => setVisualizerMode('generic')}>Generic</button>
                </div>
                <textarea value={visualizerPrompt} onChange={e => setVisualizerPrompt(e.target.value)} placeholder="Description..." rows={3} className="w-full" />
                <button className="btn w-full mt-4" onClick={handleGenerateVisualization} disabled={!visualizerPrompt.trim() || isGenerating}>{isGenerating ? <span className="loader"/> : 'Generate'}</button>
                {visualizerSvg && <div className="mt-6 p-4 bg-white rounded" dangerouslySetInnerHTML={{ __html: visualizerSvg }} />}
                {visualizerImage && <div className="mt-6 rounded overflow-hidden"><img src={visualizerImage} className="w-full"/></div>}
            </div>
        </div>
    );
};

export default AiToolsView;
