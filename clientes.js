// /js/clientes.js
import {
  db, $, formatCurrency, showNotification, mainModal,
  state, waitForAuth,
  addDoc, updateDoc, deleteDoc, doc, collection, onSnapshot, query, orderBy, serverTimestamp,
  formatDate
} from "./firebase.js";

export function initClientesTab() {
  const cliNome = $("#cliNome");
  const cliSobrenome = $("#cliSobrenome");
  const cliTelefone = $("#cliTelefone");
  const cliRaclub = $("#cliRaclub");
  const cliSalvarBtn = $("#cliSalvarBtn");
  const cliLimparBtn = $("#cliLimparBtn");
  const clientesTbody = $("#clientesTbody");
  const raclubPayTbody = $("#raclubPayTbody");

  if (!clientesTbody) return;

  function clearForm() {
    if (cliNome) cliNome.value = "";
    if (cliSobrenome) cliSobrenome.value = "";
    if (cliTelefone) cliTelefone.value = "";
    if (cliRaclub) cliRaclub.value = "nao";
  }

  function normalizeClientDoc(id, v) {
    const nome = v.nome || v.name || "";
    const sobrenome = v.sobrenome || v.clienteSobrenome || "";
    const telefone = v.telefone || v.phone || "";
    const clube =
      v.clubeBeleza ||
      v.raclub ||
      v.plano ||
      (v.type === "plano_jc" ? "membro" : "nao") ||
      "nao";

    const isMember =
      clube === "membro" ||
      clube === "ra_club" ||
      clube === "clube_beleza" ||
      clube === "PLANO_RA" ||
      v.type === "plano_jc" ||
      v.isPlan === true;

    return {
      id,
      nome,
      sobrenome,
      telefone,
      clubeBeleza: isMember ? "membro" : "nao",
      status: v.status || v.situacao || (isMember ? "ativo" : "—"),
      createdAt: v.createdAt || null,
    };
  }

  function renderClients() {
    if (!clientesTbody) return;

    const clients = [...(state.allClients || [])].sort((a, b) =>
      (a.nome || "").localeCompare(b.nome || "", "pt-BR")
    );

    if (!clients.length) {
      clientesTbody.innerHTML = `
        <tr>
          <td colspan="4" class="loading-row">Nenhum cliente cadastrado.</td>
        </tr>
      `;
      return;
    }

    clientesTbody.innerHTML = clients
      .map((c) => {
        const clubeLabel = c.clubeBeleza === "membro" ? "Membro" : "Não é membro";

        return `
          <tr>
            <td>
              <strong>${escapeHtml(c.nome || "—")}</strong>
              ${c.sobrenome ? `<div class="muted">${escapeHtml(c.sobrenome)}</div>` : ""}
            </td>
            <td>${escapeHtml(c.telefone || "—")}</td>
            <td>${clubeLabel}</td>
            <td style="text-align:right;">
              <div class="timeslot-actions">
                <button class="btn btn-sm btn-edit" data-action="edit-client" data-id="${c.id}" title="Editar">
                  <i class="bx bx-pencil"></i>
                </button>

                ${
                  c.clubeBeleza === "membro"
                    ? `
                  <button class="btn btn-sm btn-success" data-action="pay-client" data-id="${c.id}" title="Registrar pagamento">
                    <i class="bx bx-dollar"></i>
                  </button>
                `
                    : ""
                }

                <button class="btn btn-sm btn-del" data-action="delete-client" data-id="${c.id}" title="Excluir">
                  <i class="bx bx-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderPayments(payments) {
    if (!raclubPayTbody) return;

    const rows = [...payments].sort((a, b) => {
      const da = getPaymentDate(a);
      const db = getPaymentDate(b);
      return db - da;
    });

    if (!rows.length) {
      raclubPayTbody.innerHTML = `
        <tr>
          <td colspan="4" class="loading-row">Sem pagamentos para exibir.</td>
        </tr>
      `;
      return;
    }

    raclubPayTbody.innerHTML = rows
      .map((p) => {
        const d = getPaymentDate(p);
        const mesAno = d
          ? d.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })
          : "—";

        const cliente =
          p.clientName ||
          p.nomeCliente ||
          p.nome ||
          "—";

        const valor = Number(p.value ?? p.valor ?? 0);
        const status = p.status || "Pago";

        return `
          <tr>
            <td>${escapeHtml(cliente)}</td>
            <td>${mesAno}</td>
            <td>${formatCurrency(valor)}</td>
            <td>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <span>${escapeHtml(status)}</span>
                <button class="btn btn-sm btn-del" data-payment-id="${p.id}" title="Excluir pagamento">
                  <i class="bx bx-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  async function saveClient() {
    await waitForAuth();

    const nome = (cliNome?.value || "").trim();
    const sobrenome = (cliSobrenome?.value || "").trim();
    const telefone = (cliTelefone?.value || "").trim();
    const clubeBeleza = cliRaclub?.value || "nao";

    if (!nome) {
      showNotification("Informe o nome do cliente.", "error");
      return;
    }

    const isMember = clubeBeleza === "membro";

    const dataFirestore = {
      // padrão salão
      nome,
      sobrenome,
      telefone,
      clubeBeleza,

      // compatibilidade com estrutura antiga
      name: nome,
      phone: telefone,
      clienteSobrenome: sobrenome,
      raclub: clubeBeleza,
      plano: isMember ? "ra_club" : "cliente",
      type: isMember ? "plano_jc" : "cliente",
      status: isMember ? "ativo" : null,
      situacao: isMember ? "ativo" : null,

      createdAt: serverTimestamp(),
    };

    try {
      if (cliSalvarBtn) cliSalvarBtn.disabled = true;
      await addDoc(collection(db, "raclub_clients"), dataFirestore);
      clearForm();
      showNotification("Cliente cadastrado com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao salvar cliente:", err);
      showNotification("Erro ao cadastrar cliente.", "error");
    } finally {
      if (cliSalvarBtn) cliSalvarBtn.disabled = false;
    }
  }

  async function openEditClientModal(id) {
    const client = (state.allClients || []).find((c) => c.id === id);
    if (!client) return;

    mainModal.show({
      title: "Editar cliente",
      body: `
        <div class="form-grid">
          <div class="field">
            <label>Nome</label>
            <input id="editCliNome" value="${escapeAttr(client.nome || "")}" />
          </div>
          <div class="field">
            <label>Sobrenome</label>
            <input id="editCliSobrenome" value="${escapeAttr(client.sobrenome || "")}" />
          </div>
          <div class="field">
            <label>Telefone</label>
            <input id="editCliTelefone" value="${escapeAttr(client.telefone || "")}" />
          </div>
          <div class="field">
            <label>Clube de Beleza</label>
            <select id="editCliRaclub">
              <option value="nao" ${client.clubeBeleza === "nao" ? "selected" : ""}>Não é membro</option>
              <option value="membro" ${client.clubeBeleza === "membro" ? "selected" : ""}>Membro</option>
            </select>
          </div>
        </div>
      `,
      buttons: [
        { text: "Cancelar", class: "btn-light" },
        {
          text: "Salvar",
          class: "btn-edit",
          onClick: async () => {
            await waitForAuth();

            const nome = ($("#editCliNome")?.value || "").trim();
            const sobrenome = ($("#editCliSobrenome")?.value || "").trim();
            const telefone = ($("#editCliTelefone")?.value || "").trim();
            const clubeBeleza = $("#editCliRaclub")?.value || "nao";

            if (!nome) {
              showNotification("Informe o nome do cliente.", "error");
              return false;
            }

            const isMember = clubeBeleza === "membro";

            try {
              await updateDoc(doc(db, "raclub_clients", id), {
                nome,
                sobrenome,
                telefone,
                clubeBeleza,

                // compatibilidade
                name: nome,
                phone: telefone,
                clienteSobrenome: sobrenome,
                raclub: clubeBeleza,
                plano: isMember ? "ra_club" : "cliente",
                type: isMember ? "plano_jc" : "cliente",
                status: isMember ? "ativo" : null,
                situacao: isMember ? "ativo" : null,
              });

              showNotification("Cliente atualizado com sucesso!", "success");
            } catch (err) {
              console.error("Erro ao atualizar cliente:", err);
              showNotification("Erro ao atualizar cliente.", "error");
              return false;
            }
          },
        },
      ],
    });
  }

  async function deleteClient(id) {
    const client = (state.allClients || []).find((c) => c.id === id);
    if (!client) return;

    mainModal.show({
      title: "Excluir cliente",
      body: `<p>Deseja remover <strong>${escapeHtml(client.nome)}</strong>?</p>`,
      buttons: [
        { text: "Cancelar", class: "btn-light" },
        {
          text: "Excluir",
          class: "btn-del",
          onClick: async () => {
            await waitForAuth();

            try {
              await deleteDoc(doc(db, "raclub_clients", id));
              showNotification("Cliente removido com sucesso!", "success");
            } catch (err) {
              console.error("Erro ao excluir cliente:", err);
              showNotification("Erro ao excluir cliente.", "error");
              return false;
            }
          },
        },
      ],
    });
  }

  async function openPaymentModalForClient(id) {
    const client = (state.allClients || []).find((c) => c.id === id);
    if (!client) return;

    mainModal.show({
      title: "Registrar pagamento do Clube de Beleza",
      body: `
        <div class="form-grid">
          <div class="field">
            <label>Cliente</label>
            <input value="${escapeAttr(client.nome || "")}" disabled />
          </div>
          <div class="field">
            <label>Valor</label>
            <input id="payValue" type="number" step="0.01" placeholder="0,00" />
          </div>
        </div>
      `,
      buttons: [
        { text: "Cancelar", class: "btn-light" },
        {
          text: "Registrar",
          class: "btn-edit",
          onClick: async () => {
            await waitForAuth();

            const value = Number($("#payValue")?.value || 0);
            if (!value) {
              showNotification("Informe um valor válido.", "error");
              return false;
            }

            try {
              await addDoc(collection(db, "raclub_payments"), {
                clientId: client.id,
                clientName: client.nome || "",
                nomeCliente: client.nome || "",
                value,
                valor: value,
                status: "Pago",
                date: serverTimestamp(),
                dataPagamento: serverTimestamp(),
                createdAt: serverTimestamp(),
              });

              showNotification("Pagamento registrado com sucesso!", "success");
            } catch (err) {
              console.error("Erro ao registrar pagamento:", err);
              showNotification("Erro ao registrar pagamento.", "error");
              return false;
            }
          },
        },
      ],
    });
  }

  // ações da tabela de clientes
  clientesTbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const { action, id } = btn.dataset;
    if (!id) return;

    if (action === "edit-client") openEditClientModal(id);
    if (action === "pay-client") openPaymentModalForClient(id);
    if (action === "delete-client") deleteClient(id);
  });

  // ações da tabela de pagamentos
  raclubPayTbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-payment-id]");
    if (!btn) return;

    const paymentId = btn.dataset.paymentId;
    if (!paymentId) return;

    mainModal.show({
      title: "Excluir pagamento",
      body: "<p>Deseja remover este pagamento?</p>",
      buttons: [
        { text: "Cancelar", class: "btn-light" },
        {
          text: "Excluir",
          class: "btn-del",
          onClick: async () => {
            await waitForAuth();

            try {
              await deleteDoc(doc(db, "raclub_payments", paymentId));
              showNotification("Pagamento removido com sucesso!", "success");
            } catch (err) {
              console.error("Erro ao excluir pagamento:", err);
              showNotification("Erro ao excluir pagamento.", "error");
              return false;
            }
          },
        },
      ],
    });
  });

  cliSalvarBtn?.addEventListener("click", saveClient);
  cliLimparBtn?.addEventListener("click", clearForm);

  // listeners
  (async () => {
    await waitForAuth();

    onSnapshot(
      query(collection(db, "raclub_clients"), orderBy("nome")),
      (snap) => {
        state.allClients = snap.docs.map((d) => normalizeClientDoc(d.id, d.data() || {}));
        renderClients();
      },
      (error) => {
        console.error("Erro listener clientes:", error);
        clientesTbody.innerHTML = `
          <tr>
            <td colspan="4" class="loading-row">Erro ao carregar clientes.</td>
          </tr>
        `;
      }
    );

    onSnapshot(
      query(collection(db, "raclub_payments"), orderBy("date", "desc")),
      (snap) => {
        const payments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderPayments(payments);
      },
      (error) => {
        console.error("Erro listener pagamentos:", error);
        if (raclubPayTbody) {
          raclubPayTbody.innerHTML = `
            <tr>
              <td colspan="4" class="loading-row">Erro ao carregar pagamentos.</td>
            </tr>
          `;
        }
      }
    );
  })();
}

/* ========= helpers locais ========= */
function getPaymentDate(p) {
  const ts = p.date || p.dataPagamento || p.createdAt;
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}