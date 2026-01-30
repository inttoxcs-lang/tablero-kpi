// URL del Apps Script (Web App) - ya pegada ✅
const API_URL = "https://script.google.com/macros/s/AKfycbxOmmT09Q15TI5w3oumKXvQrtMRzLQwZLNzGbc1LlhiUXEO1FK2X3EVmOTnLqLiy90/exec";

let state = {
  data: {},
  activeSheet: null,
  timer: null
};

const elTabs = document.getElementById("tabs");
const elContent = document.getElementById("content");
const elConn = document.getElementById("conn");
const elNow = document.getElementById("now");
const elDate = document.getElementById("dateFilter");
const elQ = document.getElementById("q");
const elAuto = document.getElementById("autoRefresh");
const elRefresh = document.getElementById("refreshBtn");

function isoToday() {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0,10);
}

function tickNow() {
  elNow.textContent = new Date().toLocaleString("es-AR");
}
setInterval(tickNow, 1000);
tickNow();

elDate.value = isoToday();

elRefresh.addEventListener("click", () => loadAll(true));
elQ.addEventListener("input", () => renderActive());
elDate.addEventListener("change", () => renderActive());
elAuto.addEventListener("change", () => setupAutoRefresh());

function setConn(ok, msg) {
  elConn.textContent = msg;
  elConn.className = "pill " + (ok ? "pill-ok" : "pill-warn");
}

async function loadAll(manual = false) {
  try {
    setConn(false, manual ? "Actualizando…" : "Conectando…");
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();

    state.data = json;
    const sheets = Object.keys(json);

    if (!state.activeSheet || !json[state.activeSheet]) {
      state.activeSheet = sheets[0] || null;
    }

    renderTabs(sheets);
    renderActive();
    setConn(true, "Conectado");
  } catch (e) {
    console.error(e);
    elContent.innerHTML = `<div class="card sheet">No se pudo cargar el Sheet. Revisá permisos del Apps Script y que sea "Cualquiera".</div>`;
    elConn.className = "pill pill-bad";
    elConn.textContent = "Sin conexión";
  }
}

function renderTabs(sheets) {
  elTabs.innerHTML = "";
  sheets.forEach(name => {
    const b = document.createElement("button");
    b.className = "tab" + (name === state.activeSheet ? " active" : "");
    b.textContent = name;
    b.addEventListener("click", () => {
      state.activeSheet = name;
      renderTabs(sheets);
      renderActive();
    });
    elTabs.appendChild(b);
  });
}

function renderActive() {
  const sheet = state.data[state.activeSheet];
  if (!sheet) {
    elContent.innerHTML = `<div class="card sheet">No hay datos.</div>`;
    return;
  }

  const headers = sheet.headers || [];
  const rows = sheet.rows || [];
  const q = (elQ.value || "").trim().toLowerCase();
  const dateStr = elDate.value;

  // Detecta columna DIA/FECHA si existe
  const idxDia = headers.findIndex(h => {
    const up = String(h || "").trim().toUpperCase();
    return up === "DIA" || up === "FECHA" || up === "DATE";
  });

  const filtered = rows.filter(r => {
    // Filtro por fecha (solo si existe columna)
    if (idxDia >= 0 && dateStr) {
      const cell = String(r[idxDia] ?? "").trim();
      const norm = normalizeDate(cell);
      if (norm && norm !== dateStr) return false;
    }

    // Búsqueda libre
    if (q) {
      const hay = r.some(c => String(c ?? "").toLowerCase().includes(q));
      if (!hay) return false;
    }
    return true;
  });

  elContent.innerHTML = `
    <div class="card sheet">
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${filtered.map(r => `
            <tr>
              ${headers.map((_,i)=>`<td>${escapeHtml(r[i])}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function normalizeDate(s) {
  if (!s) return "";

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2,"0");
    const mm = String(m[2]).padStart(2,"0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function escapeHtml(v) {
  const s = String(v ?? "");
  return s.replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

function setupAutoRefresh() {
  if (state.timer) clearInterval(state.timer);
  const sec = Number(elAuto.value || "0");
  if (sec > 0) state.timer = setInterval(loadAll, sec * 1000);
}

setupAutoRefresh();
loadAll();
