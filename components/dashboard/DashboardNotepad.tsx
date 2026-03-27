import React, { FC, useState } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { useAppStore } from '@/store/store';
import type { Note } from '@/types';
import { getDb } from '@/services/firebase';

const DashboardNotepad: FC = () => {
    // Performance Optimization: Use granular selectors
    const notes = useAppStore(state => state.dashboardNotes);
    const currentUser = useAppStore(state => state.currentUser);
    const { showModal } = useAppStore.getState(); // Actions are stable

    const [newNote, setNewNote] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    const handlePostNote = async () => {
        const db = getDb();
        if (!newNote.trim() || !currentUser) return;
        setIsPosting(true);
        try {
            await db.collection("dashboardNotes").add({
                text: newNote.trim(),
                author: currentUser.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setNewNote('');
        } catch (error) {
            console.error("Error posting note:", error);
            await showModal({ type: 'alert', title: 'Error', message: 'Could not post your note.' });
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <div className="panel">
            <h2 className="mb-4">Shared Notepad</h2>
            <div className="space-y-2 mb-4">
                <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Leave a message for the team..."
                    rows={3}
                    className="w-full"
                    disabled={isPosting}
                />
                <button onClick={handlePostNote} className="btn w-full" disabled={isPosting || !newNote.trim()}>
                    {isPosting ? <span className="loader" /> : 'Post Note'}
                </button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {notes.length === 0 ? (
                    <p className="text-sm text-text-secondary text-center">No notes yet.</p>
                ) : (
                    notes.map((note: Note) => (
                        <div key={note.id} className="p-3 bg-surface rounded-lg text-sm">
                            <p className="whitespace-pre-wrap">{note.text}</p>
                            <p className="text-xs text-right text-text-secondary mt-2">
                                - {note.author} on {note.date}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default DashboardNotepad;