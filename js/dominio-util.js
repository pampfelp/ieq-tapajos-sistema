/*
  Helpers de domínio (não genéricos o bastante pra ir no shared.js
  portável) — cálculo de ocorrências esperadas com status
  realizada/pendente/atrasada, reaproveitado pela agenda de célula
  (celulas.js) e pelos custos recorrentes (financeiro.js). Mesmo princípio
  visual das parcelas do "Jornada do Milhão" (ver segundo-cerebro/
  padroes/arquitetura.md).
*/

export function primeiraOcorrenciaSemanal(dataInicio, diaSemana) {
  const d = new Date(dataInicio);
  d.setHours(0, 0, 0, 0);
  const diff = (diaSemana - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}
export function proximaSemana(d) {
  const n = new Date(d);
  n.setDate(n.getDate() + 7);
  return n;
}

export function primeiraOcorrenciaMensal(dataInicio, diaVencimento) {
  const d = new Date(dataInicio);
  d.setHours(0, 0, 0, 0);
  d.setDate(Math.min(diaVencimento, diasNoMes(d.getFullYear(), d.getMonth())));
  if (d < dataInicio) return proximoMes(d, diaVencimento);
  return d;
}
export function proximoMes(d, diaVencimento) {
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  n.setDate(Math.min(diaVencimento, diasNoMes(n.getFullYear(), n.getMonth())));
  return n;
}
function diasNoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

/**
 * Gera as ocorrências esperadas de dataInicio até `ateData` (inclusive;
 * default = hoje), cruza com os registros existentes (Map chave ->
 * registro) e classifica cada uma sem registro como:
 *   "agendada"  — data no futuro (ainda não é hora de cobrar)
 *   "pendente"  — data já passou, mas dentro da janela do ciclo atual
 *   "atrasada"  — mais antiga que isso, sem registro
 * Use `ateData` = fim do mês corrente pra mostrar a agenda do mês inteiro
 * (passado + futuro), não só o que já venceu. Mais recente primeiro.
 */
export function calcularOcorrencias({ dataInicio, hoje, ateData, proximaDataFn, chaveFn, registros, janelaPendenteDias }) {
  const limite = ateData || hoje;
  const ocorrencias = [];
  let atual = new Date(dataInicio);
  let guarda = 0;
  while (atual <= limite && guarda < 2000) {
    guarda++;
    const chave = chaveFn(atual);
    const registro = registros.get(chave) || null;
    const diasDesde = (hoje - atual) / 86400000;
    const status = registro ? "realizada" : diasDesde < 0 ? "agendada" : diasDesde <= janelaPendenteDias ? "pendente" : "atrasada";
    ocorrencias.push({ data: new Date(atual), chave, registro, status });
    atual = proximaDataFn(atual);
  }
  return ocorrencias.reverse();
}

/**
 * Filtro de período padrão do sistema (mesma lista em Fluxo de Caixa,
 * Agenda de células, e qualquer tela nova que precisar) — sempre os
 * mesmos rótulos/valores, pra não ter um "7 dias" aqui e "última semana"
 * ali com comportamento diferente.
 */
export const OPCOES_PERIODO = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "15d", label: "Últimos 15 dias" },
  { id: "mes", label: "Este mês" },
  { id: "ano", label: "Este ano" },
  { id: "tudo", label: "Tudo" },
];

export function intervaloDoPeriodo(periodo) {
  const fim = new Date();
  const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
  if (periodo === "hoje") return { inicio: inicioHoje, fim };
  if (periodo === "7d") { const i = new Date(inicioHoje); i.setDate(i.getDate() - 6); return { inicio: i, fim }; }
  if (periodo === "15d") { const i = new Date(inicioHoje); i.setDate(i.getDate() - 14); return { inicio: i, fim }; }
  if (periodo === "ano") return { inicio: new Date(fim.getFullYear(), 0, 1), fim };
  if (periodo === "tudo") return { inicio: new Date(2000, 0, 1), fim: new Date(2100, 0, 1) };
  return { inicio: new Date(fim.getFullYear(), fim.getMonth(), 1), fim }; // "mes" (default)
}

export function rotuloStatusOcorrencia(status) {
  return { realizada: "Realizada", pendente: "Pendente", atrasada: "Atrasada", agendada: "Agendada" }[status] || status;
}
export function corPillStatusOcorrencia(status) {
  return { realizada: "credit", pendente: "warn", atrasada: "debit", agendada: "info" }[status] || "info";
}
