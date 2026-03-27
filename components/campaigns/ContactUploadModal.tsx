import React, { useState, useRef, FC } from 'react';
import { useAppStore } from '../../store/store';

interface ContactUploadModalProps {
    onClose: () => void;
}

/**
 * A modal for uploading a list of contacts from a local file (XLSX, XLS, CSV).
 * @param {object} props - The component props.
 * @param {Function} props.onClose - Function to call to close the modal.
 * @returns {React.ReactElement} The rendered modal component.
 */
const ContactUploadModal: FC<ContactUploadModalProps> = ({ onClose }) => {
    const { uploadCampaignContacts, isAiJobRunning } = useAppStore();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    /**
     * Handles the file selection event from the file input.
     * @param {React.ChangeEvent<HTMLInputElement>} event - The file input change event.
     */
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    /**
     * Initiates the file upload and import process.
     * @returns {Promise<void>}
     */
    const handleUpload = async (): Promise<void> => {
        if (!selectedFile) return;
        await uploadCampaignContacts(selectedFile);
        onClose();
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept=".xlsx, .xls, .csv" />
                <div className="modal-header">
                    <h2>Upload Campaign Contacts</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <p className="text-sm text-text-secondary mb-4">Upload an XLSX, XLS, or CSV file containing your contacts. The file should have columns for at least 'Name' and 'Email'. Additional columns like 'Phone' and 'Company' will also be imported.</p>
                    <button className="btn w-full" onClick={() => fileInputRef.current?.click()}>
                        {selectedFile ? `Selected: ${selectedFile.name}` : 'Choose File'}
                    </button>
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Cancel</button>
                    <button className="btn green" onClick={handleUpload} disabled={!selectedFile || isAiJobRunning}>
                        {isAiJobRunning ? <span className="loader" /> : 'Upload and Import'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContactUploadModal;