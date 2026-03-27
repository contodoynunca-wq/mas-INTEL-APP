
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/functions';

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

// Declare service variables, initialized to null.
let _db: firebase.firestore.Firestore | null = null;
let _auth: firebase.auth.Auth | null = null;
let _storage: firebase.storage.Storage | null = null;
let _functions: firebase.functions.Functions | null = null;
export let firebaseInitializationError: string | null = null;

/**
 * Initializes the Firebase app and all services eagerly when the module is first loaded.
 * This prevents race conditions where parts of the SDK might initialize before the
 * full configuration is provided.
 */
function initializeFirebase() {
    try {
        if (!firebase.apps.length) {
            const app = firebase.initializeApp(firebaseConfig);
            _db = app.firestore();
            _auth = app.auth();
            _storage = app.storage();
            _functions = app.functions('europe-west1');
        } else {
            const app = firebase.app(); // Get existing app
            _db = app.firestore();
            _auth = app.auth();
            _storage = app.storage();
            _functions = app.functions('europe-west1');
        }
    } catch (e: any) {
        console.error("Firebase initialization failed:", e);
        firebaseInitializationError = `Firebase initialization failed: ${e.message}`;
        // Nullify all services on failure.
        _db = null;
        _auth = null;
        _storage = null;
        _functions = null;
    }
}

// Eagerly initialize Firebase as soon as this module is imported.
initializeFirebase();


// Getter functions now just return the pre-initialized instance, throwing if init failed.

export function getDb(): firebase.firestore.Firestore {
    if (!_db) {
        throw new Error("Firebase Firestore is not initialized. Check firebaseInitializationError for details.");
    }
    return _db;
}

export function getAuth(): firebase.auth.Auth {
    if (!_auth) {
        throw new Error("Firebase Auth is not initialized. Check firebaseInitializationError for details.");
    }
    return _auth;
}

export function getStorage(): firebase.storage.Storage {
    if (!_storage) {
        throw new Error("Firebase Storage is not initialized.");
    }
    return _storage;
}

export function getFunctions(): firebase.functions.Functions {
    if (!_functions) {
        // Attempt lazy recovery if app exists but functions wasn't captured
        try {
            if (firebase.apps.length) {
                _functions = firebase.app().functions('europe-west1');
                return _functions;
            }
        } catch (e) {
            console.error("Lazy functions init failed", e);
        }
        throw new Error("Firebase Functions is not initialized.");
    }
    return _functions;
}
