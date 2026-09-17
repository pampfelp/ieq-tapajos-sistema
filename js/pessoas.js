/*
  Pessoas (membros/visitantes) + Departamentos + Usuários/papéis.
  Ver segundo-cerebro/padroes/design-system.md: modal abre em visualizar,
  nunca formulário permanente na tela, ação bloqueada = botão desabilitado.
*/
import { db } from "../firebase-init.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch, getDocs,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  esc, toast, abrirModal, fecharModal, confirmar, emSegundoPlano, ICONS, gerarId, debounce,
} from "../shared.js";
import { STATE } from "./state.js";
import { AUTH, isAdmin, isTesoureiro, souLiderDeAlgumaCelula, criarLoginParaPessoa, mensagemErroAuth } from "./auth.js";
import { montarComboboxUnico } from "./combobox.js";
import { abrirFormDizimoRapido } from "./financeiro.js";

let ordenacao = { campo: "nome", direcao: "asc" };
let filtros = { busca: "", tipo: "", departamento: "", celula: "" };

export const FAIXAS_ETARIAS = [
  { id: "crianca", label: "Criança" },
  { id: "adolescente", label: "Adolescente" },
  { id: "jovem", label: "Jovem" },
  { id: "adulto", label: "Adulto" },
  { id: "idoso", label: "Idoso" },
];
function nomeFaixaEtaria(id) { return FAIXAS_ETARIAS.find((f) => f.id === id)?.label || "—"; }

function celulasQuePossoAtribuir() {
  if (isAdmin()) return STATE.celulas;
  return AUTH.celulasLideradas;
}

function nomeCelula(celulaId) {
  return STATE.celulas.find((c) => c.id === celulaId)?.nome || "—";
}
function nomesDepartamentos(ids) {
  return (ids || []).map((id) => STATE.departamentos.find((d) => d.id === id)?.nome).filter(Boolean).join(", ") || "—";
}

function podeCriarOuEditarPessoa() { return isAdmin() || souLiderDeAlgumaCelula(); }

/* ===== render ===== */
export function renderPessoas() {
  const podeEditar = podeCriarOuEditarPessoa();
  const btnNova = document.getElementById("btn-nova-pessoa");
  btnNova.disabled = !podeEditar;
  btnNova.title = podeEditar ? "" : "Pastores auxiliares visualizam pessoas, mas só um líder de célula ou o Pastor Geral pode cadastrar.";

  // popular selects de filtro (uma vez que os dados mudarem)
  const selDep = document.getElementById("filtro-pessoas-departamento");
  const depAtual = selDep.value;
  selDep.innerHTML = `<option value="">Todos os departamentos</option>` +
    STATE.departamentos.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  selDep.value = depAtual;

  const selCel = document.getElementById("filtro-pessoas-celula");
  const celAtual = selCel.value;
  selCel.innerHTML = `<option value="">Todas as células</option>` +
    STATE.celulas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");
  selCel.value = celAtual;

  let lista = STATE.pessoas.filter((p) => {
    if (filtros.busca && !p.nome?.toLowerCase().includes(filtros.busca.toLowerCase())) return false;
    if (filtros.tipo && p.tipo !== filtros.tipo) return false;
    if (filtros.departamento && !(p.departamentos || []).includes(filtros.departamento)) return false;
    if (filtros.celula && p.celulaId !== filtros.celula) return false;
    return true;
  });
  lista.sort((a, b) => {
    const va = (a[ordenacao.campo] ?? "").toString().toLowerCase();
    const vb = (b[ordenacao.campo] ?? "").toString().toLowerCase();
    return ordenacao.direcao === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const tbody = document.getElementById("tbody-pessoas");
  document.getElementById("empty-pessoas").style.display = lista.length ? "none" : "block";
  tbody.innerHTML = lista.map((p) => `
    <tr data-id="${p.id}">
      <td>${esc(p.nome)}</td>
      <td><span class="pill ${p.tipo === "membro" ? "info" : "warn"}">${p.tipo === "membro" ? "Membro" : "Visitante"}</span></td>
      <td>${esc(nomeCelula(p.celulaId))}</td>
      <td>${esc(nomesDepartamentos(p.departamentos))}</td>
      <td>${p.ehDizimista ? `<span class="pill credit">Sim</span>` : "—"}</td>
      <td style="text-align:right;"><button class="btn-icone" data-ver="${p.id}" aria-label="Ver"><span class="ico">${ICONS.lapis}</span></button></td>
    </tr>`).join("");

  tbody.querySelectorAll("[data-ver]").forEach((btn) => btn.addEventListener("click", (e) => { e.stopPropagation(); abrirVisualizarPessoa(btn.dataset.ver); }));
  tbody.querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    abrirVisualizarPessoa(tr.dataset.id);
  }));

  // KPIs simples
  const kpi = document.getElementById("kpi-pessoas");
  const totalMembros = STATE.pessoas.filter((p) => p.tipo === "membro").length;
  const totalVisitantes = STATE.pessoas.filter((p) => p.tipo === "visitante").length;
  const totalDizimistas = STATE.pessoas.filter((p) => p.ehDizimista).length;
  kpi.innerHTML = `
    <div class="kpi-card"><div class="valor num">${STATE.pessoas.length}</div><div class="label">Total de pessoas</div></div>
    <div class="kpi-card"><div class="valor num">${totalMembros}</div><div class="label">Membros</div></div>
    <div class="kpi-card"><div class="valor num">${totalVisitantes}</div><div class="label">Visitantes</div></div>
    <div class="kpi-card"><div class="valor num">${totalDizimistas}</div><div class="label">Dizimistas</div></div>`;
}

/* ===== eventos estáticos ===== */
export function iniciarPessoasEventos() {
  document.getElementById("btn-nova-pessoa").addEventListener("click", () => abrirFormPessoa(null));

  document.getElementById("filtro-pessoas-busca").addEventListener("input", debounce((e) => {
    filtros.busca = e.target.value; renderPessoas();
  }, 200));
  document.getElementById("filtro-pessoas-tipo").addEventListener("change", (e) => { filtros.tipo = e.target.value; renderPessoas(); });
  document.getElementById("filtro-pessoas-departamento").addEventListener("change", (e) => { filtros.departamento = e.target.value; renderPessoas(); });
  document.getElementById("filtro-pessoas-celula").addEventListener("change", (e) => { filtros.celula = e.target.value; renderPessoas(); });

  document.querySelector('#view-pessoas th[data-sort="nome"]').addEventListener("click", (e) => {
    ordenacao.direcao = ordenacao.direcao === "asc" ? "desc" : "asc";
    e.currentTarget.classList.toggle("asc", ordenacao.direcao === "asc");
    e.currentTarget.classList.toggle("desc", ordenacao.direcao === "desc");
    renderPessoas();
  });
}

/* ===== visualizar / editar pessoa ===== */
function abrirVisualizarPessoa(id) {
  const p = STATE.pessoas.find((x) => x.id === id);
  if (!p) return;
  const corpo = abrirModal(p.nome, `
    <div class="field"><label>Tipo</label><div>${p.tipo === "membro" ? "Membro" : "Visitante"}</div></div>
    <div class="field-grid">
      <div class="field"><label>Telefone</label><div>${esc(p.telefone) || "—"}</div></div>
      <div class="field"><label>Data de nascimento</label><div>${p.dataNascimento || "—"}</div></div>
    </div>
    <div class="field"><label>Endereço</label><div>${esc(p.endereco) || "—"}</div></div>
    <div class="field"><label>Célula</label><div>${esc(nomeCelula(p.celulaId))}</div></div>
    <div class="field"><label>Faixa etária</label><div>${nomeFaixaEtaria(p.faixaEtaria)}</div></div>
    <div class="field"><label>Departamentos</label><div>${esc(nomesDepartamentos(p.departamentos))}</div></div>
    <div class="field"><label>Dizimista</label><div>${p.ehDizimista ? "Sim" : "Não"}</div></div>
    ${p.ehPastor ? `<div class="field"><label>Pastor</label><div>Sim</div></div>` : ""}
  `, `
    <button type="button" class="btn danger" id="btn-excluir-pessoa" ${isAdmin() ? "" : "disabled title=\"Só o admin pode excluir\""}>Excluir</button>
    <span style="display:flex; gap:8px;">
      <button type="button" class="btn" data-fechar-modal>Fechar</button>
      ${isTesoureiro() && p.tipo === "membro" ? `<button type="button" class="btn" id="btn-dizimo-rapido">+ Lançar dízimo</button>` : ""}
      <button type="button" class="btn primary" id="btn-editar-pessoa" ${podeCriarOuEditarPessoa() ? "" : "disabled title=\"Pastores auxiliares visualizam, mas não editam pessoas.\""}>Editar</button>
    </span>
  `);
  corpo.parentElement.querySelector("#btn-editar-pessoa").addEventListener("click", () => abrirFormPessoa(p));
  corpo.parentElement.querySelector("#btn-dizimo-rapido")?.addEventListener("click", () => abrirFormDizimoRapido(p));
  corpo.parentElement.querySelector("#btn-excluir-pessoa").addEventListener("click", async () => {
    if (!isAdmin()) return;
    const ok = await confirmar(`Excluir ${p.nome}? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    fecharModal();
    await emSegundoPlano(deleteDoc(doc(db, "pessoas", p.id)), "Não foi possível excluir.");
    toast("Pessoa excluída.", "sucesso");
  });
}

function abrirFormPessoa(pessoaExistente) {
  const editando = !!pessoaExistente;
  const podeGerenciarPapeis = isAdmin();
  const opcoesCelula = celulasQuePossoAtribuir();
  const celulaTravada = !isAdmin() && opcoesCelula.length <= 1;

  const corpo = abrirModal(editando ? "Editar pessoa" : "Nova pessoa", `
    <div class="field"><label for="f-nome">Nome</label><input id="f-nome" type="text" maxlength="150" value="${esc(pessoaExistente?.nome || "")}" /></div>
    <div class="field-grid">
      <div class="field"><label for="f-telefone">Telefone</label><input id="f-telefone" type="text" value="${esc(pessoaExistente?.telefone || "")}" /></div>
      <div class="field"><label for="f-nascimento">Data de nascimento</label><input id="f-nascimento" type="date" value="${pessoaExistente?.dataNascimento || ""}" /></div>
    </div>
    <div class="field"><label for="f-endereco">Endereço</label><input id="f-endereco" type="text" value="${esc(pessoaExistente?.endereco || "")}" /></div>
    <div class="field-grid">
      <div class="field"><label for="f-tipo">Tipo *</label>
        <select id="f-tipo">
          <option value="membro" ${pessoaExistente?.tipo === "membro" || !pessoaExistente ? "selected" : ""}>Membro</option>
          <option value="visitante" ${pessoaExistente?.tipo === "visitante" ? "selected" : ""}>Visitante</option>
        </select>
      </div>
      <div class="field"><label for="f-faixa">Faixa etária</label>
        <select id="f-faixa">
          <option value="">Não informado</option>
          ${FAIXAS_ETARIAS.map((f) => `<option value="${f.id}" ${pessoaExistente?.faixaEtaria === f.id ? "selected" : ""}>${f.label}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field"><label for="combo-celula">Célula * <span style="font-weight:400; color:var(--ink-faint);">(escolha "Nenhuma" se ainda não tiver)</span></label>
      <div id="combo-celula" ${celulaTravada ? 'style="pointer-events:none; opacity:.6;"' : ""}></div>
    </div>
    <div class="field" id="bloco-departamentos">
      <label>Departamentos</label>
      <div class="chips-selecao">${STATE.departamentos.map((d) => `<span class="chip ${(pessoaExistente?.departamentos || []).includes(d.id) ? "selecionado" : ""}" data-dep="${d.id}">${esc(d.nome)}</span>`).join("") || '<span style="color:var(--ink-faint);font-size:13px;">Nenhum departamento cadastrado ainda.</span>'}</div>
    </div>
    <div class="checkbox-linha field"><input type="checkbox" id="f-dizimista" ${pessoaExistente?.ehDizimista ? "checked" : ""} /><label for="f-dizimista">É dizimista</label></div>
    ${podeGerenciarPapeis ? `
    <div class="checkbox-linha field"><input type="checkbox" id="f-pastor" ${pessoaExistente?.ehPastor ? "checked" : ""} /><label for="f-pastor">É pastor</label></div>
    <div class="field"><label>Papéis administrativos</label>
      <div class="chips-selecao">
        <span class="chip ${(pessoaExistente?.papeis || []).includes("admin") ? "selecionado" : ""}" data-papel="admin">Admin (Pastor Geral)</span>
        <span class="chip ${(pessoaExistente?.papeis || []).includes("tesoureiro") ? "selecionado" : ""}" data-papel="tesoureiro">Tesoureiro</span>
      </div>
    </div>` : ""}
  `, `
    <span></span>
    <button type="button" class="btn" data-fechar-modal>Cancelar</button>
    <button type="button" class="btn primary" id="btn-salvar-pessoa">Salvar</button>
  `);

  corpo.querySelectorAll("#bloco-departamentos .chip").forEach((chip) => chip.addEventListener("click", () => chip.classList.toggle("selecionado")));
  corpo.querySelectorAll("[data-papel]").forEach((chip) => chip.addEventListener("click", () => chip.classList.toggle("selecionado")));

  const valorInicialCelula = pessoaExistente?.celulaId || (!editando && opcoesCelula.length === 1 ? opcoesCelula[0].id : null);
  const comboCelula = montarComboboxUnico({
    containerEl: corpo.querySelector("#combo-celula"),
    opcoes: opcoesCelula.map((c) => ({ id: c.id, label: c.nome })),
    valorInicial: valorInicialCelula, permitirVazio: true, textoVazio: "Nenhuma",
    placeholder: "Buscar célula...", onSelecionar: () => {},
  });

  corpo.parentElement.querySelector("#btn-salvar-pessoa").addEventListener("click", async () => {
    const nome = corpo.querySelector("#f-nome").value.trim();
    if (!nome) return toast("Informe o nome.", "erro");
    const celulaId = celulaTravada ? valorInicialCelula : comboCelula.getValor();
    if (!isAdmin() && souLiderDeAlgumaCelula() && !opcoesCelula.some((c) => c.id === celulaId)) {
      return toast("Você só pode atribuir a própria célula.", "erro");
    }

    const dados = {
      nome,
      telefone: corpo.querySelector("#f-telefone").value.trim(),
      endereco: corpo.querySelector("#f-endereco").value.trim(),
      dataNascimento: corpo.querySelector("#f-nascimento").value || null,
      tipo: corpo.querySelector("#f-tipo").value,
      faixaEtaria: corpo.querySelector("#f-faixa").value || null,
      celulaId,
      departamentos: [...corpo.querySelectorAll("#bloco-departamentos .chip.selecionado")].map((c) => c.dataset.dep),
      ehDizimista: corpo.querySelector("#f-dizimista").checked,
    };
    if (podeGerenciarPapeis) {
      dados.ehPastor = corpo.querySelector("#f-pastor").checked;
      dados.papeis = [...corpo.querySelectorAll("[data-papel].selecionado")].map((c) => c.dataset.papel);
    } else if (!editando) {
      dados.ehPastor = false;
      dados.papeis = [];
    }

    fecharModal();
    if (editando) {
      await emSegundoPlano(updateDoc(doc(db, "pessoas", pessoaExistente.id), dados), "Não foi possível salvar.");
    } else {
      await emSegundoPlano(addDoc(collection(db, "pessoas"), { ...dados, createdAt: serverTimestamp() }), "Não foi possível salvar.");
    }
    toast("Pessoa salva.", "sucesso");
  });
}

/* ===== Configurações: Departamentos ===== */
export function abrirGerenciarDepartamentos() {
  let itens = STATE.departamentos.map((d) => ({ ...d }));

  function corpoHtml() {
    return `
      <div class="agenda-lista" id="lista-departamentos">
        ${itens.map((d, i) => `
          <div class="agenda-item" data-idx="${i}">
            <input type="text" value="${esc(d.nome)}" data-campo="nome" style="flex:1; margin-right:10px;" />
            <div style="display:flex; gap:4px;">
              <button class="btn-icone" data-mover="-1" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
              <button class="btn-icone" data-mover="1" ${i === itens.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button>
              <button class="btn-icone" data-remover aria-label="Remover"><span class="ico">${ICONS.excluir}</span></button>
            </div>
          </div>`).join("") || '<p style="color:var(--ink-soft);">Nenhum departamento ainda.</p>'}
      </div>
      <button type="button" class="btn" id="btn-add-departamento" style="margin-top:12px;">+ Novo departamento</button>
    `;
  }

  async function salvar() {
    fecharModal();
    const batch = writeBatch(db);
    const idsAtuais = new Set(STATE.departamentos.map((d) => d.id));
    const idsNovos = new Set();
    itens.forEach((it, i) => {
      idsNovos.add(it.id);
      const ref = it._novo ? doc(collection(db, "departamentos")) : doc(db, "departamentos", it.id);
      batch.set(ref, { nome: it.nome, cor: it.cor || null, ordem: i });
    });
    [...idsAtuais].filter((id) => !idsNovos.has(id)).forEach((id) => batch.delete(doc(db, "departamentos", id)));
    await emSegundoPlano(batch.commit(), "Não foi possível salvar os departamentos.");
    toast("Departamentos salvos.", "sucesso");
  }

  function religar(corpo) {
    corpo.querySelectorAll("[data-campo='nome']").forEach((input, i) => input.addEventListener("input", (e) => { itens[i].nome = e.target.value; }));
    corpo.querySelectorAll("[data-remover]").forEach((btn, i) => btn.addEventListener("click", () => { itens.splice(i, 1); rerender(); }));
    corpo.querySelectorAll("[data-mover]").forEach((btn) => btn.addEventListener("click", () => {
      const idx = Number(btn.closest(".agenda-item").dataset.idx);
      const dir = Number(btn.dataset.mover);
      const alvo = idx + dir;
      if (alvo < 0 || alvo >= itens.length) return;
      [itens[idx], itens[alvo]] = [itens[alvo], itens[idx]];
      rerender();
    }));
    corpo.querySelector("#btn-add-departamento").addEventListener("click", () => {
      itens.push({ id: gerarId(), nome: "", ordem: itens.length, _novo: true });
      rerender();
    });
    corpo.parentElement.querySelector("#btn-salvar-departamentos").addEventListener("click", salvar);
  }

  function rerender() {
    const corpo = abrirModal("Departamentos", corpoHtml(), acoesHtml());
    religar(corpo);
  }
  function acoesHtml() {
    return `<span></span><button type="button" class="btn" data-fechar-modal>Cancelar</button><button type="button" class="btn primary" id="btn-salvar-departamentos">Salvar</button>`;
  }

  rerender();
}

/* ===== Configurações: Usuários e papéis ===== */
export async function abrirGerenciarUsuarios() {
  const usuariosSnap = await getDocs(collection(db, "usuarios"));
  const usuarios = usuariosSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  const pessoasComLogin = new Set(usuarios.map((u) => u.pessoaId));

  const corpo = abrirModal("Usuários e papéis", `
    <div class="field">
      <label>Pessoas com acesso ao sistema</label>
      <div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papéis</th></tr></thead>
        <tbody>
          ${usuarios.map((u) => {
            const p = STATE.pessoas.find((x) => x.id === u.pessoaId);
            return `<tr><td>${esc(p?.nome || "(pessoa não encontrada)")}</td><td>${esc(u.email)}</td><td>${esc((p?.papeis || []).join(", ")) || "—"}</td></tr>`;
          }).join("") || `<tr><td colspan="3" style="color:var(--ink-soft);">Nenhuma conta criada ainda.</td></tr>`}
        </tbody>
      </table></div>
    </div>
    <div class="field">
      <label for="combo-u-pessoa">Criar login para</label>
      <div id="combo-u-pessoa"></div>
    </div>
    <div class="field-grid">
      <div class="field"><label for="u-email">E-mail</label><input id="u-email" type="email" /></div>
      <div class="field"><label for="u-senha">Senha temporária</label><input id="u-senha" type="text" placeholder="mín. 6 caracteres" /></div>
    </div>
  `, `
    <span></span>
    <button type="button" class="btn" data-fechar-modal>Fechar</button>
    <button type="button" class="btn primary" id="btn-criar-login">Criar login</button>
  `);

  const comboPessoaLogin = montarComboboxUnico({
    containerEl: corpo.querySelector("#combo-u-pessoa"),
    opcoes: STATE.pessoas.filter((p) => !pessoasComLogin.has(p.id)).map((p) => ({ id: p.id, label: p.nome })),
    permitirVazio: false, placeholder: "Buscar pessoa...",
    onSelecionar: () => {},
  });

  corpo.parentElement.querySelector("#btn-criar-login").addEventListener("click", async () => {
    const pessoaId = comboPessoaLogin.getValor();
    const email = corpo.querySelector("#u-email").value.trim();
    const senha = corpo.querySelector("#u-senha").value;
    if (!pessoaId || !email || senha.length < 6) {
      return toast("Selecione a pessoa, informe e-mail e senha com pelo menos 6 caracteres.", "erro");
    }
    try {
      await criarLoginParaPessoa(pessoaId, email, senha);
      toast("Login criado.", "sucesso");
      fecharModal();
      abrirGerenciarUsuarios();
    } catch (err) {
      toast(mensagemErroAuth(err), "erro");
    }
  });
}
