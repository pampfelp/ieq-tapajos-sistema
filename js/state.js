/*
  STATE global único (ver segundo-cerebro/padroes/javascript-patterns.md) —
  cópia local do Firestore, mutada só pelos listeners em tempo real do
  app.js (coleções "core") e do financeiro.js (coleções restritas à
  tesouraria). Cada módulo só LÊ daqui pra renderizar.
*/
export const STATE = {
  pessoas: [],
  departamentos: [],
  supervisoes: [],
  celulas: [],
  cultos: [],
  padraoCultos: [], // [{ diaSemana, nome, horario }]

  // só populado se a pessoa logada for tesoureiro/admin (ver financeiro.js)
  dizimos: [],
  custos: [],
  custosRecorrentes: [],
  relatoriosCelula: [], // via collectionGroup("relatorios") — pra somar oferta de célula no fluxo de caixa
};
