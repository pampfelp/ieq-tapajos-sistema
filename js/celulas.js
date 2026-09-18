/*
  Supervisões + Células + Agenda (pendências) + Relatório de célula.
  Ver segundo-cerebro/padroes/design-system.md (Kanban/agenda com badge
  pendente/atrasado) e dominio-util.js (cálculo de ocorrências esperadas).
*/
import { db } from "../firebase-init.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDocs, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  esc, fmtMoeda, fmtData, formatarDataISO, parseDataLocal, toast, abrirModal, fecharModal, confirmar, emSegundoPlano, ICONS, gerarId,
} from "../shared.js";
import { STATE } from "./state.js";
import { AUTH, isAdmin, isTesoureiro, souLiderDe } from "./auth.js";
import { montarSeletorPessoas } from "./seletor-pessoas.js";
import { montarComboboxUnico } from "./combobox.js";
import { primeiraOcorrenciaSemanal, proximaSemana, calcularOcorrencias, rotuloStatusOcorrencia, corPillStatusOcorrencia } from "./dominio-util.js";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function membrosDaCelula(celulaId) {
  return STATE.pessoas.filter((p) => p.celulaId === celulaId && p.tipo === "membro");
}
function nomePessoa(id) { return STATE.pessoas.find((p) => p.id === id)?.nome || "—"; }
function nomeSupervisao(id) { return STATE.supervisoes.find((s) => s.id === id)?.nome || "—"; }

function calcularPendenciasCelulas() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const porCelula = new Map();
  STATE.relatoriosCelula.forEach((r) => {
    if (!porCelula.has(r.celulaId)) porCelula.set(r.celulaId, new Map());
    porCelula.get(r.celulaId).set(r.id, r);
  });
  let pendentes = 0, atrasadas = 0;
  STATE.celulas.forEach((c) => {
    const dataInicio = c.dataInicio?.toDate ? c.dataInicio.toDate() : new Date(c.dataInicio);
    if (isNaN(dataInicio)) return;
    const primeira = primeiraOcorrenciaSemanal(dataInicio, c.diaSemana);
    const ocorrencias = calcularOcorrencias({ dataInicio: primeira, hoje, proximaDataFn: proximaSemana, chaveFn: formatarDataISO, registros: porCelula.get(c.id) || new Map(), janelaPendenteDias: 7 });
    const relevante = ocorrencias.find((o) => o.status === "pendente" || o.status === "atrasada");
    if (relevante?.status === "pendente") pendentes++;
    if (relevante?.status === "atrasada") atrasadas++;
  });
  return { pendentes, atrasadas };
}

/* ===== render lista de células ===== */
export function renderCelulas() {
  const kpi = document.getElementById("kpi-celulas");
  const cardsPendencia = isTesoureiro() ? (() => {
    const { pendentes, atrasadas } = calcularPendenciasCelulas();
    return `
      <div class="kpi-card"><div class="valor num">${pendentes}</div><div class="label">Relatórios pendentes este mês</div></div>
      <div class="kpi-card negative"><div class="valor num">${atrasadas}</div><div class="label">Relatórios atrasados</div></div>`;
  })() : "";
  kpi.innerHTML = `
    <div class="kpi-card"><div class="valor num">${STATE.celulas.length}</div><div class="label">Células</div></div>
    <div class="kpi-card"><div class="valor num">${STATE.supervisoes.length}</div><div class="label">Supervisões</div></div>
    ${cardsPendencia}`;

  const tbody = document.getElementById("tbody-celulas");
  document.getElementById("empty-celulas").style.display = STATE.celulas.length ? "none" : "block";
  tbody.innerHTML = STATE.celulas.map((c) => `
    <tr data-id="${c.id}">
      <td>${esc(c.nome)}</td>
      <td>${esc(nomeSupervisao(c.supervisaoId))}</td>
      <td>${esc(nomePessoa(c.liderId))}</td>
      <td>${DIAS_SEMANA[c.diaSemana] ?? "—"}</td>
      <td class="num">${membrosDaCelula(c.id).length}</td>
      <td style="text-align:right;"><button class="btn-icone" data-ver="${c.id}" aria-label="Ver"><span class="ico">${ICONS.painel}</span></button></td>
    </tr>`).join("");

  tbody.querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    abrirVisualizarCelula(tr.dataset.id);
  }));
}

export function iniciarCelulasEventos() {
  document.getElementById("btn-nova-celula").addEventListener("click", () => abrirFormCelula(null));
}

/* ===== Agenda (tela própria, todas as células, filtrada por mês/ano) ===== */
const NOMES_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function iniciarAgendaEventos() {
  const selMes = document.getElementById("filtro-agenda-mes");
  const selAno = document.getElementById("filtro-agenda-ano");
  const hoje = new Date();

  selMes.innerHTML = `<option value="todos">Todos os meses</option>` +
    NOMES_MESES.map((m, i) => `<option value="${i}" ${i === hoje.getMonth() ? "selected" : ""}>${m}</option>`).join("");

  const anoAtual = hoje.getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];
  selAno.innerHTML = anos.map((a) => `<option value="${a}" ${a === anoAtual ? "selected" : ""}>${a}</option>`).join("");

  selMes.addEventListener("change", renderAgendaCelulas);
  selAno.addEventListener("change", renderAgendaCelulas);
  renderAgendaCelulas();
}

function intervaloMesAno() {
  const mes = document.getElementById("filtro-agenda-mes").value;
  const ano = Number(document.getElementById("filtro-agenda-ano").value);
  if (mes === "todos") return { inicio: new Date(ano, 0, 1), fim: new Date(ano, 11, 31, 23, 59, 59) };
  const m = Number(mes);
  return { inicio: new Date(ano, m, 1), fim: new Date(ano, m + 1, 0, 23, 59, 59) };
}

function celulasAcessiveisParaAgenda() {
  if (isAdmin() || isTesoureiro()) return STATE.celulas;
  const idsSupervisao = new Set(AUTH.supervisoesQuePastoreia.map((s) => s.id));
  return STATE.celulas.filter((c) => souLiderDe(c.id) || idsSupervisao.has(c.supervisaoId));
}

/**
 * Monta celulaId -> Map(dataISO -> relatório). Admin/tesoureiro já têm tudo
 * em STATE.relatoriosCelula (collectionGroup, ver financeiro.js); líder/
 * pastor auxiliar buscam sob demanda só das células que podem acessar —
 * evita tentar um collectionGroup que a rule negaria pra eles.
 */
async function montarRegistrosPorCelula(celulas) {
  const mapa = new Map();
  if (isTesoureiro()) {
    STATE.relatoriosCelula.forEach((r) => {
      if (!mapa.has(r.celulaId)) mapa.set(r.celulaId, new Map());
      mapa.get(r.celulaId).set(r.id, r);
    });
    return mapa;
  }
  await Promise.all(celulas.map(async (c) => {
    try {
      const snap = await getDocs(collection(db, "celulas", c.id, "relatorios"));
      const m = new Map();
      snap.docs.forEach((d) => m.set(d.id, { id: d.id, ...d.data() }));
      mapa.set(c.id, m);
    } catch (err) {
      toast(`Agenda de ${c.nome}: ${err.message}`, "erro");
    }
  }));
  return mapa;
}

export async function renderAgendaCelulas() {
  if (!document.getElementById("filtro-agenda-mes")) return; // view ainda não iniciada
  const { inicio, fim } = intervaloMesAno();
  const celulas = celulasAcessiveisParaAgenda();
  const registrosPorCelula = await montarRegistrosPorCelula(celulas);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const linhas = [];
  celulas.forEach((c) => {
    const dataInicio = c.dataInicio?.toDate ? c.dataInicio.toDate() : new Date(c.dataInicio);
    if (isNaN(dataInicio)) return;
    const primeira = primeiraOcorrenciaSemanal(dataInicio, c.diaSemana);
    const ateData = fim > hoje ? fim : hoje; // garante que ocorrências futuras dentro do período apareçam
    const ocorrencias = calcularOcorrencias({
      dataInicio: primeira, hoje, ateData, proximaDataFn: proximaSemana,
      chaveFn: formatarDataISO, registros: registrosPorCelula.get(c.id) || new Map(), janelaPendenteDias: 7,
    });
    ocorrencias.filter((o) => o.data >= inicio && o.data <= fim).forEach((o) => linhas.push({ celula: c, ocorrencia: o }));
  });
  linhas.sort((a, b) => b.ocorrencia.data - a.ocorrencia.data);

  const totalPresentes = linhas.reduce((s, l) => s + (l.ocorrencia.registro?.presencas || []).filter((p) => p.presente).length, 0);
  const totalCriancas = linhas.reduce((s, l) => s + (l.ocorrencia.registro?.criancas || []).length, 0);
  const totalVisitantes = linhas.reduce((s, l) => s + (l.ocorrencia.registro?.convidados || []).length, 0);
  const totalOferta = linhas.reduce((s, l) => s + (l.ocorrencia.registro?.valorOferta || 0), 0);
  document.getElementById("kpi-agenda-celulas").innerHTML = `
    <div class="kpi-card"><div class="valor num">${linhas.length}</div><div class="label">Ocorrências no período</div></div>
    <div class="kpi-card"><div class="valor num">${totalPresentes}</div><div class="label">Membros presentes</div></div>
    <div class="kpi-card"><div class="valor num">${totalCriancas + totalVisitantes}</div><div class="label">Convidados (crianças + visitantes)</div></div>
    <div class="kpi-card positive"><div class="valor num">${fmtMoeda(totalOferta)}</div><div class="label">Ofertas</div></div>`;

  const tbody = document.getElementById("tbody-agenda-celulas");
  document.getElementById("empty-agenda-celulas").style.display = linhas.length ? "none" : "block";
  tbody.innerHTML = linhas.map(({ celula, ocorrencia: o }) => {
    const presentes = (o.registro?.presencas || []).filter((p) => p.presente).length;
    const criancas = (o.registro?.criancas || []).length;
    const convidados = (o.registro?.convidados || []).length;
    return `<tr data-celula="${celula.id}" data-chave="${o.chave}">
      <td>${fmtData(o.data)}</td>
      <td>${esc(celula.nome)}</td>
      <td><span class="pill ${corPillStatusOcorrencia(o.status)}">${rotuloStatusOcorrencia(o.status)}</span></td>
      <td class="num">${membrosDaCelula(celula.id).length}</td>
      <td class="num">${o.registro ? presentes : "—"}</td>
      <td class="num">${o.registro ? criancas : "—"}</td>
      <td class="num">${o.registro ? convidados : "—"}</td>
      <td class="num">${o.registro ? fmtMoeda(o.registro.valorOferta || 0) : "—"}</td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", () => {
    const linha = linhas.find((l) => l.celula.id === tr.dataset.celula && l.ocorrencia.chave === tr.dataset.chave);
    if (linha) abrirFormRelatorio(linha.celula, linha.ocorrencia.chave, linha.ocorrencia.data, linha.ocorrencia.registro);
  }));
}

/* ===== visualizar / editar célula ===== */
function abrirVisualizarCelula(id) {
  const c = STATE.celulas.find((x) => x.id === id);
  if (!c) return;
  const membros = membrosDaCelula(c.id);
  const podeEditarCelula = isAdmin();
  const podeGerenciarMembros = isAdmin() || souLiderDe(c.id);
  const corpo = abrirModal(c.nome, `
    <div class="field-grid">
      <div class="field"><label>Supervisão</label><div>${esc(nomeSupervisao(c.supervisaoId))}</div></div>
      <div class="field"><label>Líder</label><div>${esc(nomePessoa(c.liderId))}</div></div>
    </div>
    <div class="field-grid">
      <div class="field"><label>Dia da célula</label><div>${DIAS_SEMANA[c.diaSemana] ?? "—"} ${c.horario ? "— " + esc(c.horario) : ""}</div></div>
      <div class="field"><label>Endereço</label><div>${esc(c.endereco) || "—"}</div></div>
    </div>
    <div class="field">
      <label>Membros (${membros.length})</label>
      <div class="chips-selecao" id="lista-membros-celula">
        ${membros.map((m) => `<span class="chip selecionado" data-remover-membro="${m.id}" ${podeGerenciarMembros ? "" : "style=\"cursor:default;\""}>${esc(m.nome)}${podeGerenciarMembros ? " ✕" : ""}</span>`).join("") || '<span style="color:var(--ink-faint);font-size:13px;">Nenhum membro ainda.</span>'}
      </div>
      ${podeGerenciarMembros ? `<div id="combo-add-membro" style="margin-top:8px;"></div>` : ""}
    </div>
  `, `
    <button type="button" class="btn danger" id="btn-excluir-celula" ${podeEditarCelula ? "" : "disabled"}>Excluir</button>
    <span style="display:flex; gap:8px;">
      <button type="button" class="btn" data-fechar-modal>Fechar</button>
      ${podeEditarCelula ? `<button type="button" class="btn primary" id="btn-editar-celula">Editar</button>` : ""}
    </span>
  `);

  if (podeGerenciarMembros) {
    corpo.querySelectorAll("[data-remover-membro]").forEach((chip) => chip.addEventListener("click", async () => {
      const pessoaId = chip.dataset.removerMembro;
      const pessoa = STATE.pessoas.find((p) => p.id === pessoaId);
      const ok = await confirmar(`Remover ${pessoa?.nome} da célula "${c.nome}"?`);
      if (!ok) return;
      await emSegundoPlano(updateDoc(doc(db, "pessoas", pessoaId), { celulaId: null }), "Não foi possível remover.");
      toast("Removido da célula.", "sucesso");
      abrirVisualizarCelula(id);
    }));

    montarComboboxUnico({
      containerEl: corpo.querySelector("#combo-add-membro"),
      opcoes: STATE.pessoas.filter((p) => p.celulaId !== c.id).map((p) => ({ id: p.id, label: `${p.nome} (${p.tipo === "membro" ? "membro" : "visitante"})` })),
      permitirVazio: false, placeholder: "Adicionar pessoa à célula...",
      onSelecionar: async (pessoaId) => {
        if (!pessoaId) return;
        await emSegundoPlano(updateDoc(doc(db, "pessoas", pessoaId), { celulaId: c.id }), "Não foi possível adicionar.");
        toast("Adicionado à célula.", "sucesso");
        abrirVisualizarCelula(id);
      },
    });
  }

  corpo.parentElement.querySelector("#btn-editar-celula")?.addEventListener("click", () => abrirFormCelula(c));
  corpo.parentElement.querySelector("#btn-excluir-celula").addEventListener("click", async () => {
    if (!podeEditarCelula) return;
    const ok = await confirmar(`Excluir a célula "${c.nome}"? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    fecharModal();
    await emSegundoPlano(deleteDoc(doc(db, "celulas", c.id)), "Não foi possível excluir.");
    toast("Célula excluída.", "sucesso");
  });
}

function abrirFormCelula(celulaExistente) {
  const editando = !!celulaExistente;
  const membrosPossiveisLider = STATE.pessoas.filter((p) => p.tipo === "membro");
  const corpo = abrirModal(editando ? "Editar célula" : "Nova célula", `
    <div class="field"><label for="c-nome">Nome</label><input id="c-nome" type="text" value="${esc(celulaExistente?.nome || "")}" /></div>
    <div class="field"><label for="c-endereco">Endereço</label><input id="c-endereco" type="text" value="${esc(celulaExistente?.endereco || "")}" /></div>
    <div class="field-grid">
      <div class="field"><label for="c-supervisao">Supervisão *</label><div id="combo-supervisao"></div></div>
      <div class="field"><label for="c-lider">Líder *</label><div id="combo-lider"></div></div>
    </div>
    <div class="field-grid">
      <div class="field"><label for="c-dia">Dia da célula</label>
        <select id="c-dia">${DIAS_SEMANA.map((d, i) => `<option value="${i}" ${(celulaExistente?.diaSemana ?? 4) === i ? "selected" : ""}>${d}</option>`).join("")}</select>
      </div>
      <div class="field"><label for="c-horario">Horário</label><input id="c-horario" type="time" value="${celulaExistente?.horario || "19:30"}" /></div>
    </div>
    <div class="field"><label for="c-inicio">Em funcionamento desde</label><input id="c-inicio" type="date" value="${celulaExistente ? formatarDataISO(celulaExistente.dataInicio?.toDate ? celulaExistente.dataInicio.toDate() : new Date(celulaExistente.dataInicio)) : formatarDataISO(new Date())}" /></div>
  `, `
    <span></span>
    <button type="button" class="btn" data-fechar-modal>Cancelar</button>
    <button type="button" class="btn primary" id="btn-salvar-celula">Salvar</button>
  `);

  const comboSupervisao = montarComboboxUnico({
    containerEl: corpo.querySelector("#combo-supervisao"),
    opcoes: STATE.supervisoes.map((s) => ({ id: s.id, label: s.nome })),
    valorInicial: celulaExistente?.supervisaoId || null,
    permitirVazio: false, placeholder: "Buscar supervisão...",
    onSelecionar: () => {},
  });
  const comboLider = montarComboboxUnico({
    containerEl: corpo.querySelector("#combo-lider"),
    opcoes: membrosPossiveisLider.map((p) => ({ id: p.id, label: p.nome })),
    valorInicial: celulaExistente?.liderId || null,
    permitirVazio: false, placeholder: "Buscar membro...",
    onSelecionar: () => {},
  });

  corpo.parentElement.querySelector("#btn-salvar-celula").addEventListener("click", async () => {
    const nome = corpo.querySelector("#c-nome").value.trim();
    const supervisaoId = comboSupervisao.getValor();
    const liderId = comboLider.getValor();
    if (!nome || !supervisaoId || !liderId) return toast("Preencha nome, supervisão e líder.", "erro");

    const dados = {
      nome,
      endereco: corpo.querySelector("#c-endereco").value.trim(),
      supervisaoId, liderId,
      diaSemana: Number(corpo.querySelector("#c-dia").value),
      horario: corpo.querySelector("#c-horario").value,
      dataInicio: parseDataLocal(corpo.querySelector("#c-inicio").value),
    };
    fecharModal();
    if (editando) {
      await emSegundoPlano(updateDoc(doc(db, "celulas", celulaExistente.id), dados), "Não foi possível salvar.");
    } else {
      await emSegundoPlano(addDoc(collection(db, "celulas"), { ...dados, createdAt: serverTimestamp() }), "Não foi possível salvar.");
    }
    toast("Célula salva.", "sucesso");
  });
}

/* ===== relatório de célula ===== */
function abrirFormRelatorio(celula, dataISO, dataOcorrencia, relatorioExistente) {
  const membros = membrosDaCelula(celula.id);
  const presencasIniciais = new Map((relatorioExistente?.presencas || []).map((p) => [p.pessoaId, p.presente]));
  const podeEditar = isAdmin() || souLiderDe(celula.id);

  const corpo = abrirModal(`Relatório — ${celula.nome} — ${fmtData(dataOcorrencia)}`, `
    <div class="kpi-grid" id="resumo-relatorio" style="margin-bottom:16px;"></div>
    <div class="field">
      <label>Presença (${membros.length} membros esperados)</label>
      <div class="chips-selecao">
        ${membros.map((m) => `<span class="chip ${presencasIniciais.get(m.id) ?? true ? "selecionado" : ""}" data-membro="${m.id}">${esc(m.nome)}</span>`).join("") || '<span style="color:var(--ink-faint);font-size:13px;">Nenhum membro nesta célula ainda.</span>'}
      </div>
    </div>
    <div class="field"><label>Convidados</label><div id="seletor-convidados"></div></div>
    <div class="field"><label>Crianças</label><div id="seletor-criancas"></div></div>
    <div class="field"><label for="r-oferta">Valor da oferta</label><input id="r-oferta" type="number" min="0" step="0.01" value="${relatorioExistente?.valorOferta ?? ""}" /></div>
  `, podeEditar ? `
    <span></span>
    <button type="button" class="btn" data-fechar-modal>Cancelar</button>
    <button type="button" class="btn primary" id="btn-salvar-relatorio">Salvar relatório</button>
  ` : `<span></span><button type="button" class="btn" data-fechar-modal>Fechar</button>`);

  function atualizarResumo() {
    const presentesAgora = corpo.querySelectorAll("[data-membro].selecionado").length;
    const oferta = Number(corpo.querySelector("#r-oferta")?.value) || 0;
    corpo.querySelector("#resumo-relatorio").innerHTML = `
      <div class="kpi-card"><div class="valor num">${presentesAgora}/${membros.length}</div><div class="label">Presentes / esperados</div></div>
      <div class="kpi-card"><div class="valor num">${seletorCriancas ? seletorCriancas.getSelecionados().length : 0}</div><div class="label">Crianças</div></div>
      <div class="kpi-card"><div class="valor num">${seletorConvidados ? seletorConvidados.getSelecionados().length : 0}</div><div class="label">Convidados</div></div>
      <div class="kpi-card positive"><div class="valor num">${fmtMoeda(oferta)}</div><div class="label">Oferta</div></div>`;
  }

  corpo.querySelectorAll("[data-membro]").forEach((chip) => chip.addEventListener("click", () => {
    if (!podeEditar) return;
    chip.classList.toggle("selecionado");
    atualizarResumo();
  }));
  corpo.querySelector("#r-oferta").addEventListener("input", atualizarResumo);

  const seletorConvidados = montarSeletorPessoas({
    containerEl: corpo.querySelector("#seletor-convidados"),
    todasPessoas: STATE.pessoas,
    selecionadosIds: relatorioExistente?.convidados || [],
    tipoNovaPessoa: "visitante",
    celulaIdParaNovaPessoa: celula.id,
    onChange: atualizarResumo,
  });
  const seletorCriancas = montarSeletorPessoas({
    containerEl: corpo.querySelector("#seletor-criancas"),
    todasPessoas: STATE.pessoas,
    selecionadosIds: relatorioExistente?.criancas || [],
    tipoNovaPessoa: "visitante",
    celulaIdParaNovaPessoa: celula.id,
    faixaEtariaNovaPessoa: "crianca",
    onChange: atualizarResumo,
  });

  atualizarResumo();

  if (!podeEditar) return;

  corpo.parentElement.querySelector("#btn-salvar-relatorio").addEventListener("click", async () => {
    const presencas = membros.map((m) => ({ pessoaId: m.id, presente: corpo.querySelector(`[data-membro="${m.id}"]`).classList.contains("selecionado") }));
    const dados = {
      data: dataOcorrencia, celulaId: celula.id,
      presencas,
      convidados: seletorConvidados.getSelecionados(),
      criancas: seletorCriancas.getSelecionados(),
      valorOferta: Number(corpo.querySelector("#r-oferta").value) || 0,
      realizada: true,
      createdAt: relatorioExistente?.createdAt || serverTimestamp(),
      createdBy: AUTH.pessoa?.id || null,
    };
    fecharModal();
    await emSegundoPlano(setDoc(doc(db, "celulas", celula.id, "relatorios", dataISO), dados), "Não foi possível salvar o relatório.");
    toast("Relatório salvo.", "sucesso");
  });
}

/* ===== Configurações: Supervisões ===== */
export function abrirGerenciarSupervisoes() {
  let itens = STATE.supervisoes.map((s) => ({ ...s }));
  const pastores = STATE.pessoas.filter((p) => p.ehPastor);

  function corpoHtml() {
    return `
      <div class="agenda-lista">
        ${itens.map((s, i) => `
          <div class="agenda-item" data-idx="${i}" style="flex-direction:column; align-items:stretch; gap:8px;">
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="text" placeholder="Nome da supervisão" value="${esc(s.nome || "")}" data-campo="nome" style="flex:1;" />
              <button class="btn-icone" data-remover aria-label="Remover"><span class="ico">${ICONS.excluir}</span></button>
            </div>
            <div data-combo-pastor="${i}"></div>
          </div>`).join("") || '<p style="color:var(--ink-soft);">Nenhuma supervisão ainda.</p>'}
      </div>
      <button type="button" class="btn" id="btn-add-supervisao" style="margin-top:12px;">+ Nova supervisão</button>
    `;
  }

  async function salvar() {
    fecharModal();
    const batch = writeBatch(db);
    const idsAtuais = new Set(STATE.supervisoes.map((s) => s.id));
    const idsNovos = new Set();
    itens.forEach((it) => {
      idsNovos.add(it.id);
      const ref = it._novo ? doc(collection(db, "supervisoes")) : doc(db, "supervisoes", it.id);
      batch.set(ref, { nome: it.nome, pastorId: it.pastorId || null });
    });
    [...idsAtuais].filter((id) => !idsNovos.has(id)).forEach((id) => batch.delete(doc(db, "supervisoes", id)));
    await emSegundoPlano(batch.commit(), "Não foi possível salvar as supervisões.");
    toast("Supervisões salvas.", "sucesso");
  }

  function religar(corpo) {
    corpo.querySelectorAll("[data-campo='nome']").forEach((input, i) => input.addEventListener("input", (e) => { itens[i].nome = e.target.value; }));
    corpo.querySelectorAll("[data-combo-pastor]").forEach((el) => {
      const i = Number(el.dataset.comboPastor);
      montarComboboxUnico({
        containerEl: el, opcoes: pastores.map((p) => ({ id: p.id, label: p.nome })),
        valorInicial: itens[i].pastorId || null, permitirVazio: true, textoVazio: "Nenhum ainda",
        placeholder: "Buscar pastor...", onSelecionar: (id) => { itens[i].pastorId = id; },
      });
    });
    corpo.querySelectorAll("[data-remover]").forEach((btn, i) => btn.addEventListener("click", () => { itens.splice(i, 1); rerender(); }));
    corpo.querySelector("#btn-add-supervisao").addEventListener("click", () => { itens.push({ id: gerarId(), nome: "", pastorId: "", _novo: true }); rerender(); });
    corpo.parentElement.querySelector("#btn-salvar-supervisoes").addEventListener("click", salvar);
  }
  function rerender() {
    const corpo = abrirModal("Supervisões", corpoHtml(), `<span></span><button type="button" class="btn" data-fechar-modal>Cancelar</button><button type="button" class="btn primary" id="btn-salvar-supervisoes">Salvar</button>`);
    religar(corpo);
  }
  rerender();
}
