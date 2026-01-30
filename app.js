// ======== 4) GitHub Pages: app.js (JSONP, evita CORS) ========
// Mantener nombres EXACTOS: index.html, styles.css, app.js

const API_URL = "https://script.google.com/macros/s/AKfycbxOmmT09Q15TI5w3oumKXvQrtMRzLQwZLNzGbc1LlhiUXEO1FK2X3EVmOTnLqLiy90/exec";

let state = { data: {}, activeSheet: null, timer: null };

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
  return tz.toISOString().slice(0, 10);
}

function tickNow(){ elNow.textContent = new Date().toLocaleString("es-AR"); }
setInterval(tickNow, 1000); tickNow();
elDate.value = isoToday();

elRefresh.addEventListener("click", () => loadAll(true));
elQ.addEventListener("input", renderActive);
elDate.addEventListener("change", renderActive);
elAuto.addEventListener("change", setupAutoRefresh);

function setConn(ok, msg) {
  elConn.textContent = msg;
  elConn.className = "pill " + (ok ? "pill-ok" : "pill-warn");
}

function loadJsonp(url) {
  return new Promise((resolve, reject) => {
    const cbName = "__cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${cbName}&_=${Date.now()}`;

    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("JSONP load error")); };

    function cleanup() {
      try { delete window[cbName]; } catch { window[cbName] = undefined; }
      script.remove();
    }

    document.body.appendChild(script);

    setTimeout(() => {
      if (window[cbName]) { cleanup(); reject(new Error("JSONP timeout")); }
    }, 15000);
  });
}

async function loadAll(manual = false) {
  try {
    setConn(false, manual ? "Actualizando…" : "Conectando…");
    const json = await loadJsonp(API_URL);

    state.data = json;
    const sheets = Object.keys(json);
    state.activeSheet = (state.activeSheet && json[state.activeSheet]) ? state.activeSheet : (sheets[0] || null);

    renderTabs(sheets);
    renderActive();
    setConn(true, "Conectado");
  } catch (e) {
    console.error(e);
    elContent.innerHTML =
      `<div class="card sheet">No se pudo cargar el Sheet. Verificar Apps Script: acceso "Cualquiera" + "Nueva versión" redeploy.</div>`;
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
    b.onclick = () => { state.activeSheet = name; renderTabs(sheets); renderActive(); };
    elTabs.appendChild(b);
  });
}

function renderActive() {
  const sheet = state.data[state.activeSheet];
  if (!sheet) { elContent.innerHTML = `<div class="card sheet">No hay datos.</div>`; return; }

  const headers = sheet.headers || [];
  const rows = sheet.rows || [];
  const q = (elQ.value || "").trim().toLowerCase();
  const dateStr = elDate.value;

  const idxDia = headers.findIndex(h => {
    const up = String(h || "").trim().toUpperCase();
    return up === "DIA" || up === "FECHA" || up === "DATE";
  });

  const filtered = rows.filter(r => {
    if (idxDia >= 0 && dateStr) {
      const norm = normalizeDate(String(r[idxDia] ?? "").trim());
      if (norm && norm !== dateStr) return false;
    }
    if (q) return r.some(c => String(c ?? "").toLowerCase().includes(q));
    return true;
  });

  elContent.innerHTML = `
    <div class="card sheet">
      <table>
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${filtered.map(r => `<tr>${headers.map((_,i)=>`<td>${escapeHtml(r[i])}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function normalizeDate(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
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

// init
setupAutoRefresh();
loadAll();
