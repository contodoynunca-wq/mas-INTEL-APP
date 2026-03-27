
import React, { useState, FC, useEffect } from 'react';
import type { ModalState } from '@/types';
import KeyAccountModal from '../contacts/KeyAccountModal';
import SupervisorFeedbackModal from './SupervisorFeedbackModal';

const ModalComponent: FC<ModalState & { onClose: (value: any) => void }> = (props) => {
    const { type, title, message, placeholder, content, onClose } = props;
    const [promptValue, setPromptValue] = useState('');
    
    // Add keyboard listener for Escape key
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose(type === 'confirm' || type === 'confirm-save' ? false : null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose, type]);

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Close if the direct child (the overlay) is clicked, not the content inside
        if (e.target === e.currentTarget) {
            onClose(type === 'confirm' || type === 'confirm-save' ? false : null);
        }
    };

    if (type === 'KeyAccount' && props.companyName) {
        return <KeyAccountModal companyName={props.companyName} onClose={() => onClose(null)} />;
    }

    if (type === 'SupervisorFeedback') {
        return <SupervisorFeedbackModal onClose={() => onClose(null)} />;
    }
    
    return (
        <div className="modal" onClick={handleOverlayClick}>
            <div className="modal-content" style={{ maxWidth: type === 'custom' ? '900px' : '500px' }}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button onClick={() => onClose(type === 'confirm' || type === 'confirm-save' ? false : null)} className="text-2xl hover:text-primary">&times;</button>
                </div>
                {content || <>
                    <div className="modal-body">
                        {message && <p className="text-text-secondary" dangerouslySetInnerHTML={{ __html: message }}></p>}
                        {type === 'prompt' && 
                            <input 
                                type="text" 
                                value={promptValue} 
                                onChange={e => setPromptValue(e.target.value)} 
                                placeholder={placeholder} 
                                autoFocus 
                                className="mt-4"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        onClose(promptValue);
                                    }
                                }}
                            />
                        }
                    </div>
                    <div className="modal-footer">
                        {type === 'alert' && <button className="btn" onClick={() => onClose(true)}>OK</button>}
                        {type === 'confirm' && <><button className="btn secondary" onClick={() => onClose(false)}>Cancel</button><button className="btn" onClick={() => onClose(true)}>Confirm</button></>}
                        {type === 'prompt' && <><button className="btn secondary" onClick={() => onClose(null)}>Cancel</button><button className="btn" onClick={() => onClose(promptValue)}>Submit</button></>}
                        {type === 'confirm-save' && <><button className="btn secondary" onClick={() => onClose('cancel')}>Cancel</button><button className="btn tertiary" onClick={() => onClose('discard')}>Discard</button><button className="btn green" onClick={() => onClose('save')}>Save</button></>}
                    </div>
                </>}
            </div>
        </div>
    );
};

export default ModalComponent;
