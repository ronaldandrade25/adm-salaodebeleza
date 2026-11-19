// /js/firebase.js (ESM)
// ✅ Arquivo "central" com Firebase + Helpers + Modal + Tabs + Estado compartilhado
// ✅ Login com Firebase Authentication (e-mail/senha) + Auth Gate
// ✅ Importa e inicia as abas (agenda/relatorios/clientes/pdv/config)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ✅ Storage (necessário para upload de foto do profissional)
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ✅ Módulos por aba
import { initAgendaTab } from "./agenda.js";
import { initRelatoriosTab } from "./relatorios.js";
import { initClientesTab } from "./clientes.js";
import { initPdvTab } from "./pdv.js";
import { initConfiguracoesTab } from "./configuracoes.js";
import { initContasAPagarTab } from "./contasapagar.js";

/* ========= Firebase ========= */
const firebaseConfig = {
  apiKey: "", // COLOQUE_SUA_API_KEY_AQUI
  authDomain: "", // COLOQUE_SEU_AUTH_DOMAIN_AQUI
  projectId: "", // COLOQUE_SEU_PROJECT_ID_AQUI
  storageBucket: "", // COLOQUE_SEU_STORAGE_BUCKET_AQUI
  messagingSenderId: "", // COLOQUE_SEU_MESSAGING_SENDER_ID_AQUI
  appId: "" // COLOQUE_SEU_APP_ID_AQUI
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ✅ Storage exports
export const storage = getStorage(app);
export { ref, uploadBytes, getDownloadURL };

/* ========= Helpers ========= */
export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);
export const pad2 = (n) => String(n).padStart(2, "0");
export const normalize = (s) => (s || "").toString().trim().toLowerCase();

export const formatCurrency = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const ymdToDateObj = (ymd) => {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0);
};

export const formatDate = (tsOrDate) => {
  if (!tsOrDate) return "";
  const d = tsOrDate?.toDate ? tsOrDate.toDate() : tsOrDate;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// ✅ NOVO helper: YYYY-MM-DD -> DD/MM/YYYY
export const ymdToDateStr = (ymd) => {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).split("-");
  return `${pad2(d)}/${pad2(m)}/${y}`;
};

// ✅ NOVO helper: hoje em YYYY-MM-DD
export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// ✅ NOVO helper: parse dinheiro seguro
export function parseMoney(v) {
  if (v == null) return 0;
  const s = String(v)
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};

export const minutesToHHMM = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
};

// ✅ Ajuste: manter "_" (importante para nomes e ids compostos)
export function slugify(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export const toKey = (ymd, hh) => `${ymd}_${hh}`;

/* ========= Notificações ========= */
const notificationContainer = $("#notification-container");

export function showNotification(message, type = "success") {
  if (!notificationContainer) return;
  const div = document.createElement("div");
  div.className = `notification ${type}`;
  div.innerHTML = `<span>${message}</span>`;
  notificationContainer.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

/* ========= Modal genérico ========= */
const modalEl = $("#mainModal");
const modalTitle = $("#modalTitle");
const modalBody = $("#modalBody");
const modalFooter = $("#modalFooter");
const modalClose = $("#modalClose");

export const mainModal = {
  show({ title = "", body = "", buttons = [] }) {
    if (!modalEl) return;
    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.innerHTML = body;
    if (modalFooter) modalFooter.innerHTML = "";

    (buttons || []).forEach((b) => {
      const btn = document.createElement("button");
      btn.className = `btn ${b.class || ""}`;
      btn.innerHTML = b.text || "OK";
      btn.addEventListener("click", async () => {
        if (b.onClick) {
          const result = await b.onClick();
          if (result === false) return;
        }
        mainModal.hide();
      });
      modalFooter?.appendChild(btn);
    });

    modalEl.classList.remove("hidden");
  },
  hide() {
    if (!modalEl) return;
    modalEl.classList.add("hidden");
  },
};

modalClose?.addEventListener("click", () => mainModal.hide());
modalEl?.addEventListener("click", (e) => {
  if (e.target === modalEl) mainModal.hide();
});

/* ============================================================
   ✅ Link de agendamento (menu lateral)
============================================================ */
function bindBookingLinkNav() {
  const btn = $("#bookingLinkNavBtn");

  btn?.addEventListener("click", () => {
    mainModal.show({
      title: "Link de agendamento",
      body: `
        <p>Compartilhe este link com seus clientes para que eles possam agendar horários online.</p>
        <div style="margin-top:12px;padding:10px;border-radius:10px;border:1px solid rgba(148,163,184,0.6);background:#020617;font-size:.85rem">
          <div style="color:#9ca3af;margin-bottom:4px">Endereço</div>
          <a href="${BOOKING_URL}" target="_blank" rel="noopener" style="word-break:break-all;color:#a5b4fc">${BOOKING_URL}</a>
        </div>
      `,
      buttons: [
        { text: "Fechar", class: "btn-light" },
        { text: "<i class='bx bx-link-external'></i> Abrir link", class: "btn", onClick: () => window.open(BOOKING_URL, "_blank", "noopener") },
        {
          text: "<i class='bx bx-copy'></i> Copiar link",
          class: "btn-light",
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(BOOKING_URL);
            } catch {
              const ta = document.createElement("textarea");
              ta.value = BOOKING_URL;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              ta.remove();
            }
            showNotification("Link copiado!");
            return false;
          },
        },
      ],
    });
  });
}

/* ============================================================
   ✅ Modal "Resumo geral / Despesas" (abre/fecha)
============================================================ */
function bindResumoGeralModal() {
  const modal = $("#resumoGeralModal");
  const openBtn = $("#openResumoGeralModal");
  const closeBtn = $("#resumoGeralClose");
  const footerClose = $("#resumoGeralFecharBtn");

  const show = () => {
    if (!modal) return;
    modal.classList.remove("hidden");
    window.dispatchEvent(new CustomEvent("resumoGeral:open"));
  };

  const hide = () => {
    if (!modal) return;
    modal.classList.add("hidden");
  };

  openBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    show();
  });

  closeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    hide();
  });

  footerClose?.addEventListener("click", (e) => {
    e.preventDefault();
    hide();
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) hide();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) hide();
  });
}

/* ========= Tabs ========= */
const mainContents = document.querySelectorAll("main");
const tabBtns = document.querySelectorAll(".tab-btn");

export function showTab(tab) {
  const targetId = `${tab}Main`;
  mainContents.forEach((main) => {
    if (main.id === targetId) main.classList.remove("hidden-block");
    else main.classList.add("hidden-block");
  });
  tabBtns.forEach((btn) => {
    if (btn.dataset.tab === tab) btn.classList.add("active");
    else btn.classList.remove("active");
  });
}

/* ========= Auth Gate (login Firebase) ========= */
let currentUser = null;
let resolveAuthReady;
const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

export async function waitForAuth() {
  await authReady;
  while (!currentUser) {
    await new Promise((r) => setTimeout(r, 300));
  }
  return true;
}

function setupAuthGate() {
  const gate = $("#authGate");
  const form = $("#authGateForm");
  const emailInput = $("#authEmail");
  const passwordInput = $("#authPassword");
  const errorEl = $("#authGateError");
  const submitBtn = $("#authGateSubmit");
  const logoutBtn = $("#logoutBtn");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl?.classList.add("hidden");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Entrando...";
    }
    try {
      await signInWithEmailAndPassword(auth, (emailInput?.value || "").trim(), passwordInput?.value || "");
    } catch (err) {
      console.error("Erro de login:", err);
      if (errorEl) {
        errorEl.textContent = "E-mail ou senha inválidos.";
        errorEl.classList.remove("hidden");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Entrar";
      }
    }
  });

  logoutBtn?.addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      gate?.classList.add("hidden");
      logoutBtn?.classList.remove("hidden");
    } else {
      gate?.classList.remove("hidden");
      logoutBtn?.classList.add("hidden");
      if (form) form.reset();
    }
    resolveAuthReady();
  });
}

setupAuthGate();

/* ========= Estado compartilhado ========= */
export const BOOKING_URL = "https://site-salaobeleza-vt.vercel.app/"; // link do site de agendamento externo

export const PAYMENT_METHODS = [
  "PIX",
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
  "RA Club",
  "Outro",
];

// ✅ fallback
export const ONLY_PRO = { label: "Rodrigo Torre2", colecao: "reservas_rodrigotorre2" };

export const state = {
  BUSINESS_HOURS: { inicio: "09:00", fim: "19:00" },
  HOURS: [],
  SERVICOS: [],
  PROFESSIONALS: [],
  CFG_WEEK: null,
  allClients: [],
  pdvProducts: [],
  reportCache: [],
  charts: {
    reportsChartInstance: null,
    reportsProfChartInstance: null,
    reportsGrupoChartInstance: null,
  },
};

// horários
export function generateHours(
  start = state.BUSINESS_HOURS.inicio,
  end = state.BUSINESS_HOURS.fim,
  stepMinutes = 25
) {
  const hours = [];
  const [sh, sm] = String(start || "09:00").split(":").map(Number);
  const [eh, em] = String(end || "19:00").split(":").map(Number);
  let current = new Date(2000, 0, 1, sh, sm, 0);
  const endDate = new Date(2000, 0, 1, eh, em, 0);

  while (current <= endDate) {
    const h = pad2(current.getHours());
    const m = pad2(current.getMinutes());
    hours.push(`${h}:${m}`);
    current.setMinutes(current.getMinutes() + stepMinutes);
  }

  if (!hours.includes("18:30")) hours.push("18:30");
  return hours;
}

state.HOURS = generateHours();

/* ========= Collections / Docs ========= */
export const CFG_DOC_HORARIOS = doc(db, "config", "horarios");
export const CFG_DOC_SEMANA = doc(db, "config", "semana");
export const COL_SERVICOS = collection(db, "servicos");
export const COL_PROF = collection(db, "profissionais");

/**
 * ✅ EXCEÇÕES (PADRÃO ÚNICO)
 * /config/excecoes/dias/{ymd}
 */
export const CFG_DOC_EXCECOES = doc(db, "config", "excecoes");
export const CFG_COL_EXCECOES = collection(db, "config", "excecoes", "dias");
export const cfgExcecaoDoc = (ymd) => doc(db, "config", "excecoes", "dias", String(ymd || ""));

// ✅ Collections para Gestão/Despesas
export const COL_DESPESAS = collection(db, "despesas");
export const COL_VENDAS = collection(db, "vendas");
export const COL_CONTAS_APAGAR = collection(db, "contas_apagar");

/* ========= Profissionais helpers ========= */
export function getProfByColecao(colecao) {
  return (state.PROFESSIONALS || []).find((p) => p.colecao === colecao);
}

export function getProfLabelByColecao(colecao) {
  const found = getProfByColecao(colecao);
  return found?.label || found?.nome || ONLY_PRO.label;
}

/* ========= Sincronização de profissional (Agenda/Relatórios/PDV) ========= */
export function getSelectedColecao() {
  const profissionalSelect = $("#profissionalSelect");
  const v = (profissionalSelect?.value || "").trim();
  if (v) return v;
  return ONLY_PRO.colecao;
}

export function setSelectedColecao(colecao) {
  if (!colecao) return;
  const profissionalSelect = $("#profissionalSelect");
  const relProf = $("#relProf");
  const pdvSaleProfSelect = $("#pdvSaleProf");

  if (profissionalSelect && profissionalSelect.value !== colecao) profissionalSelect.value = colecao;
  if (relProf && relProf.value !== "todos" && relProf.value !== colecao) relProf.value = colecao;
  if (pdvSaleProfSelect && pdvSaleProfSelect.value !== colecao) pdvSaleProfSelect.value = colecao;
}

// ✅ lista só com profissionais ATIVOS + mantém seleção do usuário
export function populateProfessionalSelects() {
  const listAll = state.PROFESSIONALS || [];
  const list = listAll.filter((p) => p && p.ativo !== false);

  const profissionalSelect = $("#profissionalSelect");
  const relProf = $("#relProf");
  const pdvSaleProfSelect = $("#pdvSaleProf");

  if (profissionalSelect) {
    const current = (profissionalSelect.value || "").trim();
    if (!list.length) {
      profissionalSelect.innerHTML = `<option value="${ONLY_PRO.colecao}">Nenhum profissional cadastrado</option>`;
      profissionalSelect.disabled = true;
    } else {
      profissionalSelect.disabled = false;
      const opts = [
        `<option value="todos">Todos</option>`,
        ...list.map((p) => `<option value="${p.colecao}">${p.label || p.nome || p.colecao}</option>`),
      ];
      profissionalSelect.innerHTML = opts.join("");
      const exists = [...profissionalSelect.options].some((o) => o.value === current);
      profissionalSelect.value = exists ? current : "todos";
    }
  }

  if (relProf) {
    const current = (relProf.value || "").trim();
    if (!list.length) {
      relProf.innerHTML = `<option value="todos">Sem profissionais cadastrados</option>`;
      relProf.disabled = true;
    } else {
      relProf.disabled = false;
      const opts = [
        `<option value="todos">Todos os profissionais</option>`,
        ...list.map((p) => `<option value="${p.colecao}">${p.label || p.nome || p.colecao}</option>`),
      ];
      relProf.innerHTML = opts.join("");
      const exists = [...relProf.options].some((o) => o.value === current);
      relProf.value = exists ? current : "todos";
    }
  }

  if (pdvSaleProfSelect) {
    const current = (pdvSaleProfSelect.value || "").trim();
    const firstColecao = list[0]?.colecao || ONLY_PRO.colecao;
    if (!list.length) {
      pdvSaleProfSelect.innerHTML = `<option value="${ONLY_PRO.colecao}">Nenhum profissional cadastrado</option>`;
      pdvSaleProfSelect.disabled = true;
    } else {
      pdvSaleProfSelect.disabled = false;
      pdvSaleProfSelect.innerHTML = list
        .map((p) => `<option value="${p.colecao}">${p.label || p.nome || p.colecao}</option>`)
        .join("");
      const exists = list.some((p) => p.colecao === current);
      pdvSaleProfSelect.value = exists ? current : firstColecao;
    }
  }
}

export function bindProfessionalSync({ onAgendaChange } = {}) {
  const profissionalSelect = $("#profissionalSelect");
  const relProf = $("#relProf");
  const pdvSaleProfSelect = $("#pdvSaleProf");

  profissionalSelect?.addEventListener("change", () => {
    onAgendaChange?.();
  });

  relProf?.addEventListener("change", () => {
    if (relProf.value !== "todos") setSelectedColecao(relProf.value);
  });

  pdvSaleProfSelect?.addEventListener("change", () => {
    setSelectedColecao(pdvSaleProfSelect.value);
  });
}

/* ========= LISTENERS GLOBAIS ========= */
function startGlobalListeners() {
  if (window.__globalListenersStarted) return;
  window.__globalListenersStarted = true;

  onSnapshot(
    query(COL_PROF, orderBy("nome")),
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data() || {};
        const nome = v.nome || "";
        return {
          id: d.id,
          nome,
          label: nome,
          fotoUrl: v.fotoUrl || "",
          whatsapp: v.whatsapp || "",
          ativo: v.ativo !== false,
          colecao: v.colecao || `reservas_${slugify(nome)}`,
        };
      });
      state.PROFESSIONALS = list;
      populateProfessionalSelects();
      console.log(
        "[GLOBAL] profissionais:",
        list.map((p) => ({ id: p.id, nome: p.nome, colecao: p.colecao, ativo: p.ativo }))
      );
    },
    (err) => console.error("Erro listener profissionais (global):", err)
  );

  onSnapshot(
    query(COL_SERVICOS, orderBy("nome")),
    (snap) => {
      state.SERVICOS = snap.docs.map((d) => {
        const v = d.data() || {};
        return {
          id: d.id,
          nome: v.nome || "",
          valor: Number(v.valor || 0),
          tempoMin: Number(v.tempoMin || 30),
          ativo: v.ativo !== false,
        };
      });
      console.log("[GLOBAL] serviços:", state.SERVICOS.length);
    },
    (err) => console.error("Erro listener serviços (global):", err)
  );
}

/* ========= Modal: seleção de serviços ========= */
export function openServicosModal(onSelect) {
  const overlay = document.createElement("div");
  overlay.className = "servicos-modal-overlay";

  const listaHtml = (state.SERVICOS || [])
    .map((s, i) => {
      if (s.placeholder) return "";
      return `
        <button type="button" class="servico-item" data-serv-index="${i}">
          <span class="servico-nome">${s.nome}</span>
          <span class="servico-valor">${formatCurrency(s.valor)}</span>
        </button>
      `;
    })
    .join("");

  overlay.innerHTML = `
    <div class="servicos-modal-box">
      <div class="servicos-modal-header">
        <span>Selecionar serviço</span>
        <button class="btn btn-sm btn-light servicos-close" type="button">&times;</button>
      </div>
      <div class="servicos-modal-body">
        <div class="servicos-search">
          <input id="servicosSearch" type="text" placeholder="Pesquisar serviço..." />
        </div>
        <div class="servicos-list">${listaHtml}</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest(".servicos-close")) close();
  });

  const listEl = overlay.querySelector(".servicos-list");
  listEl?.addEventListener("click", (e) => {
    const btn = e.target.closest(".servico-item");
    if (!btn) return;
    const idx = Number(btn.dataset.servIndex);
    const serv = state.SERVICOS[idx];
    if (serv && onSelect) onSelect(serv);
    close();
  });

  const searchInput = overlay.querySelector("#servicosSearch");
  if (searchInput && listEl) {
    searchInput.addEventListener("input", () => {
      const term = normalize(searchInput.value);
      listEl.querySelectorAll(".servico-item").forEach((btn) => {
        const name = normalize(btn.querySelector(".servico-nome")?.textContent || "");
        btn.style.display = !term || name.includes(term) ? "flex" : "none";
      });
    });
    searchInput.focus();
  }
}

/* ========= Firestore exports ========= */
export {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
  limit,
};

/* ========= INIT ========= */
function setDefaultDates() {
  const dataFiltro = $("#dataFiltro");
  const relDe = $("#relDe");
  const relAte = $("#relAte");
  const expenseDate = $("#expenseDate");
  const expData = $("#expData");
  const cpDataPrimeiroVencimento = $("#cpDataPrimeiroVencimento");

  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = pad2(hoje.getMonth() + 1);
  const d = pad2(hoje.getDate());

  const today = `${y}-${m}-${d}`;

  if (dataFiltro) dataFiltro.value = today;
  if (relDe) relDe.value = `${y}-${m}-01`;
  if (relAte) relAte.value = today;

  if (expenseDate && !expenseDate.value) expenseDate.value = today;
  if (expData && !expData.value) expData.value = today;
  if (cpDataPrimeiroVencimento && !cpDataPrimeiroVencimento.value) cpDataPrimeiroVencimento.value = today;
}

async function init() {
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      showTab(tab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  bindBookingLinkNav();
  bindResumoGeralModal();

  await waitForAuth();

  // ✅ AJUSTE:
  // Deixa datas padrão e selects prontos antes de iniciar as abas,
  // especialmente a aba de relatórios.
  setDefaultDates();
  populateProfessionalSelects();

  startGlobalListeners();

  initAgendaTab();
  initRelatoriosTab();
  initClientesTab();
  initPdvTab();
  initConfiguracoesTab();
  initContasAPagarTab();

  showTab("agenda");
}

document.addEventListener("DOMContentLoaded", init);