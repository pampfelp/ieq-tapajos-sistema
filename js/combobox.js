/*
  Combobox de busca/autocomplete de SELEÇÃO ÚNICA (líder, supervisão,
  célula, pessoa de um dízimo, etc.) — nunca <select> nativo pra escolher
  entre uma lista de entidades (Felipe odeia menu suspenso "de lista",
  quer sempre digitar-pra-filtrar, ver segundo-cerebro/padroes/
  design-system.md). Mostra as opções já ao clicar/focar (não só depois de
  digitar) — abre a lista inteira e vai filtrando conforme digita.

  Diferente de seletor-pessoas.js (que é multi-seleção com chips e permite
  cadastrar pessoa nova inline) — este é de UMA escolha só, sobre uma lista
  fixa de opções já existentes.
*/
import { esc } from "../shared.js";

export function montarComboboxUnico({ containerEl, opcoes, valorInicial = null, permitirVazio = true, textoVazio = "Nenhuma", placeholder = "Buscar...", onSelecionar }) {
  let valorAtual = valorInicial;
  let lista = opcoes;

  function labelDe(id) {
    if (!id) return permitirVazio ? textoVazio : "";
    return lista.find((o) => o.id === id)?.label || "";
  }

  containerEl.innerHTML = `
    <div class="combo-wrap">
      <input type="text" placeholder="${esc(placeholder)}" data-combo-input autocomplete="off" />
      <div class="combo-dropdown" data-combo-dropdown></div>
    </div>`;
  const input = containerEl.querySelector("[data-combo-input]");
  const dropdown = containerEl.querySelector("[data-combo-dropdown]");
  input.value = labelDe(valorAtual);

  function mostrarLista(termo) {
    const t = (termo || "").trim().toLowerCase();
    const filtradas = t ? lista.filter((o) => o.label.toLowerCase().includes(t)) : lista;
    let html = "";
    if (permitirVazio && (!t || textoVazio.toLowerCase().includes(t))) {
      html += `<div class="combo-option" data-id="">${esc(textoVazio)}</div>`;
    }
    html += filtradas.map((o) => `<div class="combo-option" data-id="${o.id}">${esc(o.label)}</div>`).join("");
    dropdown.innerHTML = html || `<div class="combo-option" style="color:var(--ink-faint);">Nada encontrado.</div>`;
    dropdown.classList.add("open");
    dropdown.querySelectorAll("[data-id]").forEach((opt) => opt.addEventListener("mousedown", (e) => {
      e.preventDefault();
      valorAtual = opt.dataset.id || null;
      input.value = labelDe(valorAtual);
      dropdown.classList.remove("open");
      onSelecionar(valorAtual);
    }));
  }

  input.addEventListener("focus", () => { input.select(); mostrarLista(""); });
  input.addEventListener("input", () => mostrarLista(input.value));
  input.addEventListener("blur", () => setTimeout(() => {
    dropdown.classList.remove("open");
    input.value = labelDe(valorAtual); // desfaz texto digitado sem escolher nada da lista
  }, 150));

  return {
    getValor: () => valorAtual,
    setOpcoes: (novasOpcoes) => { lista = novasOpcoes; input.value = labelDe(valorAtual); },
  };
}
