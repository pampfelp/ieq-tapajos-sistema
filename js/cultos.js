/*
  Cultos: geração em lote a partir de um padrão semanal, escalas
  (louvor/dança/diaconato), presença e oferta. Dízimos coletados no culto
  vivem em financeiro.js (top-level, consultável por pessoa).
*/
import { db } from "../firebase-init.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  esc, fmtMoeda, fmtDataHora, formatarDataISO, toast, abrirModal, fecharModal, confirmar, emSegundoPlano, ICONS, gerarId,
} from "../shared.js";
import { STATE } from "./state.js";
import { isAdmin, isTesoureiro } from "./auth.js";
import { montarSeletorPessoas } from "./seletor-pessoas.js";
import { rotuloStatusOcorrencia, corPillStatusOcorrencia } from "./dominio-util.js";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function nomesPessoas(ids) { return (ids || []).map((id) => STATE.pessoas.find((p) => p.id === id)?.nome).filter(Boolean).join(", ") || "—"; }
function dataDoCulto(c) { return c.data?.toDate ? c.data.toDate() : new Date(c.data); }

/*
  Status do culto (agendado/pendente de relatório/realizado): diferente da
  célula, "Gerar cultos do mês" já cria o documento do mês inteiro de uma
  vez — então "esperado" e "existe" colapsam no mesmo doc. O que falta
  sinalizar é só se o relatório (presença/oferta) já foi preenchido depois
  que o culto aconteceu.
*/
function statusCulto(c, hoje) {
  const data = dataDoCulto(c);
  if (data > hoje) return "agendada";
  if ((c.presentes || []).length === 0 && !c.valorOferta) return "pendente";
  return "realizada";
}

/* ===== render ===== */
export function renderCultos() {
  const hoje = new Date();
  const doMes = STATE.cultos.filter((c) => { const d = dataDoCulto(c); return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear(); });
  const somaOfertas = doMes.reduce((s, c) => s + (c.valorOferta || 0), 0);
  const mediaPresentes = doMes.length ? Math.round(doMes.reduce((s, c) => s + (c.presentes || []).length, 0) / doMes.length) : 0;
  const pendentesDoMes = doMes.filter((c) => statusCulto(c, hoje) === "pendente").length;

  document.getElementById("kpi-cultos").innerHTML = `
    <div class="kpi-card"><div class="valor num">${doMes.length}</div><div class="label">Cultos este mês</div></div>
    <div class="kpi-card ${pendentesDoMes ? "negative" : ""}"><div class="valor num">${pendentesDoMes}</div><div class="label">Pendentes de relatório</div></div>
    <div class="kpi-card"><div class="valor num">${mediaPresentes}</div><div class="label">Média de presença</div></div>
    <div class="kpi-card positive"><div class="valor num">${fmtMoeda(somaOfertas)}</div><div class="label">Ofertas este mês</div></div>`;

  const tbody = document.getElementById("tbody-cultos");
  document.getElementById("empty-cultos").style.display = STATE.cultos.length ? "none" : "block";
  tbody.innerHTML = STATE.cultos.map((c) => {
    const dizimoTotal = STATE.dizimos.filter((d) => d.cultoId === c.id).reduce((s, d) => s + (d.valor || 0), 0);
    const status = statusCulto(c, hoje);
    return `
    <tr data-id="${c.id}">
      <td>${fmtDataHora(dataDoCulto(c))}</td>
      <td>${esc(c.nome)}</td>
      <td><span class="pill ${corPillStatusOcorrencia(status)}">${rotuloStatusOcorrencia(status)}</span></td>
      <td class="num">${(c.presentes || []).length}</td>
      <td class="num">${fmtMoeda(c.valorOferta || 0)}</td>
      <td class="num">${isTesoureiro() ? fmtMoeda(dizimoTotal) : "—"}</td>
      <td style="text-align:right;"><button class="btn-icone" data-ver="${c.id}" aria-label="Ver"><span class="ico">${ICONS.painel}</span></button></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    abrirVisualizarCulto(tr.dataset.id);
  }));
}

export function iniciarCultosEventos() {
  document.getElementById("btn-novo-culto").addEventListener("click", () => abrirFormCulto(null));
  document.getElementById("btn-gerar-cultos-mes").addEventListener("click", gerarCultosDoMes);
}

/* ===== visualizar culto ===== */
function abrirVisualizarCulto(id) {
  const c = STATE.cultos.find((x) => x.id === id);
  if (!c) return;
  const dizimoTotal = STATE.dizimos.filter((d) => d.cultoId === c.id).reduce((s, d) => s + (d.valor || 0), 0);
  const corpo = abrirModal(c.nome, `
    <div class="field"><label>Data</label><div>${fmtDataHora(dataDoCulto(c))}</div></div>
    <div class="escala-bloco"><h4>Louvor</h4><div>${esc(nomesPessoas(c.escalaLouvor))}</div></div>
    <div class="escala-bloco"><h4>Dança</h4><div>${esc(nomesPessoas(c.escalaDanca))}</div></div>
    <div class="escala-bloco"><h4>Diaconato</h4><div>${esc(nomesPessoas(c.escalaDiaconato))}</div></div>
    <div class="field-grid">
      <div class="field"><label>Presentes</label><div>${(c.presentes || []).length}</div></div>
      <div class="field"><label>Oferta</label><div>${fmtMoeda(c.valorOferta || 0)}</div></div>
    </div>
    ${isTesoureiro() ? `<div class="field"><label>Dízimo coletado</label><div>${fmtMoeda(dizimoTotal)}</div></div>` : ""}
  `, `
    <button type="button" class="btn danger" id="btn-excluir-culto" ${isAdmin() ? "" : "disabled"}>Excluir</button>
    <span style="display:flex; gap:8px;">
      <button type="button" class="btn" data-fechar-modal>Fechar</button>
      ${isAdmin() ? `<button type="button" class="btn primary" id="btn-editar-culto">Editar</button>` : ""}
    </span>
  `);
  corpo.parentElement.querySelector("#btn-editar-culto")?.addEventListener("click", () => abrirFormCulto(c));
  corpo.parentElement.querySelector("#btn-excluir-culto").addEventListener("click", async () => {
    if (!isAdmin()) return;
    const ok = await confirmar(`Excluir "${c.nome}" de ${fmtDataHora(dataDoCulto(c))}?`);
    if (!ok) return;
    fecharModal();
    await emSegundoPlano(deleteDoc(doc(db, "cultos", c.id)), "Não foi possível excluir.");
    toast("Culto excluído.", "sucesso");
  });
}

/* ===== criar/editar culto ===== */
function valorDatetimeLocal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function abrirFormCulto(cultoExistente) {
  const editando = !!cultoExistente;
  const dataInicial = editando ? dataDoCulto(cultoExistente) : new Date();

  const corpo = abrirModal(editando ? "Editar culto" : "Novo culto", `
    <div class="field-grid">
      <div class="field"><label for="k-nome">Nome</label><input id="k-nome" type="text" value="${esc(cultoExistente?.nome || "")}" placeholder="Ex: Culto de Domingo — Manhã" /></div>
      <div class="field"><label for="k-data">Data e horário</label><input id="k-data" type="datetime-local" value="${valorDatetimeLocal(dataInicial)}" /></div>
    </div>
    <div class="field"><label>Escala — Louvor</label><div id="seletor-louvor"></div></div>
    <div class="field"><label>Escala — Dança</label><div id="seletor-danca"></div></div>
    <div class="field"><label>Escala — Diaconato</label><div id="seletor-diaconato"></div></div>
    <div class="field"><label>Presentes</label><div id="seletor-presentes"></div></div>
    <div class="field"><label for="k-oferta">Valor da oferta</label><input id="k-oferta" type="number" min="0" step="0.01" value="${cultoExistente?.valorOferta ?? ""}" /></div>
  `, `
    <span></span>
    <button type="button" class="btn" data-fechar-modal>Cancelar</button>
    <button type="button" class="btn primary" id="btn-salvar-culto">Salvar</button>
  `);

  const seletores = {
    louvor: montarSeletorPessoas({ containerEl: corpo.querySelector("#seletor-louvor"), todasPessoas: STATE.pessoas, selecionadosIds: cultoExistente?.escalaLouvor || [], tipoNovaPessoa: "membro", onChange: () => {} }),
    danca: montarSeletorPessoas({ containerEl: corpo.querySelector("#seletor-danca"), todasPessoas: STATE.pessoas, selecionadosIds: cultoExistente?.escalaDanca || [], tipoNovaPessoa: "membro", onChange: () => {} }),
    diaconato: montarSeletorPessoas({ containerEl: corpo.querySelector("#seletor-diaconato"), todasPessoas: STATE.pessoas, selecionadosIds: cultoExistente?.escalaDiaconato || [], tipoNovaPessoa: "membro", onChange: () => {} }),
    presentes: montarSeletorPessoas({ containerEl: corpo.querySelector("#seletor-presentes"), todasPessoas: STATE.pessoas, selecionadosIds: cultoExistente?.presentes || [], tipoNovaPessoa: "visitante", onChange: () => {} }),
  };

  corpo.parentElement.querySelector("#btn-salvar-culto").addEventListener("click", async () => {
    const nome = corpo.querySelector("#k-nome").value.trim();
    const dataVal = corpo.querySelector("#k-data").value;
    if (!nome || !dataVal) return toast("Informe nome e data.", "erro");

    const dados = {
      nome, data: new Date(dataVal),
      escalaLouvor: seletores.louvor.getSelecionados(),
      escalaDanca: seletores.danca.getSelecionados(),
      escalaDiaconato: seletores.diaconato.getSelecionados(),
      presentes: seletores.presentes.getSelecionados(),
      valorOferta: Number(corpo.querySelector("#k-oferta").value) || 0,
    };
    fecharModal();
    if (editando) {
      await emSegundoPlano(updateDoc(doc(db, "cultos", cultoExistente.id), dados), "Não foi possível salvar.");
    } else {
      await emSegundoPlano(addDoc(collection(db, "cultos"), { ...dados, createdAt: serverTimestamp() }), "Não foi possível salvar.");
    }
    toast("Culto salvo.", "sucesso");
  });
}

/* ===== gerar cultos do mês a partir do padrão semanal ===== */
async function gerarCultosDoMes() {
  if (!STATE.padraoCultos.length) return toast("Cadastre o padrão semanal de cultos em Configurações primeiro.", "erro");
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const existentes = new Set(STATE.cultos.map((c) => `${formatarDataISO(dataDoCulto(c))}_${c.nome}`));

  const batch = writeBatch(db);
  let count = 0;
  for (let d = new Date(primeiroDia); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
    for (const padrao of STATE.padraoCultos) {
      if (d.getDay() !== padrao.diaSemana) continue;
      const chave = `${formatarDataISO(d)}_${padrao.nome}`;
      if (existentes.has(chave)) continue;
      const dataHora = new Date(d);
      if (padrao.horario) { const [h, m] = padrao.horario.split(":").map(Number); dataHora.setHours(h, m, 0, 0); }
      batch.set(doc(collection(db, "cultos")), {
        data: dataHora, nome: padrao.nome, escalaLouvor: [], escalaDanca: [], escalaDiaconato: [],
        presentes: [], valorOferta: 0, createdAt: serverTimestamp(),
      });
      count++;
    }
  }
  if (count === 0) return toast("Nenhum culto novo para gerar este mês.", "info");
  await emSegundoPlano(batch.commit(), "Não foi possível gerar os cultos.");
  toast(`${count} culto(s) gerado(s) para este mês.`, "sucesso");
}

/* ===== Configurações: padrão semanal de cultos ===== */
export function abrirGerenciarPadraoCultos() {
  let itens = STATE.padraoCultos.map((it) => ({ ...it }));

  function corpoHtml() {
    return `
      <div class="agenda-lista">
        ${itens.map((it, i) => `
          <div class="agenda-item" data-idx="${i}" style="flex-direction:column; align-items:stretch; gap:8px;">
            <div style="display:flex; gap:8px;">
              <input type="text" placeholder="Nome (ex: Culto de Quarta)" value="${esc(it.nome || "")}" data-campo="nome" style="flex:1;" />
              <button class="btn-icone" data-remover aria-label="Remover"><span class="ico">${ICONS.excluir}</span></button>
            </div>
            <div style="display:flex; gap:8px;">
              <select data-campo="diaSemana" style="flex:1;">${DIAS_SEMANA.map((d, di) => `<option value="${di}" ${it.diaSemana === di ? "selected" : ""}>${d}</option>`).join("")}</select>
              <input type="time" data-campo="horario" value="${it.horario || "19:30"}" style="flex:1;" />
            </div>
          </div>`).join("") || '<p style="color:var(--ink-soft);">Nenhum padrão cadastrado ainda.</p>'}
      </div>
      <button type="button" class="btn" id="btn-add-padrao" style="margin-top:12px;">+ Novo</button>
    `;
  }

  async function salvar() {
    fecharModal();
    await emSegundoPlano(
      setDoc(doc(db, "config", "padraoCultos"), { itens: itens.map(({ _novo, ...rest }) => rest) }),
      "Não foi possível salvar o padrão de cultos."
    );
    toast("Padrão de cultos salvo.", "sucesso");
  }

  function religar(corpo) {
    corpo.querySelectorAll("[data-campo='nome']").forEach((input, i) => input.addEventListener("input", (e) => { itens[i].nome = e.target.value; }));
    corpo.querySelectorAll("[data-campo='diaSemana']").forEach((sel, i) => sel.addEventListener("change", (e) => { itens[i].diaSemana = Number(e.target.value); }));
    corpo.querySelectorAll("[data-campo='horario']").forEach((inp, i) => inp.addEventListener("input", (e) => { itens[i].horario = e.target.value; }));
    corpo.querySelectorAll("[data-remover]").forEach((btn, i) => btn.addEventListener("click", () => { itens.splice(i, 1); rerender(); }));
    corpo.querySelector("#btn-add-padrao").addEventListener("click", () => { itens.push({ id: gerarId(), nome: "", diaSemana: 0, horario: "19:30", _novo: true }); rerender(); });
    corpo.parentElement.querySelector("#btn-salvar-padrao").addEventListener("click", salvar);
  }
  function rerender() {
    const corpo = abrirModal("Padrão semanal de cultos", corpoHtml(), `<span></span><button type="button" class="btn" data-fechar-modal>Cancelar</button><button type="button" class="btn primary" id="btn-salvar-padrao">Salvar</button>`);
    religar(corpo);
  }
  rerender();
}
