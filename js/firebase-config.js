import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// Futuramente, para adicionar Auth ou Firestore, descomente e importe:
// import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCdMRXlHfAs854_rBpHzm3Ohmj0It1aixw",
    authDomain: "triple-fantasy.firebaseapp.com",
    projectId: "triple-fantasy",
    storageBucket: "triple-fantasy.firebasestorage.app",
    messagingSenderId: "328605352427",
    appId: "1:328605352427:web:789ca4799a3f97128919ae"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Inicializa o Firestore
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
const db = getFirestore(app);

// Expõe o app e o db globalmente para facilitar o debug se necessário,
// mas o ideal é importar as funções onde precisar.
window.firebaseApp = app;
window.db = db;

export { app, db };

console.log("Firebase inicializado com sucesso!");
