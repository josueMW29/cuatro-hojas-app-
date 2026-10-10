// ============================================================
// firebaseConfig.js — Conexión a Firebase Firestore (SDK web)
// Reemplaza los valores de abajo con los de tu proyecto:
// Firebase Console > Configuración del proyecto > Tus apps > Web (</>)
// ============================================================
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDe2-Aax3yODcYXm2fMZ8ux7IVIQfhK0QY',
  authDomain: 'cuatrohojas-3dfe4.firebaseapp.com',
  projectId: 'cuatrohojas-3dfe4',
  storageBucket: 'cuatrohojas-3dfe4.firebasestorage.app',
  messagingSenderId: '263367341478',
  appId: '1:263367341478:web:0012314ff30efa900bcb67',
};

const app = initializeApp(firebaseConfig);

// Instancia de Firestore que usa App.js
export const db = getFirestore(app);
