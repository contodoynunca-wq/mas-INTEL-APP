import React, { FC, useState, useRef } from 'react';
import { getDb } from '@/services/firebase';
import { useAppStore } from '@/store/store';
import { mapHeadersToSchema, processImportedContacts } from '@/services/ai/dataProcessingService';
import type { InternalContact } from '@/types';
import * as XLSX from 'xlsx';

type HeaderMap = { [key in keyof Partial<InternalContact>]: string | null };

interface InternalContactImportModalProps {
    onClose: () => void;
}

const InternalContactImportModal: FC<InternalContactImportModalProps> = ({ onClose }) => {
    const { showModal, logEvent, processAiJob } = useAppStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [importStep, setImportStep] = useState<'select' | 'map' | 'confirm'>('select');
    const [fileName, setFileName] = useState('');
    const [fileHeaders, setFileHeaders] = useState<string[]>([]);
    const [headerMap, setHeaderMap] = useState<HeaderMap | null>(null);
    const [processing, setProcessing] = useState(false);
    const [rawData, setRawData] = useState<any[]>([]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setProcessing(true);
        setFileName(file.name);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                if (json.length === 0) {
                    showModal({type: 'alert', title: 'Empty File', message: 'The selected file has no data.'});
                    return;
                }
                
                const headers = Object.keys(json[0]);
                setFileHeaders(headers);
                setRawData(json);

                logEvent('AI', `Mapping headers for import: ${headers.join(', ')}`);
                const mapped = await mapHeadersToSchema(headers);
                setHeaderMap(mapped);
                setImportStep('map');

            } catch (error) {
                logEvent('ERR', `Failed to process XLSX file: ${error instanceof Error ? error.message : 'Unknown'}`);
                showModal({type: 'alert', title: 'File Error', message: 'Could not process the selected file.'});
            } finally {
                setProcessing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleConfirmImport = () => {
        if (!headerMap || rawData.length === 0) return;
        
        onClose(); // Close modal and show progress in process monitor
        processAiJob(async () => {
            const newContacts = processImportedContacts(rawData, headerMap);
            // FIX: Replaced direct usage of 'db' with a call to 'getDb()' to fix module export error.
            const db = getDb();
            const batch = db.batch();
            newContacts.forEach(contact => {
                const docRef = db.collection('contacts').doc();
                batch.set(docRef, contact);
            });
            await batch.commit();
            await showModal({type: 'alert', title: 'Import Successful', message: `Successfully imported ${newContacts.length} internal contacts.`});
        }, `Importing ${rawData.length} contacts from ${fileName}`);
    };
    
    const renderContent = () => {
        if (processing) {
            return <div className="flex flex-col items-center justify-center p-8"><div className="loader !w-12 !h-12" /> <p className="mt-4">Processing file...</p></div>;
        }

        switch (importStep) {
            case 'select':
                return (
                    <div className="text-center">
                        <p className="text-sm text-text-secondary mb-4">Upload an XLSX or CSV file with your contacts. The AI will attempt to map the columns automatically.</p>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls, .csv" className="hidden"/>
                        <button className="btn" onClick={() => fileInputRef.current?.click()}>Choose File</button>
                    </div>
                );
            case 'map':
                if (!headerMap) return null;
                return (
                    <div>
                        <p className="text-sm text-text-secondary mb-4">The AI has mapped your file's columns to our schema. Please review and confirm.</p>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                            <div className="font-bold border-b border-border-color pb-1">Your Column</div>
                            <div className="font-bold border-b border-border-color pb-1">App Field</div>
                            {Object.entries(headerMap).map(([schemaKey, userHeader]) => (
                                <React.Fragment key={schemaKey}>
                                    <div className={`p-1 rounded ${userHeader ? 'bg-surface' : 'bg-loss-bg/20 text-text-secondary'}`}>{userHeader || '(Not Found)'}</div>
                                    <div className="p-1 font-mono text-primary">→ {schemaKey}</div>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Import Internal Contacts</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    {renderContent()}
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Cancel</button>
                    {importStep === 'map' && <button className="btn green" onClick={handleConfirmImport}>Confirm & Import</button>}
                </div>
            </div>
        </div>
    );
};

export default InternalContactImportModal;
