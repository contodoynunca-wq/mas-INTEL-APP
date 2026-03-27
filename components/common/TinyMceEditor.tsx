import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/store';

interface TinyMceEditorProps {
    value: string;
    onEditorChange: (content: string) => void;
}

const TinyMceEditor: React.FC<TinyMceEditorProps> = ({ value, onEditorChange }) => {
    const elRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<any>(null);
    const theme = useAppStore(state => state.theme);

    useEffect(() => {
        if (!elRef.current || !(window as any).tinymce) return;

        if (editorRef.current) {
            (window as any).tinymce.remove(editorRef.current);
            editorRef.current = null;
        }
        
        const textarea = document.createElement('textarea');
        elRef.current.appendChild(textarea);

        (window as any).tinymce.init({
            target: textarea,
            plugins: 'anchor autolink charmap codesample emoticons image link lists media searchreplace table visualblocks wordcount',
            toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | link image media table | align lineheight | numlist bullist indent outdent | emoticons charmap | removeformat | gdriveLink',
            skin: theme === 'dark' ? 'oxide-dark' : 'oxide',
            content_css: theme === 'dark' ? 'dark' : 'default',
            setup: (editor: any) => {
                editorRef.current = editor;

                // Add custom button for Google Drive link
                editor.ui.registry.addButton('gdriveLink', {
                    text: 'G-Drive Link',
                    tooltip: 'Insert Downloadable Google Drive Link',
                    icon: 'google-drive',
                    onAction: () => {
                        editor.windowManager.open({
                            title: 'Insert Google Drive Download Link',
                            body: {
                                type: 'panel',
                                items: [
                                    { type: 'input', name: 'shareUrl', label: 'Google Drive Share URL' },
                                    { type: 'input', name: 'linkText', label: 'Link Text (e.g., Download PDF)' }
                                ]
                            },
                            buttons: [
                                { type: 'cancel', text: 'Close' },
                                { type: 'submit', text: 'Insert', primary: true }
                            ],
                            onSubmit: (api: any) => {
                                const data = api.getData();
                                const shareUrl = data.shareUrl;
                                const linkText = data.linkText || 'Download File';

                                // Regex to extract the file ID from various Google Drive URL formats
                                const regex = /drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/;
                                const match = shareUrl.match(regex);
                                
                                if (match && match[1]) {
                                    const fileId = match[1];
                                    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                                    
                                    const content = `
                                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 10px 0;">
                                            <tr>
                                                <td align="center" style="border: 1px solid #ccc; border-radius: 5px; background: #f8f9fa;">
                                                    <a href="${downloadUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: #2980B9;">
                                                        <img src="https://i.imgur.com/3hXh9cQ.png" alt="Download Icon" width="64" height="64" style="display: block; border: 0; margin: 15px auto 5px auto;">
                                                        <span style="font-family: sans-serif; font-size: 14px; font-weight: bold; padding: 0 15px 15px 15px; display: block;">${linkText}</span>
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    `;
                                    editor.insertContent(content);
                                    api.close();
                                } else {
                                    editor.windowManager.alert('Invalid Google Drive share URL. Please use a valid link.');
                                }
                            }
                        });
                    }
                });

                editor.on('init', () => {
                    editor.setContent(value || '');
                });
                editor.on('input change', () => {
                    if (editorRef.current) {
                        const newContent = editor.getContent();
                        onEditorChange(newContent);
                    }
                });
            },
            images_upload_handler: (blobInfo: any) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject('File reading error');
                reader.readAsDataURL(blobInfo.blob());
            }),
            // Register custom icon
            icons: {
                'google-drive': '<svg width="24" height="24" viewBox="0 0 48 48"><path fill="#2196F3" d="M34.4 14.4h-10.8l-2.4-4.8h-12c-2.2 0-4 1.8-4 4v24c0 2.2 1.8 4 4 4h32c2.2 0 4-1.8 4-4v-20c0-2.2-1.8-4-4-4z"/><path fill="#90CAF9" d="M38 22.4v12c0 2.2-1.8 4-4 4h-24c-2.2 0-4-1.8-4-4v-18c0-2.2 1.8-4 4 4h9.6l2.4 4.8h12c2.2 0 4 1.8 4 4z"/></svg>'
            }
        }).catch((error: any) => {
            console.error("TinyMCE initialization error:", error);
        });

        return () => {
            if (editorRef.current) {
                (window as any).tinymce.remove(editorRef.current);
                editorRef.current = null;
            }
            if (elRef.current) {
                elRef.current.innerHTML = '';
            }
        };
    }, []);

    useEffect(() => {
        if (editorRef.current && value !== editorRef.current.getContent()) {
            editorRef.current.setContent(value || '');
        }
    }, [value]);

    return <div ref={elRef} style={{ minHeight: 400 }} />;
};

export default TinyMceEditor;