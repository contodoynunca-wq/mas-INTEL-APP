import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBscPZozDow-d3P0Hw4oEMZbLKo4IZhvRs",
  authDomain: "montazulsalesapp-cbb57.firebaseapp.com",
  databaseURL: "https://montazulsalesapp-cbb57-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "montazulsalesapp-cbb57",
  storageBucket: "montazulsalesapp-cbb57.appspot.com",
  messagingSenderId: "994467676155",
  appId: "1:994467676155:web:e55b087248068d23ed955e",
  measurementId: "G-GTF083DSKP",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use getFirestore instead of initializeFirestore to avoid conflicts with compat SDK
export const db = getFirestore(app);

export const storage = getStorage(app);
export default app;
