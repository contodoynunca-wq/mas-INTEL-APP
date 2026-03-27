import React, { useState, FC } from 'react';
import { useAppStore } from '../../store/store';
import { getAuth, getDb, firebaseInitializationError } from '../../services/firebase';

const AuthScreen: FC = () => {
    const { showModal } = useAppStore();
    const [isRegistering, setIsRegistering] = useState(false);
    const [email, setEmail] = useState('contodoynunca@gmail.com');
    const [password, setPassword] = useState('123456');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (firebaseInitializationError) {
            setError("Authentication service could not be initialized. Please refresh.");
            return;
        }
        const auth = getAuth();
        const db = getDb();
        setLoading(true);
        setError('');
        try {
            if (isRegistering) {
                if (!displayName) {
                    setError('Display name is required.');
                    setLoading(false);
                    return;
                }
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                await userCredential.user?.updateProfile({ displayName });
                await db.collection("users").doc(userCredential.user!.uid).set({
                    displayName,
                    email,
                    status: 'pending',
                    isAdmin: false
                });
                await showModal({type: 'alert', title: 'Registration Successful', message: 'Your account has been created and is now awaiting admin approval.'});
                setIsRegistering(false);

            } else {
                await auth.signInWithEmailAndPassword(email, password);
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred.');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="auth-container text-center">
                <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" className="h-28 w-28 mx-auto mb-4"/>
                <h1 className="text-2xl font-bold mb-2">Mont Azul Hub</h1>
                <div className="flex justify-center border-b border-border-color mb-6">
                    <button onClick={() => { setIsRegistering(false); setError(''); }} className={`py-2 px-6 text-sm uppercase ${!isRegistering ? 'text-primary border-b-2 border-primary' : 'text-text-secondary'}`}>Sign In</button>
                    <button onClick={() => { setIsRegistering(true); setError(''); }} className={`py-2 px-6 text-sm uppercase ${isRegistering ? 'text-primary border-b-2 border-primary' : 'text-text-secondary'}`}>Register</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {isRegistering && <input type="text" placeholder="Display Name" value={displayName} onChange={e => setDisplayName(e.target.value)} required />}
                    <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required />
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="submit" className="btn w-full justify-center" disabled={loading}>
                        {loading ? <span className='loader' /> : (isRegistering ? 'Register' : 'Sign In')}
                    </button>
                    {error && <p className="text-loss-color text-sm h-4 mt-2">{error}</p>}
                </form>
            </div>
        </div>
    );
};

export default AuthScreen;