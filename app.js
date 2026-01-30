const API_URL = "https://script.google.com/macros/s/AKfycbxOmmT09Q15TI5w3oumKXvQrtMRzLQwZLNzGbc1LlhiUXEO1FK2X3EVmOTnLqLiy90/exec";

let state = {
  data: {},
  activeSheet: null,
  timer: null,
  idx: { date: -1, line: -1, interno: -1 }
};

const $ = (id) => document.getElementById(id);

const elTabs = $("tabs");
const elContent = $("content");
const elConn = $("conn");
const elNow = $("now");
const elDate = $("dateFilter");
const elDateMode = $("dateMode");
const elLine = $("lineFilter");
const elInterno = $("internoFilter");
const elQ = $("q");
const elAuto = $("autoRefresh");
const elRefresh = $("refreshBtn");

const elCntTotal = $("cntTotal");
const elCntToday = $("cntToday");
const elCntShowing = $("cntShowing");

function setConn(kind, msg){
  elConn.textContent = msg;
  elConn.className = "pill " + (kind === "ok" ? "pill-ok" : kind === "bad" ? "pill-bad" : "pill-warn");
}

function isoToday(){
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return tz.toISOString().slice(0,10);
}

function tickNow(){
  elNow.textContent = new Date().toLocaleString("es-AR");
}
setInterval(tickNow, 1000);
tickNow();

elDate.value = isoToday(); // modo operativo: hoy

elRefresh.addEventListener("click", () => loadAll(true));
elAuto.addEventListener("change", setupAutoRefresh);

elDate.addEventListener("change", renderActive);
elDateMode.addEventListener("change", renderActive);
elLine.addEventListener("change", renderActive);
elInterno.addEventListener("input", renderActive);
elQ.addEventListener("input", renderActive);

function loadJsonp(url){
  return new Promise((resolve, reject) => {
    const cbName = "__cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${cbName}&_=${Date.now()}`;

    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("JSONP load error")); };

    function cleanup(){
      try { delete window[cbName]; } catch { window[cbName] = undefined; }
      script.remove();
    }

    document.body.appendChild(script);

    setTimeout(() => {
      if (window[cbName]) { cleanup(); reject(new Error("JSONP timeout")); }
    }, 15000);
  });
}

async function loadAll(manual=false){
  try{
    setConn("warn", manual ? "Actualizando…" : "Conectando…");
    const json = await loadJsonp(API_URL);

    state.data = json || {};
    const sheets = Object.keys(state.data);

    if (!state.activeSheet || !state.data[state.activeSheet]) {
      state.activeSheet = sheets[0] || null;
    }

    renderTabs(sheets);
    hydrateLineOptions(); // llena combo linea según hoja activa y fecha
    renderActive();

    setConn("ok", "Conectado");
  } catch (e){
    console.error(e);
    setConn("bad", "Sin conexión");
    elContent.innerHTML = `<div class="card sheet">
      No se pudo cargar el Google Sheet. Revisá:
      <div style="margin-top:8px;color:rgba(169,181,214,.85);font-size:12px">
        Apps Script: acceso “Cualquiera” + redeploy “Nueva versión”.
      </div>
    </div>`;
  }
}

function renderTabs(sheets){
  elTabs.innerHTML = "";
  sheets.forEach(name => {
    const b = document.createElement("button");
    b.className = "tab" + (name === state.activeSheet ? " active" : "");
    b.textContent = name;
    b.addEventListener("click", () => {
      state.activeSheet = name;
      // reset filtros específicos hoja
      elLine.value = "";
      elInterno.value = "";
      elQ.value = "";
      hydrateLineOptions();
      renderTabs(sheets);
      renderActive();
    });
    elTabs.appendChild(b);
  });
}

/** Detecta columnas por encabezado */
function computeIndexes(headers){
  const norm = headers.map(h => String(h||"").trim().toUpperCase());

  const idxDate = norm.findIndex(h => ["DIA","FECHA","DATE"].includes(h));
  const idxLine = norm.findIndex(h => ["LINEA","LÍNEA","LINE"].includes(h));
  const idxInt  = norm.findIndex(h => ["INTERNO","INT","COCHE","UNIDAD","INTERNA"].includes(h));

  state.idx = { date: idxDate, line: idxLine, interno: idxInt };
}

function normalizeDateCell(s){
  const v = String(s ?? "").trim();
  if (!v) return "";

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // dd/mm/yyyy o dd-mm-yyyy
  const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m){
    const dd = String(m[1]).padStart(2,"0");
    const mm = String(m[2]).padStart(2,"0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Si viene como Date (Sheets a veces lo trae como objeto Date serializado raro),
  // intentamos parsear por Date()
  const d = new Date(v);
  if (!isNaN(d.getTime())){
    const tz = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return tz.toISOString().slice(0,10);
  }

  return "";
}

/** Arma el select de líneas según hoja activa y fecha (si aplica) */
function hydrateLineOptions(){
  const sheet = state.data[state.activeSheet];
  if (!sheet) return;

  const headers = sheet.headers || [];
  const rows = sheet.rows || [];

  computeIndexes(headers);
  const { date: idxDate, line: idxLine } = state.idx;

  // Si no hay columna LINEA, dejamos el select pero sin opciones extra
  const base = `<option value="">Todas</option>`;
  if (idxLine < 0){
    elLine.innerHTML = base;
    elLine.disabled = true;
    return;
  }
  elLine.disabled = false;

  const dateMode = elDateMode.value; // today/all
  const targetDate = elDate.value;

  const set = new Set();
  rows.forEach(r => {
    // En modo “Solo hoy”, recorta opciones a lo de hoy (si hay fecha)
    if (dateMode === "today" && idxDate >= 0 && targetDate){
      const norm = normalizeDateCell(r[idxDate]);
      if (norm && norm !== targetDate) return;
    }
    const val = String(r[idxLine] ?? "").trim();
    if (val) set.add(val);
  });

  const options = Array.from(set).sort((a,b)=>a.localeCompare(b, "es", {numeric:true}));
  elLine.innerHTML = base + options.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join("");
}

function renderActive(){
  const sheet = state.data[state.activeSheet];
  if (!sheet){
    elContent.innerHTML = `<div class="card sheet">No hay datos.</div>`;
    elCntTotal.textContent = "—";
    elCntToday.textContent = "—";
    elCntShowing.textContent = "—";
    return;
  }

  const headers = sheet.headers || [];
  const rows = sheet.rows || [];

  computeIndexes(headers);
  const { date: idxDate, line: idxLine, interno: idxInt } = state.idx;

  const dateMode = elDateMode.value;   // today/all
  const targetDate = elDate.value;     // yyyy-mm-dd
  const lineVal = (elLine.value || "").trim();
  const internoVal = (elInterno.value || "").trim().toLowerCase();
  const q = (elQ.value || "").trim().toLowerCase();

  // Contadores base
  const total = rows.length;

  // Count "today" si existe fecha
  let todayCount = 0;
  if (idxDate >= 0){
    todayCount = rows.reduce((acc, r) => {
      const norm = normalizeDateCell(r[idxDate]);
      return acc + (norm && norm === targetDate ? 1 : 0);
    }, 0);
  } else {
    // Si no hay fecha, "Hoy" = total (no se puede cortar)
    todayCount = total;
  }

  // Aplicar filtros
  let filtered = rows.filter(r => {
    // Fecha: modo operativo por defecto
    if (dateMode === "today" && idxDate >= 0 && targetDate){
      const norm = normalizeDateCell(r[idxDate]);
      if (norm && norm !== targetDate) return false;
    }

    // Línea
    if (idxLine >= 0 && lineVal){
      const v = String(r[idxLine] ?? "").trim();
      if (v !== lineVal) return false;
    }

    // Interno
    if (idxInt >= 0 && internoVal){
      const v = String(r[idxInt] ?? "").toLowerCase();
      if (!v.includes(internoVal)) return false;
    }

    // Búsqueda general
    if (q){
      const hay = r.some(c => String(c ?? "").toLowerCase().includes(q));
      if (!hay) return false;
    }

    return true;
  });

  // Ordenado: si hay fecha, por fecha desc (más reciente primero), y luego por texto
  if (idxDate >= 0){
    filtered = filtered.slice().sort((a,b) => {
      const da = normalizeDateCell(a[idxDate]) || "0000-00-00";
      const db = normalizeDateCell(b[idxDate]) || "0000-00-00";
      if (da !== db) return db.localeCompare(da); // desc
      // fallback: por interno si existe
      if (idxInt >= 0){
        const ia = String(a[idxInt] ?? "");
        const ib = String(b[idxInt] ?? "");
        return ia.localeCompare(ib, "es", {numeric:true});
      }
      return 0;
    });
  }

  // Contadores finales
  elCntTotal.textContent = String(total);
  elCntToday.textContent = String(todayCount);
  elCntShowing.textContent = String(filtered.length);

  // Rehidratar líneas si cambió fecha/mode (para que coincidan con el contexto operativo)
  // (sin pisar selección actual si existe)
  const currentLine = elLine.value;
  hydrateLineOptions();
  if (currentLine) elLine.value = currentLine;

  // Render tabla
  elContent.innerHTML = `
    <div class="card sheet">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <div class="tag ${dateMode === "today" ? "ok" : "warn"}">
          ${dateMode === "today" ? "Modo operativo: HOY" : "Modo: todas las fechas"}
        </div>
        <div class="tag">
          Hoja: <strong style="color:var(--text)">${escapeHtml(state.activeSheet || "")}</strong>
        </div>
        ${idxDate >= 0 ? `<div class="tag">Fecha detectada ✓</div>` : `<div class="tag warn">Sin columna fecha</div>`}
        ${idxLine >= 0 ? `<div class="tag">Línea detectada ✓</div>` : `<div class="tag warn">Sin columna línea</div>`}
        ${idxInt  >= 0 ? `<div class="tag">Interno detectado ✓</div>` : `<div class="tag warn">Sin columna interno</div>`}
      </div>

      <div class="table-wrap">
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
    </div>
  `;
}

function escapeHtml(v){
  const s = String(v ?? "");
  return s.replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}
function escapeHtmlAttr(v){
  return escapeHtml(v).replace(/"/g, "&quot;");
}

function setupAutoRefresh(){
  if (state.timer) clearInterval(state.timer);
  const sec = Number(elAuto.value || "0");
  if (sec > 0) state.timer = setInterval(() => loadAll(false), sec * 1000);
}

// INIT
setupAutoRefresh();
loadAll(false);
