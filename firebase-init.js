/*
  Inicialização do Firestore + Auth — padrão consolidado (ver
  segundo-cerebro/padroes/arquitetura.md). SDK modular via CDN gstatic, sem
  npm/bundler. Persistência offline ligada (persistentLocalCache) — este
  projeto precisa funcionar sem sinal de verdade (líder de célula em área
  sem sinal), não só ser instalável.

  A config abaixo (apiKey, projectId, etc.) NÃO é segredo — é a config
  pública do Firebase Web SDK, pode ir pro repositório/GitHub Pages sem
  problema. A segurança de verdade vive nas firestore.rules.
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdMK0WGTFHPDjMBo_nQu74-bhw-xcZxNs",
  authDomain: "ieqtapajos-14521.firebaseapp.com",
  projectId: "ieqtapajos-14521",
  storageBucket: "ieqtapajos-14521.firebasestorage.app",
  messagingSenderId: "151257611212",
  appId: "1:151257611212:web:40272f6afbadb5046cfb69",
};

export { firebaseConfig };

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});

export const auth = getAuth(app);

// Emulador local: abrir com ?emulator=1 na URL
if (new URLSearchParams(location.search).get("emulator") === "1") {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099");
  console.log("[firebase-init] usando emulador local do Firestore/Auth");
}
