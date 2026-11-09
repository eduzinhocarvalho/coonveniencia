import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth }     from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyAZ1VHCnisyafDqupTPFJpA0pcv4H3Po3c",
  authDomain: "conveniencia-ab892.firebaseapp.com",
  databaseURL: "https://conveniencia-ab892-default-rtdb.firebaseio.com",
  projectId: "conveniencia-ab892",
  storageBucket: "conveniencia-ab892.firebasestorage.app",
  messagingSenderId: "80112411578",
  appId: "1:80112411578:web:52e1b0e2bc78671c7a3383"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);