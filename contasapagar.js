// contasapagar.js
import {
  $,
  formatCurrency,
  parseMoney,
  todayYmd,
  showNotification,
  mainModal,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  COL_CONTAS_APAGAR,
} from "./firebase.js";

/* =========================
   Estado local
========================= */
const cpState = {
  rows: [],
  filter: "todas",
  search: "",
  editingGroupId: null,
  unsubscribe: null,
};

/* =========================
   Helpers
========================= */
function pad2(n) {
  return String(n).padStart(2, "0");
}

function addMonthsToYmd(ymd, monthsToAdd = 0) {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1 + Number(monthsToAdd || 0), d || 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function ymdToBr(ymd) {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `cp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getComputedStatus(item) {
  const raw = String(item?.status || "pendente").toLowerCase();
  const hoje = todayYmd();

  if (raw === "pago") return "paga";
  if (item?.dataVencimento && item.dataVencimento < hoje) return "atrasada";
  return "pendente";
}

function getStatusBadge(status) {
  if (status === "paga") {
    return `<span class="cp-status-badge cp-status-paga">Paga</span>`;
  }
  if (status === "atrasada") {
    return `<span class="cp-status-badge cp-status-atrasada">Atrasada</span>`;
  }
  return `<span class="cp-status-badge cp-status-pendente">Pendente</span>`;
}

/* =========================
   DOM helpers
========================= */
function getEls() {
  return {
    cpFornecedor: $("#cpFornecedor"),
    cpDescricao: $("#cpDescricao"),
    cpCategoria: $("#cpCategoria"),
    cpValorTotal: $("#cpValorTotal"),
    cpParcelas: $("#cpParcelas"),
    cpFormaPagamento: $("#cpFormaPagamento"),
    cpDataPrimeiroVencimento: $("#cpDataPrimeiroVencimento"),
    cpStatus: $("#cpStatus"),
    cpSalvarBtn: $("#cpSalvarBtn"),
    cpLimparBtn: $("#cpLimparBtn"),
    cpSearch: $("#cpSearch"),
    cpTbody: $("#cpTbody"),
    cpTotalPagar: $("#cpTotalPagar"),
    cpTotalPendentes: $("#cpTotalPendentes"),
    cpTotalAtrasadas: $("#cpTotalAtrasadas"),
    cpTotalPagasMes: $("#cpTotalPagasMes"),
    filterBtns: document.querySelectorAll(".cp-filter-btn"),
  };
}

function clearForm() {
  const els = getEls();
  if (!els.cpFornecedor) return;

  els.cpFornecedor.value = "";
  els.cpDescricao.value = "";
  els.cpCategoria.value = "";
  els.cpValorTotal.value = "";
  els.cpParcelas.value = 1;
  els.cpFormaPagamento.value = "";
  els.cpDataPrimeiroVencimento.value = todayYmd();
  els.cpStatus.value = "pendente";

  cpState.editingGroupId = null;

  if (els.cpSalvarBtn) {
    els.cpSalvarBtn.innerHTML = `<i class="bx bx-save"></i> Salvar conta`;
  }
}

function fillFormFromRow(row) {
  const els = getEls();
  if (!els.cpFornecedor) return;

  els.cpFornecedor.value = row.fornecedor || "";
  els.cpDescricao.value = row.descricao || "";
  els.cpCategoria.value = row.categoria || "";
  els.cpValorTotal.value = Number(row.valorTotal || 0);
  els.cpParcelas.value = Number(row.parcelas || 1);
  els.cpFormaPagamento.value = row.formaPagamento || "";
  els.cpDataPrimeiroVencimento.value = row.dataPrimeiroVencimento || row.dataVencimento || "";
  els.cpStatus.value = row.status === "pago" ? "pago" : "pendente";

  cpState.editingGroupId = row.groupId || null;

  if (els.cpSalvarBtn) {
    els.cpSalvarBtn.innerHTML = `<i class="bx bx-save"></i> Atualizar conta`;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getFormData() {
  const els = getEls();

  return {
    fornecedor: (els.cpFornecedor?.value || "").trim(),
    descricao: (els.cpDescricao?.value || "").trim(),
    categoria: (els.cpCategoria?.value || "").trim(),
    valorTotal: parseMoney(els.cpValorTotal?.value),
    parcelas: Math.max(1, Number(els.cpParcelas?.value || 1)),
    formaPagamento: (els.cpFormaPagamento?.value || "").trim(),
    dataPrimeiroVencimento: (els.cpDataPrimeiroVencimento?.value || "").trim(),
    status: (els.cpStatus?.value || "pendente").trim(),
  };
}

function validateForm(data) {
  if (!data.fornecedor) {
    showNotification("Informe o nome/fornecedor.", "error");
    return false;
  }

  if (!data.valorTotal || data.valorTotal <= 0) {
    showNotification("Informe um valor total válido.", "error");
    return false;
  }

  if (!data.dataPrimeiroVencimento) {
    showNotification("Informe o primeiro vencimento.", "error");
    return false;
  }

  return true;
}

function getModalFormData() {
  return {
    fornecedor: ($("#mCpFornecedor")?.value || "").trim(),
    descricao: ($("#mCpDescricao")?.value || "").trim(),
    categoria: ($("#mCpCategoria")?.value || "").trim(),
    valorTotal: parseMoney($("#mCpValorTotal")?.value),
    parcelas: Math.max(1, Number($("#mCpParcelas")?.value || 1)),
    formaPagamento: ($("#mCpFormaPagamento")?.value || "").trim(),
    dataPrimeiroVencimento: ($("#mCpDataPrimeiroVencimento")?.value || "").trim(),
    status: ($("#mCpStatus")?.value || "pendente").trim(),
  };
}

function openEditModal(row) {
  if (!row) return;

  const body = `
    <div class="form-grid">
      <div class="field">
        <label for="mCpFornecedor">Nome/Fornecedor *</label>
        <input id="mCpFornecedor" type="text" value="${escapeHtml(row.fornecedor || "")}" />
      </div>

      <div class="field">
        <label for="mCpDescricao">Descrição</label>
        <input id="mCpDescricao" type="text" value="${escapeHtml(row.descricao || "")}" />
      </div>

      <div class="field">
        <label for="mCpCategoria">Categoria</label>
        <select id="mCpCategoria">
          <option value="">Selecione</option>
          <option value="Aluguel" ${row.categoria === "Aluguel" ? "selected" : ""}>Aluguel</option>
          <option value="Energia" ${row.categoria === "Energia" ? "selected" : ""}>Energia</option>
          <option value="Internet" ${row.categoria === "Internet" ? "selected" : ""}>Internet</option>
          <option value="Água" ${row.categoria === "Água" ? "selected" : ""}>Água</option>
          <option value="Produtos / insumos" ${row.categoria === "Produtos / insumos" ? "selected" : ""}>Produtos / insumos</option>
          <option value="Folha / comissões" ${row.categoria === "Folha / comissões" ? "selected" : ""}>Folha / comissões</option>
          <option value="Marketing" ${row.categoria === "Marketing" ? "selected" : ""}>Marketing</option>
          <option value="Impostos" ${row.categoria === "Impostos" ? "selected" : ""}>Impostos</option>
          <option value="Outros" ${row.categoria === "Outros" ? "selected" : ""}>Outros</option>
        </select>
      </div>

      <div class="field">
        <label for="mCpValorTotal">Valor total (R$) *</label>
        <input id="mCpValorTotal" type="number" step="0.01" value="${Number(row.valorTotal || 0)}" />
      </div>

      <div class="field">
        <label for="mCpParcelas">Parcelas</label>
        <input id="mCpParcelas" type="number" min="1" value="${Number(row.parcelas || 1)}" />
      </div>

      <div class="field">
        <label for="mCpFormaPagamento">Forma de pagamento</label>
        <select id="mCpFormaPagamento">
          <option value="">Selecione</option>
          <option value="PIX" ${row.formaPagamento === "PIX" ? "selected" : ""}>PIX</option>
          <option value="Dinheiro" ${row.formaPagamento === "Dinheiro" ? "selected" : ""}>Dinheiro</option>
          <option value="Cartão de Crédito" ${row.formaPagamento === "Cartão de Crédito" ? "selected" : ""}>Cartão de Crédito</option>
          <option value="Cartão de Débito" ${row.formaPagamento === "Cartão de Débito" ? "selected" : ""}>Cartão de Débito</option>
          <option value="Boleto" ${row.formaPagamento === "Boleto" ? "selected" : ""}>Boleto</option>
          <option value="Transferência" ${row.formaPagamento === "Transferência" ? "selected" : ""}>Transferência</option>
          <option value="Outro" ${row.formaPagamento === "Outro" ? "selected" : ""}>Outro</option>
        </select>
      </div>

      <div class="field">
        <label for="mCpDataPrimeiroVencimento">1º vencimento *</label>
        <input id="mCpDataPrimeiroVencimento" type="date" value="${escapeHtml(row.dataPrimeiroVencimento || row.dataVencimento || "")}" />
      </div>

      <div class="field">
        <label for="mCpStatus">Status inicial</label>
        <select id="mCpStatus">
          <option value="pendente" ${row.status !== "pago" ? "selected" : ""}>Pendente</option>
          <option value="pago" ${row.status === "pago" ? "selected" : ""}>Pago</option>
        </select>
      </div>
    </div>
  `;

  mainModal.show({
    title: "Editar conta",
    body,
    buttons: [
      {
        text: '<i class="bx bx-x"></i> Cancelar',
        class: "btn-light",
      },
      {
        text: '<i class="bx bx-save"></i> Salvar alterações',
        class: "btn-edit",
        onClick: async () => {
          const data = getModalFormData();

          if (!validateForm(data)) return false;

          try {
            await deleteGroup(row.groupId);
            await createGroupFromForm(data, row.groupId);
            showNotification("Conta atualizada com sucesso.");
          } catch (error) {
            console.error("Erro ao atualizar conta:", error);
            showNotification("Erro ao atualizar conta.", "error");
            return false;
          }
        },
      },
    ],
  });
}

/* =========================
   CRUD
========================= */
async function deleteGroup(groupId) {
  if (!groupId) return;

  const snap = await getDocs(query(COL_CONTAS_APAGAR, where("groupId", "==", groupId)));
  const jobs = snap.docs.map((d) => deleteDoc(doc(COL_CONTAS_APAGAR, d.id)));
  await Promise.all(jobs);
}

async function createGroupFromForm(data, forcedGroupId = null) {
  const groupId = forcedGroupId || makeId();
  const valorParcelaBruto = Number(data.valorTotal) / Number(data.parcelas || 1);
  const jobs = [];

  for (let i = 0; i < data.parcelas; i += 1) {
    const parcelaAtual = i + 1;
    const dataVencimento = addMonthsToYmd(data.dataPrimeiroVencimento, i);

    jobs.push(
      addDoc(COL_CONTAS_APAGAR, {
        groupId,
        fornecedor: data.fornecedor,
        descricao: data.descricao,
        categoria: data.categoria,
        valorTotal: Number(data.valorTotal || 0),
        valorParcela: Number(valorParcelaBruto.toFixed(2)),
        parcelas: Number(data.parcelas || 1),
        parcelaAtual,
        formaPagamento: data.formaPagamento,
        dataPrimeiroVencimento: data.dataPrimeiroVencimento,
        dataVencimento,
        status: data.status === "pago" ? "pago" : "pendente",
        pagoEm: data.status === "pago" ? serverTimestamp() : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  }

  await Promise.all(jobs);
}

async function saveConta() {
  const data = getFormData();
  if (!validateForm(data)) return;

  const btn = $("#cpSalvarBtn");
  const oldHtml = btn?.innerHTML || "";

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="bx bx-loader-alt bx-spin"></i> Salvando...`;
    }

    if (cpState.editingGroupId) {
      await deleteGroup(cpState.editingGroupId);
      await createGroupFromForm(data, cpState.editingGroupId);
      showNotification("Conta atualizada com sucesso.");
    } else {
      await createGroupFromForm(data);
      showNotification("Conta cadastrada com sucesso.");
    }

    clearForm();
  } catch (error) {
    console.error("Erro ao salvar conta:", error);
    showNotification("Erro ao salvar conta.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = cpState.editingGroupId
        ? `<i class="bx bx-save"></i> Atualizar conta`
        : `<i class="bx bx-save"></i> Salvar conta`;
    }
  }
}

async function marcarComoPaga(id) {
  try {
    await updateDoc(doc(COL_CONTAS_APAGAR, id), {
      status: "pago",
      pagoEm: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    showNotification("Parcela marcada como paga.");
  } catch (error) {
    console.error("Erro ao marcar como paga:", error);
    showNotification("Erro ao atualizar o status.", "error");
  }
}

async function marcarComoPendente(id) {
  try {
    await updateDoc(doc(COL_CONTAS_APAGAR, id), {
      status: "pendente",
      pagoEm: null,
      updatedAt: serverTimestamp(),
    });
    showNotification("Parcela marcada como pendente.");
  } catch (error) {
    console.error("Erro ao marcar como pendente:", error);
    showNotification("Erro ao atualizar o status.", "error");
  }
}

async function excluirConta(groupId) {
  if (!groupId) return;

  mainModal.show({
    title: "Excluir conta",
    body: `
      <p style="margin:0;">
        Tem certeza que deseja excluir esta conta?
        <br />
        <small class="muted">Todas as parcelas desse lançamento serão removidas.</small>
      </p>
    `,
    buttons: [
      {
        text: '<i class="bx bx-x"></i> Cancelar',
        class: "btn-light",
      },
      {
        text: '<i class="bx bx-trash"></i> Excluir',
        class: "btn-del",
        onClick: async () => {
          try {
            await deleteGroup(groupId);
            showNotification("Conta excluída com sucesso.");
          } catch (error) {
            console.error("Erro ao excluir conta:", error);
            showNotification("Erro ao excluir conta.", "error");
            return false;
          }
        },
      },
    ],
  });
}

/* =========================
   Render
========================= */
function getFilteredRows() {
  const search = normalize(cpState.search);

  return (cpState.rows || []).filter((item) => {
    const computedStatus = getComputedStatus(item);

    const matchesFilter =
      cpState.filter === "todas" ||
      computedStatus === cpState.filter;

    if (!matchesFilter) return false;

    if (!search) return true;

    const haystack = normalize(
      [
        item.fornecedor,
        item.descricao,
        item.categoria,
        item.formaPagamento,
        item.parcelaAtual ? `${item.parcelaAtual}/${item.parcelas}` : "",
      ].join(" ")
    );

    return haystack.includes(search);
  });
}

function renderKPIs() {
  const els = getEls();
  const rows = cpState.rows || [];
  const hoje = todayYmd();
  const mesAtual = hoje.slice(0, 7);

  let totalPagar = 0;
  let totalPendentes = 0;
  let totalAtrasadas = 0;
  let totalPagasMes = 0;

  rows.forEach((item) => {
    const valor = Number(item.valorParcela || 0);
    const computedStatus = getComputedStatus(item);

    totalPagar += valor;

    if (computedStatus === "pendente") totalPendentes += valor;
    if (computedStatus === "atrasada") totalAtrasadas += valor;

    if (String(item.status || "").toLowerCase() === "pago") {
      const paidDate =
        item.pagoEm?.toDate?.() instanceof Date
          ? item.pagoEm.toDate()
          : null;

      if (paidDate) {
        const paidYmd = `${paidDate.getFullYear()}-${pad2(paidDate.getMonth() + 1)}`;
        if (paidYmd === mesAtual) totalPagasMes += valor;
      } else if ((item.dataVencimento || "").startsWith(mesAtual)) {
        totalPagasMes += valor;
      }
    }
  });

  if (els.cpTotalPagar) els.cpTotalPagar.textContent = formatCurrency(totalPagar);
  if (els.cpTotalPendentes) els.cpTotalPendentes.textContent = formatCurrency(totalPendentes);
  if (els.cpTotalAtrasadas) els.cpTotalAtrasadas.textContent = formatCurrency(totalAtrasadas);
  if (els.cpTotalPagasMes) els.cpTotalPagasMes.textContent = formatCurrency(totalPagasMes);
}

function renderTable() {
  const els = getEls();
  if (!els.cpTbody) return;

  const rows = getFilteredRows();

  if (!rows.length) {
    els.cpTbody.innerHTML = `
      <tr>
        <td colspan="7" class="loading-row">Nenhuma conta encontrada.</td>
      </tr>
    `;
    return;
  }

  els.cpTbody.innerHTML = rows
    .map((item) => {
      const computedStatus = getComputedStatus(item);
      const isPaid = computedStatus === "paga";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(item.fornecedor || "-")}</strong>
            ${item.descricao ? `<div class="cp-parcela-text">${escapeHtml(item.descricao)}</div>` : ""}
          </td>
          <td>${escapeHtml(item.categoria || "-")}</td>
          <td>${formatCurrency(Number(item.valorParcela || 0))}</td>
          <td>${Number(item.parcelaAtual || 1)}/${Number(item.parcelas || 1)}</td>
          <td>${ymdToBr(item.dataVencimento || "")}</td>
          <td>${getStatusBadge(computedStatus)}</td>
          <td>
            <div class="cp-actions">
              ${
                isPaid
                  ? `
                    <button class="btn btn-light btn-sm" type="button" data-action="pendente" data-id="${item.id}">
                      <i class="bx bx-rotate-left"></i>
                    </button>
                  `
                  : `
                    <button class="btn btn-edit btn-sm" type="button" data-action="pagar" data-id="${item.id}">
                      <i class="bx bx-check"></i>
                    </button>
                  `
              }
              <button class="btn btn-light btn-sm" type="button" data-action="editar" data-group="${item.groupId}">
                <i class="bx bx-pencil"></i>
              </button>
              <button class="btn btn-del btn-sm" type="button" data-action="excluir" data-group="${item.groupId}">
                <i class="bx bx-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function syncFilterButtons() {
  const { filterBtns } = getEls();
  filterBtns.forEach((btn) => {
    const active = btn.dataset.cpFilter === cpState.filter;
    btn.classList.toggle("active", active);
  });
}

function refreshUI() {
  syncFilterButtons();
  renderKPIs();
  renderTable();
}

/* =========================
   Listeners
========================= */
function bindForm() {
  const els = getEls();

  els.cpSalvarBtn?.addEventListener("click", saveConta);

  els.cpLimparBtn?.addEventListener("click", () => {
    clearForm();
    showNotification("Formulário limpo.");
  });

  els.cpSearch?.addEventListener("input", (e) => {
    cpState.search = e.target.value || "";
    renderTable();
  });

  els.filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      cpState.filter = btn.dataset.cpFilter || "todas";
      refreshUI();
    });
  });
}

function bindTableActions() {
  const tbody = $("#cpTbody");
  if (!tbody || tbody.dataset.bound === "true") return;
  tbody.dataset.bound = "true";

  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const groupId = btn.dataset.group;

    if (action === "pagar" && id) {
      await marcarComoPaga(id);
      return;
    }

    if (action === "pendente" && id) {
      await marcarComoPendente(id);
      return;
    }

    if (action === "editar" && groupId) {
      const row = (cpState.rows || []).find((r) => r.groupId === groupId);
      if (row) openEditModal(row);
      return;
    }

    if (action === "excluir" && groupId) {
      await excluirConta(groupId);
    }
  });
}

function startListener() {
  if (cpState.unsubscribe) cpState.unsubscribe();

  cpState.unsubscribe = onSnapshot(
    query(COL_CONTAS_APAGAR, orderBy("dataVencimento")),
    (snap) => {
      cpState.rows = snap.docs.map((d) => {
        const v = d.data() || {};
        return {
          id: d.id,
          groupId: v.groupId || "",
          fornecedor: v.fornecedor || "",
          descricao: v.descricao || "",
          categoria: v.categoria || "",
          valorTotal: Number(v.valorTotal || 0),
          valorParcela: Number(v.valorParcela || 0),
          parcelas: Number(v.parcelas || 1),
          parcelaAtual: Number(v.parcelaAtual || 1),
          formaPagamento: v.formaPagamento || "",
          dataPrimeiroVencimento: v.dataPrimeiroVencimento || "",
          dataVencimento: v.dataVencimento || "",
          status: v.status || "pendente",
          pagoEm: v.pagoEm || null,
          createdAt: v.createdAt || null,
          updatedAt: v.updatedAt || null,
        };
      });

      refreshUI();
    },
    (error) => {
      console.error("Erro ao carregar contas a pagar:", error);
      showNotification("Erro ao carregar contas a pagar.", "error");
    }
  );
}

/* =========================
   Init
========================= */
export function initContasAPagarTab() {
  const exists = $("#contasapagarMain");
  if (!exists) return;

  const els = getEls();

  if (els.cpDataPrimeiroVencimento && !els.cpDataPrimeiroVencimento.value) {
    els.cpDataPrimeiroVencimento.value = todayYmd();
  }

  bindForm();
  bindTableActions();
  startListener();
  refreshUI();
}