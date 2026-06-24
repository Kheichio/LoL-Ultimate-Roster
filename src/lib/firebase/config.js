// Firebase will be imported from the modular SDK once installed
// For now, use the compat CDN loaded in index.html as a bridge
// Replace with modular imports when ready:
// import { initializeApp } from 'firebase/app';
// import { getAuth } from 'firebase/auth';
// import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
    apiKey: "AIzaSyDJYp1aHd3ndiVfl7fLpjPNFy_JNMM9OzA",
    authDomain: "lol-ultimate-team.firebaseapp.com",
    projectId: "lol-ultimate-team",
};

// Placeholder — wire up once firebase npm package resolves
export let auth = null;
export let db = null;

export function initFirebase() {
    // TODO: Replace with modular SDK
    // const app = initializeApp(firebaseConfig);
    // auth = getAuth(app);
    // db = getFirestore(app);
    console.log('Firebase config ready — wire up modular SDK');
}
