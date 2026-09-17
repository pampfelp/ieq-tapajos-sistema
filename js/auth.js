/*
  Autenticação + papéis (ver plano/decisoes: Auth real, papéis combináveis
  por pessoa). "admin" e "tesoureiro" são atribuídos diretamente em
  pessoas/{id}.papeis; "liderCelula" e "pastorAuxiliar" são DERIVADOS
  observando quem aparece como liderId/pastorId em celulas/supervisoes —
  nunca duplicados, mesmo princípio de "referenciar por ID" do
  segundo-cerebro (dados-e-seguranca.md).
*/

import { db, auth, firebaseConfig } from "../firebase-init.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, updatePassword,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

export const AUTH = {
  pronto: false,       // primeiro carregamento (login+papéis) já resolvido
  user: null,          // objeto do Firebase Auth
  pessoa: null,        // { id, nome, papeis, ehPastor, ehDizimista, celulaId, ... }
  celulasLideradas: [],        // [{ id, nome, supervisaoId, ... }]
  supervisoesQuePastoreia: [], // [{ id, nome, ... }]
};

let _pararListenerPessoa = null;
let _pararListenerCelulas = null;
let _pararListenerSupervisoes = null;
let _onChangeCallback = null;

function _limparListeners() {
  _pararListenerPessoa?.(); _pararListenerPessoa = null;
  _pararListenerCelulas?.(); _pararListenerCelulas = null;
  _pararListenerSupervisoes?.(); _pararListenerSupervisoes = null;
}

/** Chame uma vez no bootstrap do app.js. onChange(AUTH) dispara a cada mudança relevante. */
export function iniciarAuth(onChange) {
  _onChangeCallback = onChange;
  onAuthStateChanged(auth, async (user) => {
    _limparListeners();
    AUTH.user = user;
    AUTH.pessoa = null;
    AUTH.celulasLideradas = [];
    AUTH.supervisoesQuePastoreia = [];

    if (!user) {
      AUTH.pronto = true;
      onChange(AUTH);
      return;
    }

    const usuarioSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (!usuarioSnap.exists()) {
      // Conta existe no Auth mas sem vínculo de pessoa — estado inconsistente,
      // trata como não-logado pra não travar a tela.
      AUTH.pronto = true;
      onChange(AUTH);
      return;
    }
    const pessoaId = usuarioSnap.data().pessoaId;

    _pararListenerPessoa = onSnapshot(doc(db, "pessoas", pessoaId), (snap) => {
      AUTH.pessoa = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      AUTH.pronto = true;
      onChange(AUTH);
    });
    _pararListenerCelulas = onSnapshot(
      query(collection(db, "celulas"), where("liderId", "==", pessoaId)),
      (snap) => { AUTH.celulasLideradas = snap.docs.map((d) => ({ id: d.id, ...d.data() })); onChange(AUTH); }
    );
    _pararListenerSupervisoes = onSnapshot(
      query(collection(db, "supervisoes"), where("pastorId", "==", pessoaId)),
      (snap) => { AUTH.supervisoesQuePastoreia = snap.docs.map((d) => ({ id: d.id, ...d.data() })); onChange(AUTH); }
    );
  });
}

/** Traduz erros comuns do Firebase Auth pra mensagem em português — usado
 * no login, no bootstrap do 1º admin e em "Criar login" (Configurações). */
export function mensagemErroAuth(err) {
  const codigo = err?.code || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(codigo)) {
    return "E-mail ou senha incorretos.";
  }
  if (codigo === "auth/too-many-requests") return "Muitas tentativas. Tente novamente em alguns minutos.";
  if (codigo === "auth/weak-password") return "Senha muito curta (mínimo 6 caracteres).";
  if (codigo === "auth/email-already-in-use") return "Já existe uma conta (de outra pessoa) usando esse e-mail — use um e-mail diferente para esta pessoa.";
  return err?.message || "Não foi possível concluir. Tente novamente.";
}

export function temPapel(papel) { return !!AUTH.pessoa?.papeis?.includes(papel); }
export function isAdmin() { return temPapel("admin"); }
export function isTesoureiro() { return isAdmin() || temPapel("tesoureiro"); }
export function souLiderDe(celulaId) { return AUTH.celulasLideradas.some((c) => c.id === celulaId); }
export function souPastorDe(supervisaoId) { return AUTH.supervisoesQuePastoreia.some((s) => s.id === supervisaoId); }
export function souLiderDeAlgumaCelula() { return AUTH.celulasLideradas.length > 0; }
export function souPastorDeAlgumaSupervisao() { return AUTH.supervisoesQuePastoreia.length > 0; }

export async function login(email, senha) {
  await signInWithEmailAndPassword(auth, email, senha);
}
export async function logout() {
  await signOut(auth);
}
export async function alterarMinhaSenha(novaSenha) {
  await updatePassword(auth.currentUser, novaSenha);
}

/* ===== bootstrap do primeiro admin (Pastor Geral) ===== */

/**
 * Autocorreção: se a pessoa logada já é admin de verdade mas
 * config/bootstrap não reflete isso (ex.: doc nunca chegou a ser criado
 * por causa do bug de regra de 2026-08-24, corrigido nas rules — mas o
 * doc em si não se cria sozinho retroativamente), fecha a janela de
 * bootstrap agora. Idempotente e barata — chamar toda vez que um admin
 * loga não tem custo real.
 */
export async function garantirBootstrapFechado() {
  try {
    const snap = await getDoc(doc(db, "config", "bootstrap"));
    if (!snap.exists() || snap.data().adminCriado !== true) {
      await setDoc(doc(db, "config", "bootstrap"), { adminCriado: true }, { merge: true });
    }
  } catch {
    // Sem permissão ou offline — não é crítico, só não fecha a janela agora.
  }
}

export async function bootstrapNecessario() {
  const snap = await getDoc(doc(db, "config", "bootstrap"));
  return !snap.exists() || snap.data().adminCriado === false;
}

export async function criarPrimeiroAdmin({ nome, email, senha, telefone }) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  const pessoaRef = doc(collection(db, "pessoas"));
  await setDoc(pessoaRef, {
    nome, telefone: telefone || "", tipo: "membro",
    departamentos: [], ehDizimista: false, ehPastor: true,
    papeis: ["admin"], createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "usuarios", cred.user.uid), { pessoaId: pessoaRef.id, email, createdAt: serverTimestamp() });
  await setDoc(doc(db, "config", "bootstrap"), { adminCriado: true }, { merge: true });
}

/*
  Criar login pra uma pessoa que já existe (líder, tesoureiro, pastor
  auxiliar etc) — só admin chama isso (ver botão em pessoas.js). Usa uma
  segunda instância do Firebase App só pra criar o usuário no Auth, sem
  derrubar a sessão do admin (createUserWithEmailAndPassword loga
  automaticamente como o usuário recém-criado na instância em que é
  chamado — por isso usar uma instância descartável separada, nunca a
  `auth` principal). Não usa Cloud Functions nem Admin SDK — só o Web SDK
  duas vezes, dentro do padrão do segundo-cerebro (arquitetura.md#segredos).
*/
export async function criarLoginParaPessoa(pessoaId, email, senhaTemporaria) {
  const nomeInstancia = "secundaria-" + Date.now();
  const appSecundario = initializeApp(firebaseConfig, nomeInstancia);
  const authSecundario = getAuth(appSecundario);
  try {
    const cred = await createUserWithEmailAndPassword(authSecundario, email, senhaTemporaria);
    await setDoc(doc(db, "usuarios", cred.user.uid), { pessoaId, email, createdAt: serverTimestamp() });
    return cred.user.uid;
  } finally {
    await signOut(authSecundario).catch(() => {});
    await deleteApp(appSecundario).catch(() => {});
  }
}

export async function atualizarPapeis(pessoaId, papeis) {
  await updateDoc(doc(db, "pessoas", pessoaId), { papeis });
}
