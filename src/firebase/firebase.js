// Re-exports the shared Firebase instance initialised in /firebaseConfig.js.
// All src/ code should import from here so there is a single Firebase app
// instance. Never call initializeApp() in this file.
export { app, auth, db, firebaseConfig } from '../../firebaseConfig';
