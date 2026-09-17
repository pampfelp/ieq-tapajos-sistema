/*
  Painel — KPIs e pendências, conteúdo varia por papel (ver plano). Só lê
  do STATE compartilhado, nunca busca dado extra sozinho.
*/
import { esc, fmtMoeda } from "../shared.js";
import { STATE } from "./state.js";
import { isAdmin, isTesoureiro, souLiderDeAlgumaCelula, souPastorDeAlgumaSupervisao, AUTH } from "./auth.js";
import { primeiraOcorrenciaSemanal, proximaSemana, calcularOcorrencias } from "./dominio-util.js";

function dataDe(d) { return d?.toDate ? d.toDate() : new Date(d); }
function mesmoMes(a, b) { return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear(); }
function fmtDataISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

function kpiCard(valor, label, positivo) {
  return `<div class="kpi-card ${positivo ? "positive" : ""}"><div class="valor num">${valor}</div><div class="label">${esc(label)}</div></div>`;
}

export function renderDashboard() {
  const hoje = new Date();
  const cards = [
    kpiCard(STATE.pessoas.filter((p) => p.tipo === "membro").length, "Membros"),
    kpiCard(STATE.pessoas.filter((p) => p.tipo === "visitante").length, "Visitantes"),
    kpiCard(STATE.celulas.length, "Células"),
    kpiCard(STATE.cultos.filter((c) => mesmoMes(dataDe(c.data), hoje)).length, "Cultos este mês"),
  ];

  if (isTesoureiro()) {
    const dizimoMes = STATE.dizimos.filter((d) => mesmoMes(dataDe(d.data), hoje)).reduce((s, d) => s + (d.valor || 0), 0);
    const ofertaCultoMes = STATE.cultos.filter((c) => mesmoMes(dataDe(c.data), hoje)).reduce((s, c) => s + (c.valorOferta || 0), 0);
    const custosAPagar = STATE.custos.filter((c) => !c.pago).length;
    cards.push(kpiCard(fmtMoeda(dizimoMes), "Dízimos este mês", true));
    cards.push(kpiCard(fmtMoeda(ofertaCultoMes), "Ofertas de culto este mês", true));
    cards.push(kpiCard(custosAPagar, "Custos a pagar"));
  }
  document.getElementById("kpi-dashboard").innerHTML = cards.join("");

  document.getElementById("card-pendencias-dashboard").innerHTML = renderPendencias(hoje);
}

function renderPendencias(hoje) {
  // Só dá pra calcular pendência de TODAS as células com o que já está em
  // STATE (relatoriosCelula só é carregado pra admin/tesoureiro — ver
  // financeiro.js). Pra líder/pastor auxiliar sem esse papel, mostra só a
  // lista das próprias células (o detalhe de pendência já vive na agenda
  // de cada célula, em Células).
  if (isAdmin() || isTesoureiro()) {
    const porCelula = new Map();
    STATE.relatoriosCelula.forEach((r) => {
      if (!porCelula.has(r.celulaId)) porCelula.set(r.celulaId, new Map());
      porCelula.get(r.celulaId).set(r.id, r);
    });

    const atrasadas = [];
    STATE.celulas.forEach((c) => {
      const dataInicio = c.dataInicio?.toDate ? c.dataInicio.toDate() : new Date(c.dataInicio);
      if (isNaN(dataInicio)) return;
      const primeira = primeiraOcorrenciaSemanal(dataInicio, c.diaSemana);
      const registros = porCelula.get(c.id) || new Map();
      const ocorrencias = calcularOcorrencias({ dataInicio: primeira, hoje, proximaDataFn: proximaSemana, chaveFn: fmtDataISO, registros, janelaPendenteDias: 7 });
      const pendente = ocorrencias.find((o) => o.status !== "realizada");
      if (pendente) atrasadas.push({ celula: c, ocorrencia: pendente });
    });

    if (!atrasadas.length) return `<h3 style="margin-bottom:8px;">Pendências</h3><p style="color:var(--ink-soft);">Nenhuma célula com relatório pendente.</p>`;
    return `
      <h3 style="margin-bottom:12px;">Células com relatório pendente</h3>
      <div class="agenda-lista">
        ${atrasadas.map(({ celula, ocorrencia }) => `
          <div class="agenda-item ${ocorrencia.status}">
            <div><strong>${esc(celula.nome)}</strong><div style="font-size:12px; color:var(--ink-soft);">${ocorrencia.data.toLocaleDateString("pt-BR")}</div></div>
            <span class="pill ${ocorrencia.status === "pendente" ? "warn" : "debit"}">${ocorrencia.status === "pendente" ? "Pendente" : "Atrasada"}</span>
          </div>`).join("")}
      </div>`;
  }

  if (souLiderDeAlgumaCelula() || souPastorDeAlgumaSupervisao()) {
    const celulas = isAdmin() ? STATE.celulas : [...AUTH.celulasLideradas, ...STATE.celulas.filter((c) => AUTH.supervisoesQuePastoreia.some((s) => s.id === c.supervisaoId))];
    return `
      <h3 style="margin-bottom:12px;">Minhas células</h3>
      <div class="agenda-lista">
        ${celulas.map((c) => `<div class="agenda-item"><div>${esc(c.nome)}</div><span style="color:var(--ink-soft); font-size:12px;">Veja a agenda em "Células"</span></div>`).join("") || `<p style="color:var(--ink-soft);">Nenhuma célula associada a você ainda.</p>`}
      </div>`;
  }

  return "";
}
