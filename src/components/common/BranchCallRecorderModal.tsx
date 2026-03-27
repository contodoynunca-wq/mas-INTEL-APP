import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { Contact } from '@/utils/sihParser';

interface BranchCallRecorderModalProps {
    contact: Contact;
    onSave: (notes: string, outcome: string) => void;
    onClose: () => void;
}

export default function BranchCallRecorderModal({ contact, onSave, onClose }: BranchCallRecorderModalProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [audioData, setAudioData] = useState<Blob | null>(null);
    const [analysis, setAnalysis] = useState<string>('');
    const [outcome, setOutcome] = useState<string>('Interested');
    const [error, setError] = useState<string>('');

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = async () => {
        try {
            setError('');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                setAudioData(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            setError('Could not access microphone. Please ensure permissions are granted.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const processAudio = async () => {
        if (!audioData) return;
        setIsProcessing(true);
        setError('');

        try {
            const base64String = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(audioData);
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    resolve(base64data.split(',')[1]);
                };
                reader.onerror = reject;
            });

            const mimeType = audioData.type || 'audio/webm';
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            
            const prompt = `You are a sales intelligence AI. Please listen to this call recording for the branch/contact "${contact.name}".
1. Provide a full transcription of the call.
2. Provide a brief analysis of the call, extracting key action items, sentiment, and important information relevant to selling roofing materials.
3. Based on the call, suggest an outcome (e.g., "Interested", "Not Interested", "Call Back Later", "Left Message").`;

            const response = await ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: [
                    {
                        parts: [
                            {
                                inlineData: {
                                    data: base64String,
                                    mimeType: mimeType
                                }
                            },
                            { text: prompt }
                        ]
                    }
                ]
            });

            const resultText = response.text || '';
            setAnalysis(resultText);
            
            // Try to infer outcome from text
            const lowerText = resultText.toLowerCase();
            if (lowerText.includes('not interested')) setOutcome('Not Interested');
            else if (lowerText.includes('call back') || lowerText.includes('callback')) setOutcome('Call Back Later');
            else if (lowerText.includes('left message') || lowerText.includes('voicemail')) setOutcome('Left Message');
            else setOutcome('Interested');

        } catch (err) {
            console.error('Error processing audio:', err);
            setError('Failed to process audio with AI. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSave = () => {
        if (!analysis) return;
        const timestamp = new Date().toLocaleString();
        const newNote = `--- Call Recording Analysis (${timestamp}) ---\n${analysis}`;
        onSave(newNote, outcome);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-bg-secondary rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-border-color flex justify-between items-center bg-surface rounded-t-lg">
                    <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                        🎙️ Record Call & AI Analysis
                    </h3>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary">✕</button>
                </div>

                <div className="p-6 overflow-y-auto flex-grow flex flex-col gap-6">
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                        <p className="font-bold text-primary mb-1">Target Contact: {contact.name}</p>
                        <p className="text-sm text-text-secondary">{contact.town} - {contact.phone || contact.mobile || contact.landline || 'No Phone'}</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded text-sm border border-red-200">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        {!audioData && !isProcessing && (
                            <button
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl shadow-lg transition-all ${
                                    isRecording 
                                        ? 'bg-red-500 text-white animate-pulse hover:bg-red-600' 
                                        : 'bg-primary text-white hover:bg-primary/90 hover:scale-105'
                                }`}
                            >
                                {isRecording ? '⏹️' : '🎙️'}
                            </button>
                        )}
                        
                        {isRecording && (
                            <p className="text-red-500 font-bold animate-pulse">Recording in progress...</p>
                        )}

                        {audioData && !isProcessing && !analysis && (
                            <div className="flex flex-col items-center gap-4 w-full">
                                <audio src={URL.createObjectURL(audioData)} controls className="w-full max-w-md" />
                                <div className="flex gap-3">
                                    <button onClick={() => setAudioData(null)} className="btn secondary">
                                        Discard & Rerecord
                                    </button>
                                    <button onClick={processAudio} className="btn primary flex items-center gap-2">
                                        <span>🧠</span> Analyze with AI
                                    </button>
                                </div>
                            </div>
                        )}

                        {isProcessing && (
                            <div className="flex flex-col items-center gap-3 text-primary">
                                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <p className="font-bold">AI is transcribing and analyzing the call...</p>
                            </div>
                        )}
                    </div>

                    {analysis && (
                        <div className="flex flex-col gap-3 animate-fade-in">
                            <h4 className="font-bold text-primary border-b border-border-color pb-2">AI Analysis & Transcription</h4>
                            
                            <div className="flex flex-col gap-2 mb-2">
                                <label className="text-sm font-bold text-text-secondary">Call Outcome</label>
                                <select 
                                    value={outcome} 
                                    onChange={(e) => setOutcome(e.target.value)}
                                    className="p-2 border border-border-color rounded bg-bg-secondary text-text-primary"
                                >
                                    <option value="Interested">Interested</option>
                                    <option value="Not Interested">Not Interested</option>
                                    <option value="Call Back Later">Call Back Later</option>
                                    <option value="Left Message">Left Message</option>
                                </select>
                            </div>

                            <div className="bg-surface border border-border-color rounded p-4 text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
                                {analysis}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border-color bg-surface rounded-b-lg flex justify-end gap-3">
                    <button onClick={onClose} className="btn secondary">Cancel</button>
                    {analysis && (
                        <button onClick={handleSave} className="btn primary">
                            Save Call Record
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
