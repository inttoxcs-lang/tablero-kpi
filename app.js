const API_URL = "https://script.google.com/macros/s/AKfycbxOmmT09Q15TI5w3oumKXvQrtMRzLQwZLNzGbc1LlhiUXEO1FK2X3EVmOTnLqLiy90/exec";

let state = {
  data: {},
  activeSheet: null,
  timer: null,
  idx: { date: -1, line: -1, interno: -1, status: -1 }
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
const elStatus = $("statusFilter");
const elQ = $("q");
const elAuto = $("autoRefresh");
const elRefresh = $("refreshBtn");
const elDensity = $("density");

const elCntTotal = $("cntTotal");
const elCntToday = $("cntToday");
const elCntShowing = $("cntShowing");
const elCntOpen = $("cntOpen");
const elCntProg = $("cntProg");
const elCntClosed = $("cntClosed");

const elCompact = $("compactToggle");
const elWall = $("wallToggle");
const elFiltersPanel = $("filtersPanel");
const elToggleFiltersBtn = $("toggleFiltersBtn");
const elTodayBtn = $("todayBtn");
const elClearBtn = $("clearBtn");

function setConn(kind, msg){
  elConn.textContent = msg;
  elConn.className = "pill " + (kind === "ok" ? "pill-ok" : kind === "bad" ? "pill-bad" : "pill-warn");
}

function isoToday(){
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return tz.toISOString().slice(0,10);
}
function tickNow(){ elNow.textContent = new Date().toLocaleString("es-AR"); }
setInterval(tickNow, 1000); tickNow();
elDate.value = isoToday();

const LS = {
  compact: "tsj_compact_v2",
  wall: "tsj_wall_v1",
  collapsed: "tsj_filters_collapsed_v2",
  density: "tsj_density_v1"
};

function applyCompact(on){
  document.body.classList.toggle("compact", !!on);
  elCompact.checked = !!on;
  localStorage.setItem(LS.compact, on ? "1" : "0");
}
function applyWall(on){
  document.body.classList.toggle("wall", !!on);
  elWall.checked = !!on;
  // en pared, fuerza compacta
  if (on) { applyCompact(true); applyCollapsed(true); }
  localStorage.setItem(LS.wall, on ? "1" : "0");
}
function applyCollapsed(on){
  elFiltersPanel.classList.toggle("collapsed", !!on);
  elToggleFiltersBtn.textContent = on ? "Mostrar filtros" : "Ocultar filtros";
  localStorage.setItem(LS.collapsed, on ? "1" : "0");
}
function applyDensity(mode){
  document.body.classList.toggle("ultra", mode === "ultra");
  // compacta se maneja aparte; ultra es un extra
  elDensity.value = mode;
  localStorage.setItem(LS.density, mode);
}

// restore
applyCompact(localStorage.getItem(LS.compact) === "1");
applyWall(localStorage.getItem(LS.wall) === "1");
applyCollapsed(localStorage.getItem(LS.collapsed) === "1");
applyDensity(localStorage.getItem(LS.density) || "normal");

// events
elCompact.addEventListener("change", () => applyCompact(elCompact.checked));
elWall.addEventListener("change", () => applyWall(elWall.checked));
elToggleFiltersBtn.addEventListener("click", () => applyCollapsed(!elFiltersPanel.classList.contains("collapsed")));
elDensity.addEventListener("change", () => applyDensity(elDensity.value));

elTodayBtn.addEventListener("click", () => {
  elDate.value = isoToday();
  elDateMode.value = "today";
  hydrateLineOptions();
  renderActive();
});

elClearBtn.addEventListener("click", () => {
  elLine.value = "";
  elInterno.value = "";
  elStatus.value = "";
  elQ.value = "";
  renderActive();
});

elRefresh.addEventListener("click", () => loadAll(true));
elAuto.addEventListener("change", setupAutoRefresh);

elDate.addEventListener("change", () => { hydrateLineOptions(); renderActive(); });
elDateMode.addEventListener("change", () => { hydrateLineOptions(); renderActive(); });
elLine.addEventListener("change", renderActive);
elInterno.addEventListener("input", renderActive);
elStatus.addEventListener("change", renderActive);
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
    hydrateLineOptions();
    renderActive();

    setConn("ok", "Conectado");
  } catch (e){
    console.error(e);
    setConn("bad", "Sin conexión");
    elContent.innerHTML = `<div class="card sheet">
      No se pudo cargar el Google Sheet. Verificar Apps Script:
      <div style="margin-top:8px;color:rgba(169,181,214,.85);font-size:12px">
        Acceso “Cualquiera” + redeploy “Nueva versión”.
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
      elLine.value = "";
      elInterno.value = "";
      elStatus.value = "";
      elQ.value = "";
      hydrateLineOptions();
      renderTabs(sheets);
      renderActive();
    });
    elTabs.appendChild(b);
  });
}

function computeIndexes(headers){
  const norm = headers.map(h => String(h||"").trim().toUpperCase());

  const idxDate = norm.findIndex(h => ["DIA","FECHA","DATE"].includes(h));
  const idxLine = norm.findIndex(h => ["LINEA","LÍNEA","LINE"].includes(h));
  const idxInt  = norm.findIndex(h => ["INTERNO","INT","COCHE","UNIDAD","INTERNA"].includes(h));
  const idxSt   = norm.findIndex(h => ["ESTADO","STATUS"].includes(h));

  state.idx = { date: idxDate, line: idxLine, interno: idxInt, status: idxSt };
}

function normalizeDateCell(s){
  const v = String(s ?? "").trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m){
    const dd = String(m[1]).padStart(2,"0");
    const mm = String(m[2]).padStart(2,"0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())){
    const tz = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return tz.toISOString().slice(0,10);
  }
  return "";
}

function normStatus(v){
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return "";
  if (s.includes("ABIER")) return "ABIERTO";
  if (s.includes("PROCES")) return "EN PROCESO";
  if (s.includes("CERR")) return "CERRADO";
  return s;
}

function hydrateLineOptions(){
  const sheet = state.data[state.activeSheet];
  if (!sheet) return;

  const headers = sheet.headers || [];
  const rows = sheet.rows || [];
  computeIndexes(headers);

  const { date: idxDate, line: idxLine } = state.idx;

  const base = `<option value="">Todas</option>`;
  if (idxLine < 0){
    elLine.innerHTML = base;
    elLine.disabled = true;
    return;
  }
  elLine.disabled = false;

  const dateMode = elDateMode.value;
  const targetDate = elDate.value;

  const set = new Set();
  rows.forEach(r => {
    if (dateMode === "today" && idxDate >= 0 && targetDate){
      const norm = normalizeDateCell(r[idxDate]);
      if (norm && norm !== targetDate) return;
    }
    const val = String(r[idxLine] ?? "").trim();
    if (val) set.add(val);
  });

  const options = Array.from(set).sort((a,b)=>a.localeCompare(b, "es", {numeric:true}));
  const current = elLine.value;

  elLine.innerHTML = base + options.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join("");
  if (current) elLine.value = current;
}

function renderActive(){
  const sheet = state.data[state.activeSheet];
  if (!sheet){
    elContent.innerHTML = `<div class="card sheet">No hay datos.</div>`;
    setCounts(null);
    return;
  }

  const headers = sheet.headers || [];
  const rows = sheet.rows || [];
  computeIndexes(headers);

  const { date: idxDate, line: idxLine, interno: idxInt, status: idxSt } = state.idx;

  const dateMode = elDateMode.value;
  const targetDate = elDate.value;
  const lineVal = (elLine.value || "").trim();
  const internoVal = (elInterno.value || "").trim().toLowerCase();
  const statusVal = (elStatus.value || "").trim().toUpperCase();
  const q = (elQ.value || "").trim().toLowerCase();

  const total = rows.length;

  const isTodayRow = (r) => {
    if (idxDate < 0 || !targetDate) return true;
    const norm = normalizeDateCell(r[idxDate]);
    return !norm || norm === targetDate;
  };

  const todayCount = (idxDate >= 0) ? rows.filter(isTodayRow).length : total;

  let filtered = rows.filter(r => {
    if (dateMode === "today" && idxDate >= 0 && targetDate){
      if (!isTodayRow(r)) return false;
    }
    if (idxLine >= 0 && lineVal){
      const v = String(r[idxLine] ?? "").trim();
      if (v !== lineVal) return false;
    }
    if (idxInt >= 0 && internoVal){
      const v = String(r[idxInt] ?? "").toLowerCase();
      if (!v.includes(internoVal)) return false;
    }
    if (statusVal && idxSt >= 0){
      const st = normStatus(r[idxSt]);
      if (st !== statusVal) return false;
    } else if (statusVal && idxSt < 0){
      return false; // pidieron estado pero no existe columna
    }
    if (q){
      const hay = r.some(c => String(c ?? "").toLowerCase().includes(q));
      if (!hay) return false;
    }
    return true;
  });

  // Orden por fecha desc y luego interno
  if (idxDate >= 0){
    filtered = filtered.slice().sort((a,b) => {
      const da = normalizeDateCell(a[idxDate]) || "0000-00-00";
      const db = normalizeDateCell(b[idxDate]) || "0000-00-00";
      if (da !== db) return db.localeCompare(da);
      if (idxInt >= 0){
        const ia = String(a[idxInt] ?? "");
        const ib = String(b[idxInt] ?? "");
        return ia.localeCompare(ib, "es", {numeric:true});
      }
      return 0;
    });
  }

  // Contadores por estado (solo si existe columna)
  let open=0, prog=0, closed=0;
  if (idxSt >= 0){
    const baseRows = (dateMode === "today") ? rows.filter(isTodayRow) : rows;
    baseRows.forEach(r => {
      const st = normStatus(r[idxSt]);
      if (st === "ABIERTO") open++;
      else if (st === "EN PROCESO") prog++;
      else if (st === "CERRADO") closed++;
    });
  }

  setCounts({ total, todayCount, showing: filtered.length, open, prog, closed, hasStatus: idxSt >= 0 });

  // Render tabla con semáforo por fila
  const idxStatusForRow = idxSt;

  elContent.innerHTML = `
    <div class="card sheet">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${filtered.map(r => {
              const rowClass = (idxStatusForRow >= 0)
                ? (normStatus(r[idxStatusForRow]) === "ABIERTO" ? "row-open" :
                   normStatus(r[idxStatusForRow]) === "EN PROCESO" ? "row-prog" :
                   normStatus(r[idxStatusForRow]) === "CERRADO" ? "row-closed" : "")
                : "";

              return `<tr class="${rowClass}">
                ${headers.map((_,i)=>`<td>${escapeHtml(r[i])}</td>`).join("")}
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function setCounts(payload){
  if (!payload){
    elCntTotal.textContent = elCntToday.textContent = elCntShowing.textContent = "—";
    elCntOpen.textContent = elCntProg.textContent = elCntClosed.textContent = "—";
    return;
  }
  elCntTotal.textContent = String(payload.total);
  elCntToday.textContent = String(payload.todayCount);
  elCntShowing.textContent = String(payload.showing);

  if (payload.hasStatus){
    elCntOpen.textContent = String(payload.open);
    elCntProg.textContent = String(payload.prog);
    elCntClosed.textContent = String(payload.closed);
  } else {
    elCntOpen.textContent = elCntProg.textContent = elCntClosed.textContent = "—";
  }
}

function escapeHtml(v){
  const s = String(v ?? "");
  return s.replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}
function escapeHtmlAttr(v){ return escapeHtml(v).replace(/"/g, "&quot;"); }

function setupAutoRefresh(){
  if (state.timer) clearInterval(state.timer);
  const sec = Number(elAuto.value || "0");
  if (sec > 0) state.timer = setInterval(() => loadAll(false), sec * 1000);
}

setupAutoRefresh();
loadAll(false);
