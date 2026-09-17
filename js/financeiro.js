/*
  Financeiro: dízimos (lançamento + estatísticas por dizimista), custos
  (avulsos/recorrentes com pendência), fluxo de caixa (agregado
  client-side, sem coleção própria — ver plano/decisões). Só chamado se a
  pessoa logada for tesoureiro/admin (ver app.js).
*/
import { db } from "../firebase-init.js";
import {
  collection, collectionGroup, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  onSnapshot, query, orderBy,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  esc, fmtMoeda, fmtData, parseDataLocal, formatarDataISO, toast, abrirModal, fecharModal, confirmar, emSegundoPlano, rastrearSincronizacao,
} from "../shared.js";
import { STATE } from "./state.js";
import { AUTH } from "./auth.js";
import { montarComboboxUnico } from "./combobox.js";
import { intervaloDoPeriodo } from "./dominio-util.js";

function dataDe(d) { return d?.toDate ? d.toDate() : new Date(d); }
function nomePessoa(id) { return STATE.pessoas.find((p) => p.id === id)?.nome || "—"; }
function nomeCelula(id) { return STATE.celulas.find((c) => c.id === id)?.nome || "—"; }
function mesmoMes(a, b) { return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear(); }
function diasNoMes(ano, mes) { return new Date(ano, mes + 1, 0).getDate(); }

/* ===== bootstrap do módulo (só chamado pra tesoureiro/admin) ===== */
export function iniciarFinanceiro() {
  onSnapshot(query(collection(db, "dizimos"), orderBy("data", "desc")), { includeMetadataChanges: true }, (snap) => {
    STATE.dizimos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rastrearSincronizacao("dizimos", snap, (d) => `${nomePessoa(d.pessoaId)} — ${fmtMoeda(d.valor)}`);
    renderTudoFinanceiro();
  }, (err) => toast(err.message, "erro"));

  onSnapshot(collection(db, "custos"), { includeMetadataChanges: true }, (snap) => {
    STATE.custos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rastrearSincronizacao("custos", snap, (d) => d.nome);
    renderTudoFinanceiro();
  }, (err) => toast(err.message, "erro"));

  onSnapshot(collection(db, "custosRecorrentes"), { includeMetadataChanges: true }, (snap) => {
    STATE.custosRecorrentes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTudoFinanceiro();
  }, (err) => toast(err.message, "erro"));

  onSnapshot(query(collectionGroup(db, "relatorios"), orderBy("data", "desc")), (snap) => {
    STATE.relatoriosCelula = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTudoFinanceiro();
  }, (err) => toast(err.message, "erro"));

  iniciarFinanceiroEventos();
  renderTudoFinanceiro();
}

export function renderTudoFinanceiro() {
  renderDizimos();
  renderCustos();
  renderFluxoCaixa();
}

function iniciarFinanceiroEventos() {
  document.querySelectorAll(".sub-tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".sub-tab").forEach((b) => b.classList.remove("primary"));
    btn.classList.add("primary");
    document.querySelectorAll(".subview").forEach((v) => { v.style.display = "none"; });
    document.getElementById(`subview-${btn.dataset.subtab}`).style.display = "block";
  }));

  document.getElementById("btn-novo-dizimo").addEventListener("click", () => abrirFormDizimo());
  document.getElementById("btn-novo-custo").addEventListener("click", () => abrirFormCusto(null));
  document.getElementById("btn-novo-custo-recorrente").addEventListener("click", () => abrirFormCustoRecorrente(null));
  document.getElementById("btn-gerar-custos-mes").addEventListener("click", gerarCustosRecorrentesDoMes);
  document.getElementById("filtro-fluxo-periodo").addEventListener("change", renderFluxoCaixa);
}

/* ===================== DÍZIMOS ===================== */
function estatisticasDizimo(pessoaId) {
  const lancamentos = STATE.dizimos.filter((d) => d.pessoaId === pessoaId).map((d) => ({ ...d, dataObj: dataDe(d.data) })).sort((a, b) => a.dataObj - b.dataObj);
  if (!lancamentos.length) return { ultimaData: null, mediaValor: 0, previsao: null, diasAtraso: null };

  const ultimaData = lancamentos[lancamentos.length - 1].dataObj;
  const mediaValor = lancamentos.reduce((s, l) => s + (l.valor || 0), 0) / lancamentos.length;

  let mediaIntervalo = null;
  if (lancamentos.length >= 2) {
    const intervalos = [];
    for (let i = 1; i < lancamentos.length; i++) intervalos.push((lancamentos[i].dataObj - lancamentos[i - 1].dataObj) / 86400000);
    mediaIntervalo = intervalos.reduce((s, v) => s + v, 0) / intervalos.length;
  }

  let previsao = null, diasAtraso = null;
  if (mediaIntervalo) {
    previsao = new Date(ultimaData.getTime() + mediaIntervalo * 86400000);
    const hoje = new Date();
    const diff = Math.floor((hoje - previsao) / 86400000);
    if (diff > 0) diasAtraso = diff;
  }
  return { ultimaData, mediaValor, previsao, diasAtraso };
}

function pessoasParaAcompanhar() {
  // "Por dizimista" tem que incluir todo mundo com histórico de dízimo, não
  // só quem está marcado ehDizimista=true — senão um dízimo de alguém não
  // flagado desaparece da tela de acompanhamento (bug real, 2026-08-24).
  const idsComHistorico = new Set(STATE.dizimos.map((d) => d.pessoaId));
  return STATE.pessoas.filter((p) => p.ehDizimista || idsComHistorico.has(p.id));
}

function renderDizimos() {
  const hoje = new Date();
  const doMes = STATE.dizimos.filter((d) => mesmoMes(dataDe(d.data), hoje));
  const somaDoMes = doMes.reduce((s, d) => s + (d.valor || 0), 0);
  const dizimistas = pessoasParaAcompanhar();
  const emAtraso = dizimistas.filter((p) => estatisticasDizimo(p.id).diasAtraso > 0).length;

  document.getElementById("kpi-dizimos").innerHTML = `
    <div class="kpi-card positive"><div class="valor num">${fmtMoeda(somaDoMes)}</div><div class="label">Dízimos este mês</div></div>
    <div class="kpi-card"><div class="valor num">${dizimistas.length}</div><div class="label">Dizimistas acompanhados</div></div>
    <div class="kpi-card negative"><div class="valor num">${emAtraso}</div><div class="label">Em atraso</div></div>`;

  document.getElementById("tbody-dizimos").innerHTML = STATE.dizimos.slice(0, 100).map((d) => `
    <tr>
      <td>${fmtData(dataDe(d.data))}</td>
      <td>${esc(nomePessoa(d.pessoaId))}</td>
      <td class="num">${fmtMoeda(d.valor)}</td>
      <td style="text-align:right;"><button class="btn sm danger" data-excluir="${d.id}">Excluir</button></td>
    </tr>`).join("");
  document.querySelectorAll("#tbody-dizimos [data-excluir]").forEach((btn) => btn.addEventListener("click", async () => {
    const ok = await confirmar("Excluir este lançamento de dízimo?");
    if (!ok) return;
    await emSegundoPlano(deleteDoc(doc(db, "dizimos", btn.dataset.excluir)), "Não foi possível excluir.");
    toast("Lançamento excluído.", "sucesso");
  }));

  document.getElementById("tbody-dizimistas").innerHTML = dizimistas.map((p) => {
    const s = estatisticasDizimo(p.id);
    const status = !s.ultimaData ? `<span class="pill info">Sem histórico</span>`
      : s.diasAtraso ? `<span class="pill debit">${s.diasAtraso}d em atraso</span>`
      : `<span class="pill credit">Em dia</span>`;
    return `<tr>
      <td>${esc(p.nome)}</td>
      <td>${s.ultimaData ? fmtData(s.ultimaData) : "—"}</td>
      <td class="num">${s.ultimaData ? fmtMoeda(s.mediaValor) : "—"}</td>
      <td>${s.previsao ? fmtData(s.previsao) : "—"}</td>
      <td>${status}</td>
    </tr>`;
  }).join("");
}

function abrirFormDizimo(pessoaFixa) {
  const membros = [...STATE.pessoas.filter((p) => p.tipo === "membro")].sort((a, b) => (b.ehDizimista - a.ehDizimista) || a.nome.localeCompare(b.nome));
  const cultosRecentes = STATE.cultos.slice(0, 20);

  const corpo = abrirModal(pessoaFixa ? `Lançar dízimo — ${pessoaFixa.nome}` : "Lançar dízimo", `
    ${pessoaFixa ? "" : `<div class="field"><label for="combo-dz-pessoa">Pessoa *</label><div id="combo-dz-pessoa"></div></div>`}
    <div class="field-grid">
      <div class="field"><label for="dz-valor">Valor</label><input id="dz-valor" type="number" min="0" step="0.01" /></div>
      <div class="field"><label for="dz-data">Data</label><input id="dz-data" type="date" value="${formatarDataISO(new Date())}" /></div>
    </div>
    <div class="field"><label for="combo-dz-culto">Culto (opcional)</label><div id="combo-dz-culto"></div></div>
  `, `<span></span><button type="button" class="btn" data-fechar-modal>Cancelar</button><button type="button" class="btn primary" id="btn-salvar-dizimo">Salvar</button>`);

  const comboPessoa = pessoaFixa ? null : montarComboboxUnico({
    containerEl: corpo.querySelector("#combo-dz-pessoa"),
    opcoes: membros.map((p) => ({ id: p.id, label: p.nome + (p.ehDizimista ? " ★" : "") })),
    permitirVazio: false, placeholder: "Buscar pessoa...",
    onSelecionar: () => {},
  });
  const comboCulto = montarComboboxUnico({
    containerEl: corpo.querySelector("#combo-dz-culto"),
    opcoes: cultosRecentes.map((c) => ({ id: c.id, label: `${fmtData(dataDe(c.data))} — ${c.nome}` })),
    permitirVazio: true, textoVazio: "Nenhum", placeholder: "Buscar culto...",
    onSelecionar: () => {},
  });

  corpo.parentElement.querySelector("#btn-salvar-dizimo").addEventListener("click", async (e) => {
    const pessoaId = pessoaFixa?.id || comboPessoa.getValor();
    const valor = Number(corpo.querySelector("#dz-valor").value);
    if (!pessoaId || !valor) return toast("Selecione a pessoa e informe o valor.", "erro");
    e.currentTarget.disabled = true; // trava duplo-clique — evita lançar o mesmo dízimo 2x
    const dados = {
      pessoaId, valor,
      data: parseDataLocal(corpo.querySelector("#dz-data").value),
      cultoId: comboCulto.getValor(),
      createdAt: serverTimestamp(), createdBy: AUTH.pessoa?.id || null,
    };
    fecharModal();
    await emSegundoPlano(addDoc(collection(db, "dizimos"), dados), "Não foi possível salvar.");
    toast("Dízimo lançado.", "sucesso");
  });
}

/** Atalho: lançar dízimo já com a pessoa fixada (ver botão em pessoas.js). */
export function abrirFormDizimoRapido(pessoa) {
  abrirFormDizimo(pessoa);
}

/* ===================== CUSTOS ===================== */
function renderCustos() {
  const hoje = new Date();
  const doMes = STATE.custos.filter((c) => mesmoMes(dataDe(c.data), hoje));
  const totalAPagar = doMes.filter((c) => !c.pago).reduce((s, c) => s + c.valor, 0);
  const totalPago = doMes.filter((c) => c.pago).reduce((s, c) => s + c.valor, 0);

  document.getElementById("kpi-custos").innerHTML = `
    <div class="kpi-card negative"><div class="valor num">${fmtMoeda(totalAPagar)}</div><div class="label">A pagar este mês</div></div>
    <div class="kpi-card"><div class="valor num">${fmtMoeda(totalPago)}</div><div class="label">Pago este mês</div></div>`;

  const lista = [...STATE.custos].sort((a, b) => dataDe(b.data) - dataDe(a.data));
  document.getElementById("tbody-custos").innerHTML = lista.map((c) => `
    <tr>
      <td>${esc(c.nome)}</td>
      <td>${esc(c.categoria) || "—"}</td>
      <td class="num">${fmtMoeda(c.valor)}</td>
      <td>${fmtData(dataDe(c.data))}</td>
      <td><span class="pill ${c.pago ? "credit" : dataDe(c.data) < hoje ? "debit" : "warn"}">${c.pago ? "Pago" : dataDe(c.data) < hoje ? "Atrasado" : "Pendente"}</span></td>
      <td style="text-align:right; display:flex; gap:6px; justify-content:flex-end;">
        <button class="btn sm" data-pago="${c.id}">${c.pago ? "Marcar não pago" : "Marcar pago"}</button>
        <button class="btn sm" data-editar="${c.id}">Editar</button>
      </td>
    </tr>`).join("");

  document.querySelectorAll("#tbody-custos [data-pago]").forEach((btn) => btn.addEventListener("click", async () => {
    const c = STATE.custos.find((x) => x.id === btn.dataset.pago);
    await emSegundoPlano(updateDoc(doc(db, "custos", c.id), { pago: !c.pago, dataPagamento: !c.pago ? new Date() : null }), "Não foi possível atualizar.");
  }));
  document.querySelectorAll("#tbody-custos [data-editar]").forEach((btn) => btn.addEventListener("click", () => abrirFormCusto(STATE.custos.find((x) => x.id === btn.dataset.editar))));

  const recorrentes = STATE.custosRecorrentes;
  document.getElementById("tbody-custos-recorrentes").innerHTML = recorrentes.map((r) => `
    <tr data-id="${r.id}">
      <td>${esc(r.nome)}</td><td>${esc(r.categoria) || "—"}</td>
      <td class="num">${fmtMoeda(r.valor)}</td><td>Dia ${r.diaVencimento}</td>
      <td>${r.ativo ? `<span class="pill credit">Sim</span>` : `<span class="pill debit">Não</span>`}</td>
      <td style="text-align:right;"><button class="btn sm" data-editar-recorrente="${r.id}">Editar</button></td>
    </tr>`).join("");
  document.querySelectorAll("[data-editar-recorrente]").forEach((btn) => btn.addEventListener("click", () => abrirFormCustoRecorrente(recorrentes.find((x) => x.id === btn.dataset.editarRecorrente))));
}

function abrirFormCusto(custoExistente) {
  const editando = !!custoExistente;
  const corpo = abrirModal(editando ? "Editar custo" : "Novo custo", `
    <div class="field"><label for="cu-nome">Nome</label><input id="cu-nome" type="text" value="${esc(custoExistente?.nome || "")}" /></div>
    <div class="field-grid">
      <div class="field"><label for="cu-valor">Valor</label><input id="cu-valor" type="number" min="0" step="0.01" value="${custoExistente?.valor ?? ""}" /></div>
      <div class="field"><label for="cu-categoria">Categoria</label><input id="cu-categoria" type="text" value="${esc(custoExistente?.categoria || "")}" /></div>
    </div>
    <div class="field"><label for="cu-data">Data</label><input id="cu-data" type="date" value="${custoExistente ? formatarDataISO(dataDe(custoExistente.data)) : formatarDataISO(new Date())}" /></div>
    <div class="checkbox-linha field"><input type="checkbox" id="cu-pago" ${custoExistente?.pago ? "checked" : ""} /><label for="cu-pago">Já pago</label></div>
  `, `
    ${editando ? `<button type="button" class="btn danger" id="btn-excluir-custo">Excluir</button>` : "<span></span>"}
    <span style="display:flex; gap:8px;">
      <button type="button" class="btn" data-fechar-modal>Cancelar</button>
      <button type="button" class="btn primary" id="btn-salvar-custo">Salvar</button>
    </span>
  `);

  corpo.parentElement.querySelector("#btn-excluir-custo")?.addEventListener("click", async () => {
    const ok = await confirmar(`Excluir "${custoExistente.nome}"?`);
    if (!ok) return;
    fecharModal();
    await emSegundoPlano(deleteDoc(doc(db, "custos", custoExistente.id)), "Não foi possível excluir.");
    toast("Custo excluído.", "sucesso");
  });

  corpo.parentElement.querySelector("#btn-salvar-custo").addEventListener("click", async () => {
    const nome = corpo.querySelector("#cu-nome").value.trim();
    const valor = Number(corpo.querySelector("#cu-valor").value);
    if (!nome || !valor) return toast("Informe nome e valor.", "erro");
    const pago = corpo.querySelector("#cu-pago").checked;
    const dados = {
      nome, valor, categoria: corpo.querySelector("#cu-categoria").value.trim() || null,
      data: parseDataLocal(corpo.querySelector("#cu-data").value),
      pago, dataPagamento: pago ? new Date() : null,
    };
    fecharModal();
    if (editando) {
      await emSegundoPlano(updateDoc(doc(db, "custos", custoExistente.id), dados), "Não foi possível salvar.");
    } else {
      await emSegundoPlano(addDoc(collection(db, "custos"), { ...dados, tipo: "avulso", createdAt: serverTimestamp() }), "Não foi possível salvar.");
    }
    toast("Custo salvo.", "sucesso");
  });
}

function abrirFormCustoRecorrente(recorrenteExistente) {
  const editando = !!recorrenteExistente;
  const corpo = abrirModal(editando ? "Editar custo recorrente" : "Novo custo recorrente", `
    <div class="field"><label for="cr-nome">Nome</label><input id="cr-nome" type="text" value="${esc(recorrenteExistente?.nome || "")}" /></div>
    <div class="field-grid">
      <div class="field"><label for="cr-valor">Valor</label><input id="cr-valor" type="number" min="0" step="0.01" value="${recorrenteExistente?.valor ?? ""}" /></div>
      <div class="field"><label for="cr-categoria">Categoria</label><input id="cr-categoria" type="text" value="${esc(recorrenteExistente?.categoria || "")}" /></div>
    </div>
    <div class="field"><label for="cr-dia">Dia de vencimento (1-28)</label><input id="cr-dia" type="number" min="1" max="28" value="${recorrenteExistente?.diaVencimento ?? 5}" /></div>
    <div class="checkbox-linha field"><input type="checkbox" id="cr-ativo" ${recorrenteExistente?.ativo !== false ? "checked" : ""} /><label for="cr-ativo">Ativo</label></div>
  `, `
    ${editando ? `<button type="button" class="btn danger" id="btn-excluir-recorrente">Excluir</button>` : "<span></span>"}
    <span style="display:flex; gap:8px;">
      <button type="button" class="btn" data-fechar-modal>Cancelar</button>
      <button type="button" class="btn primary" id="btn-salvar-recorrente">Salvar</button>
    </span>
  `);

  corpo.parentElement.querySelector("#btn-excluir-recorrente")?.addEventListener("click", async () => {
    const ok = await confirmar(`Excluir "${recorrenteExistente.nome}"? Custos já gerados não são afetados.`);
    if (!ok) return;
    fecharModal();
    await emSegundoPlano(deleteDoc(doc(db, "custosRecorrentes", recorrenteExistente.id)), "Não foi possível excluir.");
    toast("Custo recorrente excluído.", "sucesso");
  });

  corpo.parentElement.querySelector("#btn-salvar-recorrente").addEventListener("click", async () => {
    const nome = corpo.querySelector("#cr-nome").value.trim();
    const valor = Number(corpo.querySelector("#cr-valor").value);
    const diaVencimento = Number(corpo.querySelector("#cr-dia").value);
    if (!nome || !valor || !diaVencimento) return toast("Preencha nome, valor e dia de vencimento.", "erro");
    const dados = { nome, valor, categoria: corpo.querySelector("#cr-categoria").value.trim() || null, diaVencimento, ativo: corpo.querySelector("#cr-ativo").checked };
    fecharModal();
    if (editando) {
      await emSegundoPlano(updateDoc(doc(db, "custosRecorrentes", recorrenteExistente.id), dados), "Não foi possível salvar.");
    } else {
      await emSegundoPlano(addDoc(collection(db, "custosRecorrentes"), dados), "Não foi possível salvar.");
    }
    toast("Custo recorrente salvo.", "sucesso");
  });
}

async function gerarCustosRecorrentesDoMes() {
  const ativos = STATE.custosRecorrentes.filter((r) => r.ativo);
  if (!ativos.length) return toast("Nenhum custo recorrente ativo cadastrado.", "erro");
  const hoje = new Date();
  let count = 0;
  for (const r of ativos) {
    const jaExiste = STATE.custos.some((c) => c.recorrenteOrigemId === r.id && mesmoMes(dataDe(c.data), hoje));
    if (jaExiste) continue;
    const dia = Math.min(r.diaVencimento, diasNoMes(hoje.getFullYear(), hoje.getMonth()));
    const vencimento = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
    await addDoc(collection(db, "custos"), {
      nome: r.nome, valor: r.valor, categoria: r.categoria || null, tipo: "recorrente",
      diaVencimento: r.diaVencimento, recorrenteOrigemId: r.id, data: vencimento,
      pago: false, dataPagamento: null, createdAt: serverTimestamp(),
    });
    count++;
  }
  if (count === 0) return toast("Custos recorrentes deste mês já foram gerados.", "info");
  toast(`${count} custo(s) recorrente(s) gerado(s).`, "sucesso");
}

/* ===================== FLUXO DE CAIXA ===================== */
function dentroPeriodo(d, inicio, fim) { const x = dataDe(d); return x >= inicio && x <= fim; }

function renderFluxoCaixa() {
  const periodo = document.getElementById("filtro-fluxo-periodo").value;
  const { inicio, fim } = intervaloDoPeriodo(periodo);

  const entradas = [
    ...STATE.dizimos.filter((d) => dentroPeriodo(d.data, inicio, fim)).map((d) => ({ data: dataDe(d.data), origem: "Dízimo", descricao: nomePessoa(d.pessoaId), valor: d.valor })),
    ...STATE.cultos.filter((c) => dentroPeriodo(c.data, inicio, fim) && c.valorOferta > 0).map((c) => ({ data: dataDe(c.data), origem: "Oferta de culto", descricao: c.nome, valor: c.valorOferta })),
    ...STATE.relatoriosCelula.filter((r) => dentroPeriodo(r.data, inicio, fim) && r.valorOferta > 0).map((r) => ({ data: dataDe(r.data), origem: "Oferta de célula", descricao: nomeCelula(r.celulaId), valor: r.valorOferta })),
  ];
  const saidas = STATE.custos.filter((c) => c.pago && c.dataPagamento && dentroPeriodo(c.dataPagamento, inicio, fim))
    .map((c) => ({ data: dataDe(c.dataPagamento), origem: "Custo", descricao: c.nome, valor: c.valor }));

  const totalEntradas = entradas.reduce((s, e) => s + e.valor, 0);
  const totalSaidas = saidas.reduce((s, e) => s + e.valor, 0);

  document.getElementById("kpi-fluxo").innerHTML = `
    <div class="kpi-card positive"><div class="valor num">${fmtMoeda(totalEntradas)}</div><div class="label">Entradas</div></div>
    <div class="kpi-card negative"><div class="valor num">${fmtMoeda(totalSaidas)}</div><div class="label">Saídas</div></div>
    <div class="kpi-card ${totalEntradas - totalSaidas >= 0 ? "positive" : "negative"}"><div class="valor num">${fmtMoeda(totalEntradas - totalSaidas)}</div><div class="label">Saldo do período</div></div>`;

  const movimentos = [
    ...entradas.map((e) => ({ ...e, tipo: "entrada" })),
    ...saidas.map((s) => ({ ...s, tipo: "saida" })),
  ].sort((a, b) => b.data - a.data);

  document.getElementById("tbody-fluxo").innerHTML = movimentos.map((m) => `
    <tr>
      <td>${fmtData(m.data)}</td>
      <td><span class="pill ${m.tipo === "entrada" ? "credit" : "debit"}">${m.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
      <td>${esc(m.origem)}</td>
      <td>${esc(m.descricao)}</td>
      <td class="num" style="color:${m.tipo === "entrada" ? "var(--credit)" : "var(--debit)"}">${m.tipo === "entrada" ? "+" : "−"} ${fmtMoeda(m.valor)}</td>
    </tr>`).join("") || `<tr><td colspan="5" style="text-align:center; color:var(--ink-soft);">Nenhuma movimentação no período.</td></tr>`;
}
