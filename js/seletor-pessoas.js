/*
  Combobox de busca/autocomplete de pessoas com "+ Cadastrar novo" inline
  (ver segundo-cerebro/padroes/javascript-patterns.md#combobox). Usado no
  relatório de célula e no culto pra convidados/crianças/escala/presentes.
  `celulaIdParaNovaPessoa` é passado quando quem está preenchendo é o líder
  da célula — sem isso, a criação da nova pessoa é negada pelas
  firestore.rules (líder só cria pessoa já vinculada à própria célula).

  O cadastro rápido pede telefone também (não só nome) — sem isso, marcar
  alguém como "presente" ou "convidado" pela primeira vez perde o contato
  da pessoa pra sempre (pedido do Felipe, 2026-08-24).
*/
import { db } from "../firebase-init.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { esc, toast } from "../shared.js";

export function montarSeletorPessoas({ containerEl, todasPessoas, selecionadosIds, tipoNovaPessoa = "visitante", celulaIdParaNovaPessoa = null, faixaEtariaNovaPessoa = null, onChange }) {
  let selecionados = [...selecionadosIds];
  const nomeDe = (id) => todasPessoas.find((p) => p.id === id)?.nome || "(desconhecido)";

  function render() {
    containerEl.innerHTML = `
      <div class="chips-selecao" style="margin-bottom:8px;">
        ${selecionados.map((id) => `<span class="chip selecionado" data-remover-id="${id}">${esc(nomeDe(id))} ✕</span>`).join("") || '<span style="color:var(--ink-faint);font-size:13px;">Nenhum ainda.</span>'}
      </div>
      <div class="combo-wrap">
        <input type="text" placeholder="Buscar pessoa pelo nome..." data-busca-pessoa autocomplete="off" />
        <div class="combo-dropdown" data-dropdown-pessoa></div>
      </div>`;

    containerEl.querySelectorAll("[data-remover-id]").forEach((chip) => chip.addEventListener("click", () => {
      selecionados = selecionados.filter((id) => id !== chip.dataset.removerId);
      onChange(selecionados);
      render();
    }));

    const input = containerEl.querySelector("[data-busca-pessoa]");
    const dropdown = containerEl.querySelector("[data-dropdown-pessoa]");

    function fecharSeForaDoDropdown() {
      setTimeout(() => {
        if (!dropdown.contains(document.activeElement) && document.activeElement !== input) {
          dropdown.classList.remove("open");
        }
      }, 150);
    }

    function mostrarLista() {
      const termo = input.value.trim().toLowerCase();
      const opcoes = todasPessoas.filter((p) => !selecionados.includes(p.id) && (!termo || p.nome.toLowerCase().includes(termo))).slice(0, 30);
      dropdown.innerHTML =
        opcoes.map((p) => `<div class="combo-option" data-id="${p.id}">${esc(p.nome)} <span style="color:var(--ink-faint);">(${p.tipo === "membro" ? "membro" : "visitante"}${p.telefone ? " · " + esc(p.telefone) : ""})</span></div>`).join("") +
        (termo ? `
          <div class="combo-option criar-novo" style="cursor:default;">
            <div style="margin-bottom:6px;">+ Cadastrar "${esc(input.value.trim())}"</div>
            <input type="text" placeholder="Telefone (opcional)" data-novo-telefone style="margin-bottom:6px;" />
            <button type="button" class="btn sm primary" data-confirmar-criar>Cadastrar</button>
          </div>` : "");
      dropdown.classList.add("open");

      dropdown.querySelectorAll("[data-id]").forEach((opt) => opt.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selecionados.push(opt.dataset.id);
        onChange(selecionados);
        input.value = "";
        render();
      }));

      const telefoneInput = dropdown.querySelector("[data-novo-telefone]");
      telefoneInput?.addEventListener("blur", fecharSeForaDoDropdown);
      telefoneInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") dropdown.querySelector("[data-confirmar-criar]")?.click(); });

      dropdown.querySelector("[data-confirmar-criar]")?.addEventListener("click", async () => {
        const nome = input.value.trim();
        if (!nome) return;
        try {
          const telefone = telefoneInput?.value.trim() || "";
          const ref = await addDoc(collection(db, "pessoas"), {
            nome, tipo: tipoNovaPessoa, telefone, endereco: "", dataNascimento: null,
            celulaId: celulaIdParaNovaPessoa, departamentos: [], ehDizimista: false, ehPastor: false,
            faixaEtaria: faixaEtariaNovaPessoa, papeis: [], createdAt: serverTimestamp(),
          });
          todasPessoas.push({ id: ref.id, nome, tipo: tipoNovaPessoa, telefone, celulaId: celulaIdParaNovaPessoa, departamentos: [], faixaEtaria: faixaEtariaNovaPessoa });
          selecionados.push(ref.id);
          onChange(selecionados);
          input.value = "";
          render();
          toast("Pessoa cadastrada.", "sucesso");
        } catch (err) {
          toast(err.message || "Não foi possível cadastrar.", "erro");
        }
      });
    }

    input.addEventListener("focus", () => mostrarLista());
    input.addEventListener("input", () => mostrarLista());
    input.addEventListener("blur", fecharSeForaDoDropdown);
  }

  render();
  return { getSelecionados: () => selecionados };
}
