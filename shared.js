/*
  shared.js — kit de utilitários compartilhado entre todas as páginas do
  mesmo projeto (ver decisoes.md #4 e padroes/javascript-patterns.md).

  Carregue em qualquer HTML do projeto com:
    <script type="module" src="./shared.js"></script>
  e importe o que precisar:
    import { toast, abrirModal, fmtMoeda } from "./shared.js";

  Zero build, zero dependência externa além do que o próprio navegador
  oferece nativamente (ES modules, fetch, canvas, crypto).
*/

/* ══════════════════════════ FORMATAÇÃO (kit BR) ══════════════════════════ */

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function fmtMoeda(n) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtData(d) {
  if (!d) return "";
  const date = d?.toDate ? d.toDate() : d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("pt-BR");
}

export function fmtDataHora(d) {
  if (!d) return "";
  const date = d?.toDate ? d.toDate() : d instanceof Date ? d : new Date(d);
  return date.toLocaleString("pt-BR");
}

// Evita o bug clássico de fuso horário: nunca `new Date("2026-01-15")` direto.
export function parseDataLocal(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatarDataISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function gerarId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ══════════════════ MÁSCARAS (CPF/CNPJ) ══════════════════ */
/* Todo campo de CPF/CNPJ tem que ter máscara + limite de dígitos — nunca
   texto livre (regra fixada em 2026-08-21 depois de a Prospecção Rodrigues
   Alves ter deixado o campo de CNPJ sem máscara nem limite). */

export function formatarCNPJ(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "").slice(0, 14);
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function formatarCPF(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "").slice(0, 11);
  return digitos
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/** Liga a máscara num <input>, preservando a posição do cursor. */
export function aplicarMascara(input, formatarFn) {
  input.addEventListener("input", () => {
    const posAntes = input.selectionStart ?? input.value.length;
    const tamAntes = input.value.length;
    input.value = formatarFn(input.value);
    const novaPos = Math.max(0, posAntes + (input.value.length - tamAntes));
    input.setSelectionRange(novaPos, novaPos);
  });
}

/* ══════════════════════════════ ÍCONES ══════════════════════════════ */

/*
  Nunca emoji (ver decisoes.md #5) — sempre SVG inline estilo "feather",
  igual ao sidebar do SolarGreen-ERP: viewBox 24x24, stroke=currentColor,
  stroke-width 1.8, traço fino arredondado. Use dentro de <span class="ico">.
  Adicione mais ícones aqui conforme o projeto precisar, sempre nesse mesmo
  estilo (nunca puxando lib de emoji/ícone colorido).
*/
export const ICONS = {
  lista: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  painel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  excluir: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  pasta: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  lapis: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  mais: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

/* ══════════════════════════════ TOAST ══════════════════════════════ */

let toastContainer;
function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/** tipo: "sucesso" | "erro" | "info" */
export function toast(mensagem, tipo = "info", ms = 5000) {
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = mensagem;
  getToastContainer().appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ══════════════════════════════ MODAL ══════════════════════════════ */

let modalOverlay, modalCard, modalTitulo, modalBody, modalActions;
function ensureModal() {
  if (modalOverlay) return;
  modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-titulo"></h3>
        <button type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-actions"></div>
    </div>`;
  document.body.appendChild(modalOverlay);
  modalCard = modalOverlay.querySelector(".modal-card");
  modalTitulo = modalOverlay.querySelector(".modal-titulo");
  modalBody = modalOverlay.querySelector(".modal-body");
  modalActions = modalOverlay.querySelector(".modal-actions");

  modalOverlay.querySelector("button[aria-label='Fechar']").addEventListener("click", fecharModal);
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) fecharModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalOverlay.classList.contains("open")) fecharModal(); });
}

/**
 * corpoHtml: string HTML (já sanitizada pelo chamador com esc() onde precisar)
 * acoesHtml: string HTML opcional para o rodapé (botões); default = botão Cancelar
 */
export function abrirModal(titulo, corpoHtml, acoesHtml) {
  ensureModal();
  modalTitulo.textContent = titulo;
  modalBody.innerHTML = corpoHtml;
  modalActions.innerHTML = acoesHtml ?? `<span></span><button type="button" class="btn" data-fechar-modal>Cancelar</button>`;
  modalActions.querySelectorAll("[data-fechar-modal]").forEach((b) => b.addEventListener("click", fecharModal));
  modalOverlay.classList.add("open");
  const primeiroCampo = modalBody.querySelector("input, select, textarea");
  if (primeiroCampo) setTimeout(() => primeiroCampo.focus(), 30);
  return modalBody;
}

export function fecharModal() {
  if (modalOverlay) modalOverlay.classList.remove("open");
}

/**
 * Substituto customizado para confirm() nativo — NUNCA use confirm()/alert()
 * do navegador (ver decisoes.md #3). Uso:
 *   if (await confirmar("Excluir este item?")) { ... }
 */
export function confirmar(mensagem, { textoConfirmar = "Excluir", textoCancelar = "Cancelar" } = {}) {
  return new Promise((resolve) => {
    ensureModal();
    abrirModal(
      "Confirmar ação",
      `<p>${esc(mensagem)}</p>`,
      `<button type="button" class="btn" data-cancelar>${esc(textoCancelar)}</button>
       <button type="button" class="btn danger" data-confirmar>${esc(textoConfirmar)}</button>`
    );
    modalActions.querySelector("[data-cancelar]").addEventListener("click", () => { fecharModal(); resolve(false); });
    modalActions.querySelector("[data-confirmar]").addEventListener("click", () => { fecharModal(); resolve(true); });
  });
}

/* ══════════════════ INDICADOR DE SINCRONIZAÇÃO ══════════════════ */

/*
  Bolinha fixa no canto superior direito mostrando se há alterações locais
  ainda não confirmadas pelo servidor. Existe porque, sem isso, o app
  parece funcionar normalmente mesmo quando nada está sincronizando de
  verdade (ex.: Firebase mal configurado, ou sem internet mesmo) — foi
  exatamente isso que causou a perda de ~15 registros no dispositivo de um
  usuário da Prospecção Rodrigues Alves (2026-08-21) antes de existir esse
  indicador.

  Amarelo com número = quantidade de documentos com escrita pendente.
  Verde (check) = tudo confirmado pelo servidor. Clicar abre a lista do que
  está pendente (coleção + resumo do registro).

  Uso: em CADA onSnapshot do projeto, passe { includeMetadataChanges: true }
  (senão o listener não dispara de novo quando um doc deixa de estar
  pendente) e chame rastrearSincronizacao() junto com o render normal:

    onSnapshot(query(collection(db, "itens"), orderBy("createdAt")), { includeMetadataChanges: true }, snap => {
      STATE.itens = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderItens();
      rastrearSincronizacao("itens", snap, d => d.nome);
    }, err => toast(err.message, "erro"));
*/

const _pendentesSync = new Map(); // chave "colecao/id" -> { colecao, resumo }

/**
 * Chame dentro de todo onSnapshot (com includeMetadataChanges: true) pra
 * manter o indicador global de sincronização atualizado.
 * resumoFn(dadosDoDoc) => string curta pra identificar o registro na lista.
 */
export function rastrearSincronizacao(nomeColecao, snap, resumoFn) {
  snap.docs.forEach((d) => {
    const chave = `${nomeColecao}/${d.id}`;
    if (d.metadata.hasPendingWrites) {
      _pendentesSync.set(chave, {
        colecao: nomeColecao,
        resumo: resumoFn ? resumoFn(d.data()) : d.id,
      });
    } else {
      _pendentesSync.delete(chave);
    }
  });
  _renderBadgeSincronizacao();
}

let syncBadgeEl, syncPainelOverlayEl, syncPainelListaEl;
function _ensureBadgeSincronizacao() {
  if (syncBadgeEl) return;

  syncBadgeEl = document.createElement("div");
  syncBadgeEl.className = "sync-badge";
  syncBadgeEl.setAttribute("role", "button");
  syncBadgeEl.setAttribute("aria-label", "Status de sincronização");
  document.body.appendChild(syncBadgeEl);

  syncPainelOverlayEl = document.createElement("div");
  syncPainelOverlayEl.className = "sync-painel-overlay";
  syncPainelOverlayEl.innerHTML = `
    <div class="sync-painel">
      <div class="sync-painel-header">
        <strong>Sincronização</strong>
        <button type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="sync-painel-lista"></div>
    </div>`;
  document.body.appendChild(syncPainelOverlayEl);
  syncPainelListaEl = syncPainelOverlayEl.querySelector(".sync-painel-lista");

  syncBadgeEl.addEventListener("click", () => syncPainelOverlayEl.classList.toggle("open"));
  syncPainelOverlayEl.querySelector("button[aria-label='Fechar']").addEventListener("click", () => syncPainelOverlayEl.classList.remove("open"));
  syncPainelOverlayEl.addEventListener("click", (e) => {
    if (e.target === syncPainelOverlayEl) syncPainelOverlayEl.classList.remove("open");
  });
}

function _renderBadgeSincronizacao() {
  _ensureBadgeSincronizacao();
  const n = _pendentesSync.size;

  syncBadgeEl.classList.toggle("pendente", n > 0);
  syncBadgeEl.innerHTML =
    n > 0
      ? String(n)
      : `<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>`;

  syncPainelListaEl.innerHTML =
    n === 0
      ? `<div class="sync-painel-vazio">Tudo sincronizado.</div>`
      : [..._pendentesSync.values()]
          .map(
            (p) => `
        <div class="sync-item">
          <div class="sync-item-colecao">${esc(p.colecao)}</div>
          <div>${esc(p.resumo)}</div>
        </div>`
          )
          .join("");
}

/** Opcional: chame no bootstrap se quiser o badge visível (verde) mesmo
 * antes do primeiro onSnapshot disparar — senão ele aparece sozinho na
 * primeira chamada de rastrearSincronizacao(). */
export function iniciarBadgeSincronizacao() {
  _ensureBadgeSincronizacao();
  _renderBadgeSincronizacao();
}

/* ══════════════════════ ESCRITA OTIMISTA ══════════════════════ */

/**
 * Padrão "emSegundoPlano" (CRM Oliveira): a UI já foi atualizada localmente
 * ANTES de chamar esta função. Se a promise falhar, mostra toast de erro e
 * roda `aoFalhar` (normalmente: recarregar dados do servidor).
 */
export async function emSegundoPlano(promise, mensagemErro, aoFalhar) {
  try {
    await promise;
  } catch (err) {
    toast(mensagemErro || err.message || "Falha ao salvar", "erro");
    if (aoFalhar) await aoFalhar(err);
  }
}

/**
 * Controle de concorrência anti-race-condition (padrão SGEpoca do
 * SolarGreen-ERP): evita que uma resposta de fetch/busca antiga sobrescreva
 * uma edição otimista mais recente.
 *   const epoca = criarEpoca();
 *   const minhaEpoca = epoca.marcar();
 *   fetch(...).then(dados => { if (epoca.valida(minhaEpoca)) render(dados); });
 */
export function criarEpoca() {
  let atual = 0;
  return {
    marcar: () => ++atual,
    valida: (capturada) => capturada === atual,
    atual: () => atual,
  };
}

/* ══════════════════════ IMAGEM (compressão antes do upload) ══════════════════════ */

export function resizeImageFile(file, maxSide = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ══════════════════════ DRAG-AND-DROP (Kanban, Pointer Events) ══════════════════════ */

/**
 * Drag-and-drop genérico via Pointer Events — funciona com mouse, touch e
 * caneta no mesmo código (padrão do CRM Oliveira). Long-press em touch pra
 * não conflitar com scroll vertical.
 *
 * options:
 *   itemSelector: seletor dos elementos arrastáveis (ex.: ".kanban-card")
 *   colunaSelector: seletor das colunas soltáveis (ex.: ".kanban-coluna")
 *   onDrop(itemEl, colunaEl): chamado quando um item é solto numa coluna
 */
export function iniciarDragDropKanban(container, { itemSelector, colunaSelector, onDrop, longPressMs = 380, distanciaMinima = 8 }) {
  let pendente = null; // { item, pointerId, startX, startY, isTouch, timer }
  let dragEl = null;
  let ghost = null;
  let ultimoDragTerminouEm = 0;

  function iniciarDrag(item, x, y) {
    dragEl = item;
    ghost = item.cloneNode(true);
    ghost.style.cssText += `position:fixed;pointer-events:none;opacity:.9;z-index:999;width:${item.offsetWidth}px;`;
    document.body.appendChild(ghost);
    moverGhost(x, y);
    item.classList.add("dragging");
  }

  function moverGhost(x, y) {
    if (ghost) { ghost.style.left = x - ghost.offsetWidth / 2 + "px"; ghost.style.top = y - 20 + "px"; }
  }

  function finalizarDrag(x, y) {
    if (!dragEl) return;
    dragEl.classList.remove("dragging");
    ghost?.remove();
    ghost = null;
    const coluna = document.elementFromPoint(x, y)?.closest(colunaSelector);
    const el = dragEl;
    dragEl = null;
    ultimoDragTerminouEm = Date.now();
    if (coluna) onDrop(el, coluna);
  }

  function cancelarPendente() {
    if (pendente?.timer) clearTimeout(pendente.timer);
    pendente = null;
  }

  /*
    BUG REAL encontrado e corrigido em 2026-08-21 (Prospecção Rodrigues
    Alves): a versão anterior iniciava o arraste direto no pointerdown pro
    mouse, então TODO clique (mesmo parado) virava um "solto na própria
    coluna" e marcava foiDragRecente() como true — bloqueando pra sempre o
    clique abrir o detalhe do card. Agora só vira arraste depois que o
    ponteiro se move além de `distanciaMinima` (mouse) ou depois do
    long-press (toque); um clique parado nunca chama iniciarDrag().
  */
  container.addEventListener("pointerdown", (e) => {
    const item = e.target.closest(itemSelector);
    if (!item || (e.pointerType === "mouse" && e.button !== 0)) return;
    cancelarPendente();
    const isTouch = e.pointerType === "touch";
    pendente = { item, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, isTouch, timer: null };
    if (isTouch) {
      pendente.timer = setTimeout(() => {
        if (pendente) { iniciarDrag(pendente.item, pendente.startX, pendente.startY); pendente = null; }
      }, longPressMs);
    }
  });

  container.addEventListener("pointermove", (e) => {
    if (pendente && e.pointerId === pendente.pointerId && !dragEl) {
      const dx = e.clientX - pendente.startX;
      const dy = e.clientY - pendente.startY;
      if (pendente.isTouch) {
        // ainda esperando o long-press: qualquer movimento é intenção de
        // rolar, não de arrastar — cancela e deixa o navegador rolar normal.
        if (pendente.timer && (Math.abs(dx) > distanciaMinima || Math.abs(dy) > distanciaMinima)) cancelarPendente();
        return;
      }
      if (Math.abs(dx) < distanciaMinima && Math.abs(dy) < distanciaMinima) return;
      const item = pendente.item;
      pendente = null;
      iniciarDrag(item, e.clientX, e.clientY);
    }
    if (dragEl) {
      e.preventDefault();
      moverGhost(e.clientX, e.clientY);
    }
  }, { passive: false });

  window.addEventListener("pointerup", (e) => {
    cancelarPendente();
    if (dragEl) finalizarDrag(e.clientX, e.clientY);
  });

  container.addEventListener("pointercancel", () => cancelarPendente());

  // Use isso no handler de click do item pra distinguir clique de arraste:
  return { foiDragRecente: () => Date.now() - ultimoDragTerminouEm < 150 };
}

/* ══════════════════════ PRESENÇA (heartbeat online/offline) ══════════════════════ */

/**
 * Presença aproximada sem Realtime Database: grava um heartbeat periódico
 * num documento de sessão; considera "online" quem atualizou há pouco.
 * Uso:
 *   import { doc, setDoc, serverTimestamp } from ".../firebase-firestore.js";
 *   iniciarHeartbeat(() => setDoc(doc(db,"sessions",meuId), { lastSeen: serverTimestamp() }));
 */
export function iniciarHeartbeat(gravarFn, intervalMs = 10000) {
  gravarFn();
  return setInterval(gravarFn, intervalMs);
}

export function estaOnline(lastSeenDate, thresholdMs = 25000) {
  if (!lastSeenDate) return false;
  const t = lastSeenDate?.toDate ? lastSeenDate.toDate().getTime() : new Date(lastSeenDate).getTime();
  return Date.now() - t < thresholdMs;
}

/* ══════════════════════ NAVEGAÇÃO (sidebar/topbar/drawer) ══════════════════════ */

/**
 * Liga o comportamento padrão de navegação por views (sidebar desktop,
 * drawer mobile). Espera markup com:
 *   <button class="nav-item" data-view="itens">...</button>
 *   <section class="view" id="view-itens">...</section>
 */
export function iniciarNavegacao({ onChange } = {}) {
  const navItems = document.querySelectorAll(".nav-item[data-view]");
  const views = document.querySelectorAll(".view[id^='view-']");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.querySelector(".sidebar-backdrop");

  function irPara(viewId) {
    navItems.forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
    views.forEach((v) => v.classList.toggle("active", v.id === `view-${viewId}`));
    fecharDrawer();
    onChange?.(viewId);
  }

  function fecharDrawer() {
    sidebar?.classList.remove("mobile-open");
    backdrop?.classList.remove("show");
  }

  navItems.forEach((b) => b.addEventListener("click", () => irPara(b.dataset.view)));
  document.querySelector("[data-abrir-menu]")?.addEventListener("click", () => {
    sidebar?.classList.add("mobile-open");
    backdrop?.classList.add("show");
  });
  backdrop?.addEventListener("click", fecharDrawer);

  if (navItems[0]) irPara(navItems[0].dataset.view);
  return { irPara };
}

/* ══════════════════════ PWA — BANNER DE INSTALAÇÃO ══════════════════════ */

export function iniciarBannerInstalacao({ dismissDias = 14 } = {}) {
  const chave = "pwa_install_dismissed_until";
  const dismissedUntil = Number(localStorage.getItem(chave) || 0);
  if (Date.now() < dismissedUntil) return;
  if (window.matchMedia("(display-mode: standalone)").matches) return;

  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    mostrarBanner(async () => {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
  });

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !window.navigator.standalone) {
    mostrarBanner(null, "Toque em Compartilhar e depois em \"Adicionar à Tela de Início\".");
  }

  function mostrarBanner(onInstalar, textoManual) {
    const banner = document.createElement("div");
    banner.className = "toast info";
    banner.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:150;display:flex;justify-content:space-between;align-items:center;gap:12px;";
    banner.innerHTML = `<span>${textoManual || "Instale este app para acesso rápido."}</span>`;
    if (onInstalar) {
      const btn = document.createElement("button");
      btn.className = "btn"; btn.textContent = "Instalar";
      btn.style.cssText = "background:#fff;color:var(--info);";
      btn.addEventListener("click", () => { onInstalar(); banner.remove(); });
      banner.appendChild(btn);
    }
    const fechar = document.createElement("button");
    fechar.textContent = "×"; fechar.style.cssText = "background:none;border:none;color:#fff;font-size:18px;cursor:pointer;";
    fechar.addEventListener("click", () => {
      localStorage.setItem(chave, String(Date.now() + dismissDias * 86400000));
      banner.remove();
    });
    banner.appendChild(fechar);
    document.body.appendChild(banner);
  }
}
