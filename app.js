/*
  app.js — bootstrap do sistema. Login/bootstrap do 1º admin, listeners das
  coleções "core" (compartilhadas entre módulos), navegação por papel.
  Cada módulo em js/*.js só renderiza a partir do STATE compartilhado
  (js/state.js) — ver segundo-cerebro/padroes/javascript-patterns.md.
*/

import { db } from "./firebase-init.js";
import {
  collection, onSnapshot, query, orderBy, doc,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  toast, iniciarNavegacao, iniciarBannerInstalacao, iniciarBadgeSincronizacao, rastrearSincronizacao,
} from "./shared.js";
import {
  AUTH, iniciarAuth, login, logout, bootstrapNecessario, criarPrimeiroAdmin, mensagemErroAuth, garantirBootstrapFechado,
  isAdmin, isTesoureiro, souLiderDeAlgumaCelula, souPastorDeAlgumaSupervisao,
} from "./js/auth.js";
import { STATE } from "./js/state.js";
import { renderPessoas, iniciarPessoasEventos, abrirGerenciarDepartamentos, abrirGerenciarUsuarios } from "./js/pessoas.js";
import { renderCelulas, iniciarCelulasEventos, abrirGerenciarSupervisoes, iniciarAgendaEventos, renderAgendaCelulas } from "./js/celulas.js";
import { renderCultos, iniciarCultosEventos, abrirGerenciarPadraoCultos } from "./js/cultos.js";
import { iniciarFinanceiro, renderTudoFinanceiro } from "./js/financeiro.js";
import { renderDashboard } from "./js/dashboard.js";

/* ===== telas (login / bootstrap / app) ===== */
function mostrarTela(nome) {
  document.getElementById("tela-login").style.display = nome === "login" ? "flex" : "none";
  document.getElementById("tela-bootstrap").style.display = nome === "bootstrap" ? "flex" : "none";
  document.getElementById("app-shell").style.display = nome === "app" ? "flex" : "none";
}

let telaInicialDecidida = false;
async function decidirTelaInicial() {
  if (telaInicialDecidida) return;
  telaInicialDecidida = true;
  if (AUTH.user) return;
  try {
    // A primeira conexão do SDK do Firestore pode demorar mais que o normal
    // (handshake inicial) — corre contra um timeout pra nunca deixar a tela
    // em branco esperando indefinidamente.
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000));
    const precisaBootstrap = await Promise.race([bootstrapNecessario(), timeout]);
    mostrarTela(precisaBootstrap ? "bootstrap" : "login");
  } catch (err) {
    // Sem conseguir ler config/bootstrap (ex.: firestore.rules ainda não
    // publicada) — mostra o login normal em vez de deixar a tela em branco;
    // o próprio erro de permissão aparece no toast ao tentar entrar.
    mostrarTela("login");
    toast("Não foi possível verificar o status inicial do sistema. Confira se as firestore.rules já foram publicadas.", "erro");
  }
}
decidirTelaInicial();

/* ===== login ===== */
document.getElementById("btn-login").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const erroEl = document.getElementById("login-erro");
  erroEl.textContent = "";
  if (!email || !senha) { erroEl.textContent = "Informe e-mail e senha."; return; }
  try { await login(email, senha); }
  catch (err) { erroEl.textContent = mensagemErroAuth(err); }
});
["login-email", "login-senha"].forEach((id) => {
  document.getElementById(id).addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("btn-login").click(); });
});

/* ===== bootstrap (1ª conta / Pastor Geral) ===== */
document.getElementById("btn-bootstrap").addEventListener("click", async () => {
  const nome = document.getElementById("boot-nome").value.trim();
  const telefone = document.getElementById("boot-telefone").value.trim();
  const email = document.getElementById("boot-email").value.trim();
  const senha = document.getElementById("boot-senha").value;
  const erroEl = document.getElementById("bootstrap-erro");
  erroEl.textContent = "";
  if (!nome || !email || senha.length < 6) {
    erroEl.textContent = "Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.";
    return;
  }
  try {
    await criarPrimeiroAdmin({ nome, email, senha, telefone });
  } catch (err) {
    erroEl.textContent = mensagemErroAuth(err);
  }
});

// Escape hatch: se já existe um admin de verdade mas bootstrapNecessario()
// ficou preso em "true" por algum motivo (ex.: o bug de 2026-08-24, onde a
// última gravação do bootstrap era negada e a conta ficava "invisível" pro
// app), dá pra ir direto pro login sem precisar recriar o Pastor Geral.
document.getElementById("btn-ja-tenho-conta").addEventListener("click", () => mostrarTela("login"));

/* ===== logout ===== */
document.getElementById("btn-logout").addEventListener("click", async () => {
  await logout();
  location.reload();
});

/* ===== navegação filtrada por papel ===== */
function papelPermiteNav(requer) {
  if (requer === "sempre") return true;
  if (requer === "admin") return isAdmin();
  if (requer === "tesoureiro") return isTesoureiro();
  if (requer === "gestaoPessoas") return isAdmin() || souLiderDeAlgumaCelula() || souPastorDeAlgumaSupervisao();
  return false;
}
function aplicarVisibilidadePapel() {
  document.querySelectorAll("[data-requer]").forEach((el) => {
    el.style.display = papelPermiteNav(el.dataset.requer) ? "" : "none";
  });
}

/* ===== listeners "core" (compartilhados entre módulos) ===== */
let coreListenersIniciados = false;
function iniciarCoreListeners() {
  if (coreListenersIniciados) return;
  coreListenersIniciados = true;

  onSnapshot(collection(db, "departamentos"), { includeMetadataChanges: true }, (snap) => {
    STATE.departamentos = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    rastrearSincronizacao("departamentos", snap, (d) => d.nome);
    renderTudoCore();
  }, (err) => toast(`Departamentos: ${err.message}`, "erro"));

  onSnapshot(collection(db, "supervisoes"), { includeMetadataChanges: true }, (snap) => {
    STATE.supervisoes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rastrearSincronizacao("supervisoes", snap, (d) => d.nome);
    renderTudoCore();
  }, (err) => toast(`Supervisões: ${err.message}`, "erro"));

  onSnapshot(collection(db, "celulas"), { includeMetadataChanges: true }, (snap) => {
    STATE.celulas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rastrearSincronizacao("celulas", snap, (d) => d.nome);
    renderTudoCore();
  }, (err) => toast(`Células: ${err.message}`, "erro"));

  onSnapshot(collection(db, "pessoas"), { includeMetadataChanges: true }, (snap) => {
    STATE.pessoas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rastrearSincronizacao("pessoas", snap, (d) => d.nome);
    renderTudoCore();
  }, (err) => toast(`Pessoas: ${err.message}`, "erro"));

  onSnapshot(query(collection(db, "cultos"), orderBy("data", "desc")), { includeMetadataChanges: true }, (snap) => {
    STATE.cultos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rastrearSincronizacao("cultos", snap, (d) => d.nome);
    renderTudoCore();
  }, (err) => toast(`Cultos: ${err.message}`, "erro"));

  onSnapshot(doc(db, "config", "padraoCultos"), (snap) => {
    STATE.padraoCultos = snap.exists() ? snap.data().itens || [] : [];
    renderTudoCore();
  }, (err) => toast(`Padrão de cultos (leitura): ${err.message}`, "erro"));
}

function renderTudoCore() {
  renderPessoas();
  renderCelulas();
  renderCultos();
  renderDashboard();
  if (document.getElementById("view-agenda")?.classList.contains("active")) renderAgendaCelulas();
  // dízimos/custos/ofertas de célula moram no STATE só quando financeiro.js
  // iniciou (tesoureiro/admin) — mas fluxo de caixa e afins dependem TAMBÉM
  // de pessoas/células/cultos "core", então precisam re-renderizar aqui
  // também, não só quando o listener do financeiro dispara (bug real,
  // 2026-08-24: oferta de culto não aparecia no fluxo de caixa até algum
  // dízimo mudar).
  if (financeiroIniciado) renderTudoFinanceiro();
}

/* ===== Configurações (botões) ===== */
function iniciarConfiguracoesEventos() {
  document.getElementById("btn-gerenciar-departamentos").addEventListener("click", abrirGerenciarDepartamentos);
  document.getElementById("btn-gerenciar-supervisoes").addEventListener("click", abrirGerenciarSupervisoes);
  document.getElementById("btn-gerenciar-padrao-cultos").addEventListener("click", abrirGerenciarPadraoCultos);
  document.getElementById("btn-gerenciar-usuarios").addEventListener("click", abrirGerenciarUsuarios);
}

/* ===== orquestração da sessão ===== */
let modulosIniciados = false;
let financeiroIniciado = false;
let bootstrapVerificado = false;

iniciarAuth((auth) => {
  if (!auth.pronto) return;

  if (!auth.user) {
    decidirTelaInicial();
    return;
  }
  if (!auth.pessoa) return; // aguardando o doc de pessoas/{id} carregar

  mostrarTela("app");
  document.getElementById("rodape-nome").textContent = auth.pessoa.nome || "—";
  document.getElementById("rodape-papeis").textContent = [
    isAdmin() ? "Pastor Geral" : null,
    souPastorDeAlgumaSupervisao() ? "Pastor Auxiliar" : null,
    souLiderDeAlgumaCelula() ? "Líder de célula" : null,
    (!isAdmin() && isTesoureiro()) ? "Tesoureiro" : null,
  ].filter(Boolean).join(" · ") || "Membro";

  if (!modulosIniciados) {
    modulosIniciados = true;
    iniciarCoreListeners();
    iniciarPessoasEventos();
    iniciarCelulasEventos();
    iniciarAgendaEventos();
    iniciarCultosEventos();
    iniciarConfiguracoesEventos();
    iniciarNavegacao({ onChange: (viewId) => { if (viewId === "agenda") renderAgendaCelulas(); } });
    iniciarBannerInstalacao();
    iniciarBadgeSincronizacao();
  }
  aplicarVisibilidadePapel();

  if (isTesoureiro() && !financeiroIniciado) {
    financeiroIniciado = true;
    iniciarFinanceiro();
  }

  if (isAdmin() && !bootstrapVerificado) {
    bootstrapVerificado = true;
    garantirBootstrapFechado();
  }
});
