import app, { db } from './config';
import { getAuth as firebaseGetAuth } from 'firebase/auth';

export const getAuth = () => firebaseGetAuth(app);
export const getDb = () => db;
export const firebaseInitializationError = null;
