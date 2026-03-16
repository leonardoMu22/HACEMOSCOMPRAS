
import { useState, useRef, useEffect } from "react";

const STORAGE_KEY = "family_shopping_app";

const DEFAULT_STATE = {
  familiares: ["Mamá", "Papá", "Hijo/a"],
  listaHogar: [],
  listasEspeciales: [],
  familiarActivo: "Mamá",
};

function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? { ...DEFAULT_STATE, ...JSON.parse(s) } : DEFAULT_STATE;
  } catch { return DEFAULT_STATE; }
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

const COLORS = ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8","#F7DC6F","#BB8FCE","#F0B27A"];
const familiarColor = (familiares, nombre) => COLORS[familiares.indexOf(nombre) % COLORS.length] || "#ccc";

async function callClaude(messages, systemPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("") || "";
}

async function analyzeImageWithClaude(base64, mediaType, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: prompt }
        ]
      }]
    }),
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("") || "";
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function extractFramesFromVideo(file, numFrames = 5) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    const frames = [];
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const times = Array.from({ length: numFrames }, (_, i) => (duration / (numFrames + 1)) * (i + 1));
      let idx = 0;
      const capture = () => {
        if (idx >= times.length) { URL.revokeObjectURL(url); resolve(frames); return; }
        video.currentTime = times[idx];
      };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640; canvas.height = 360;
        canvas.getContext("2d").drawImage(video, 0, 0, 640, 360);
        frames.push(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
        idx++; capture();
      };
      capture();
    };
    video.onerror = () => resolve([]);
  });
}

function Badge({ color, text }) {
  return <span style={{ background: color, color: "#fff", borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 700, marginLeft: 6 }}>{text}</span>;
}

function ItemCard({ item, familiares, onToggle, onDelete }) {
  const col = familiarColor(familiares, item.quien);
  return (
    <div style={{ display: "flex", alignItems: "center", background: item.comprado ? "#f0fdf4" : "#fff", borderRadius: 14, padding: "10px 14px", marginBottom: 8, boxShadow: "0 2px 8px #0001", opacity: item.comprado ? 0.7 : 1, transition: "all .2s" }}>
      <button onClick={() => onToggle(item.id)} style={{ background: item.comprado ? "#22c55e" : "#e5e7eb", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>{item.comprado ? "✓" : ""}</button>
      <div style={{ flex: 1, marginLeft: 12 }}>
        <span style={{ fontWeight: 600, textDecoration: item.comprado ? "line-through" : "none", color: item.comprado ? "#9ca3af" : "#1f2937" }}>{item.cantidad > 1 ? `${item.cantidad}x ` : ""}{item.nombre}</span>
        {item.categoria && <span style={{ marginLeft: 8, fontSize: 11, background: "#f3f4f6", borderRadius: 8, padding: "1px 7px", color: "#6b7280" }}>{item.categoria}</span>}
        <div><Badge color={col} text={item.quien} /></div>
      </div>
      <button onClick={() => onDelete(item.id)} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 18, cursor: "pointer" }}>×</button>
    </div>
  );
}

function AgregarItemForm({ familiares, familiarActivo, onAdd, loading }) {
  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [quien, setQuien] = useState(familiarActivo);

  useEffect(() => setQuien(familiarActivo), [familiarActivo]);

  const handleAdd = async () => {
    if (!nombre.trim()) return;
    let categoria = "";
    try {
      const resp = await callClaude(
        [{ role: "user", content: `Producto: "${nombre}". Respondé SOLO con el nombre de la categoría de supermercado más adecuada en español (ej: Lácteos, Verduras, Carnes, Bebidas, Limpieza, Panadería, Snacks, Congelados, etc.). Una sola palabra o frase corta.` }],
        "Sos un asistente que categoriza productos de supermercado. Respondé siempre con UNA sola categoría corta en español."
      );
      categoria = resp.trim().replace(/[.\n]/g, "");
    } catch {}
    onAdd({ nombre: nombre.trim(), cantidad: Number(cantidad), quien, categoria, id: Date.now(), comprado: false, fecha: new Date().toLocaleDateString("es-AR") });
    setNombre(""); setCantidad(1);
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      <input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="Agregar producto..." style={{ flex: 2, minWidth: 150, borderRadius: 10, border: "2px solid #e5e7eb", padding: "8px 12px", fontSize: 15 }} />
      <input type="number" min={1} max={99} value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ width: 60, borderRadius: 10, border: "2px solid #e5e7eb", padding: "8px", fontSize: 15, textAlign: "center" }} />
      <select value={quien} onChange={e => setQuien(e.target.value)} style={{ borderRadius: 10, border: "2px solid #e5e7eb", padding: "8px", fontSize: 14 }}>
        {familiares.map(f => <option key={f}>{f}</option>)}
      </select>
      <button onClick={handleAdd} disabled={loading || !nombre.trim()} style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
        {loading ? "..." : "+ Agregar"}
      </button>
    </div>
  );
}

function IASection({ onAddItems, lista }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState("");
  const [modo, setModo] = useState("foto");
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true); setResultado("");
    try {
      let text = "";
      if (modo === "foto") {
        const b64 = await fileToBase64(file);
        text = await analyzeImageWithClaude(b64, file.type,
          `Analizá esta imagen de una heladera/alacena. Listá en JSON los productos visibles y los que probablemente falten. Formato: {"tienen":["item1","item2"],"faltan":["item3","item4"]}. Solo JSON, sin texto extra.`
        );
      } else {
        const frames = await extractFramesFromVideo(file, 4);
        const results = [];
        for (const f of frames) {
          const r = await analyzeImageWithClaude(f, "image/jpeg",
            `Analizá este frame de un video de una alacena/heladera. Listá productos visibles. Respondé solo con una lista separada por comas.`
          );
          results.push(r);
        }
        text = await callClaude(
          [{ role: "user", content: `Tengo estos productos identificados en distintos frames de un video de mi alacena: ${results.join(" | ")}. Consolidá la lista eliminando duplicados y sugerí qué productos básicos podrían faltar. Formato JSON: {"tienen":["item1"],"faltan":["item2"]}. Solo JSON.` }],
          "Sos un asistente de cocina que analiza inventarios de alacenas."
        );
      }
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResultado(parsed);
    } catch (err) {
      setResultado({ error: "No pude analizar. Intentá con otra imagen." });
    }
    setLoading(false);
    e.target.value = "";
  };

  const addToList = (items) => {
    const nuevos = items.filter(n => !lista.find(i => i.nombre.toLowerCase() === n.toLowerCase()));
    onAddItems(nuevos);
  };

  return (
    <div style={{ background: "linear-gradient(135deg,#667eea22,#764ba222)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, color: "#4c1d95" }}>🤖 Análisis con IA</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["foto","video"].map(m => (
          <button key={m} onClick={() => setModo(m)} style={{ padding: "6px 16px", borderRadius: 20, border: "2px solid #764ba2", background: modo === m ? "#764ba2" : "transparent", color: modo === m ? "#fff" : "#764ba2", fontWeight: 700, cursor: "pointer" }}>
            {m === "foto" ? "📷 Foto" : "🎥 Video"}
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept={modo === "foto" ? "image/*" : "video/*"} style={{ display: "none" }} onChange={handleFile} />
      <button onClick={() => fileRef.current.click()} disabled={loading} style={{ background: "linear-gradient(135deg,#f093fb,#f5576c)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 15, width: "100%" }}>
        {loading ? "⏳ Analizando..." : `📁 Subir ${modo === "foto" ? "foto" : "video"} de alacena/heladera`}
      </button>
      {resultado && !resultado.error && (
        <div style={{ marginTop: 12 }}>
          {resultado.tienen?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700, color: "#059669", marginBottom: 4 }}>✅ Lo que tenés:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {resultado.tienen.map((i, idx) => <span key={idx} style={{ background: "#d1fae5", color: "#065f46", borderRadius: 12, padding: "3px 10px", fontSize: 13 }}>{i}</span>)}
              </div>
            </div>
          )}
          {resultado.faltan?.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>🛒 Lo que falta:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {resultado.faltan.map((i, idx) => <span key={idx} style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "3px 10px", fontSize: 13 }}>{i}</span>)}
              </div>
              <button onClick={() => addToList(resultado.faltan)} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>
                + Agregar todos a la lista
              </button>
            </div>
          )}
        </div>
      )}
      {resultado?.error && <div style={{ color: "#dc2626", marginTop: 8 }}>{resultado.error}</div>}
    </div>
  );
}

function AsistenteCompras({ lista, familiares, onToggle }) {
  const [loading, setLoading] = useState(false);
  const [detectados, setDetectados] = useState([]);
  const fileRef = useRef();
  const pendientes = lista.filter(i => !i.comprado);
  const comprados = lista.filter(i => i.comprado);

  const handleFotoChango = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true); setDetectados([]);
    try {
      const b64 = await fileToBase64(file);
      const listaStr = pendientes.map(i => i.nombre).join(", ");
      const resp = await analyzeImageWithClaude(b64, file.type,
        `Tengo esta lista de compras pendiente: [${listaStr}]. Analizá la imagen del carrito/chango de supermercado y decime cuáles de esos productos ya están en el carrito. Respondé SOLO con un JSON array con los nombres exactos tal como aparecen en mi lista. Ejemplo: ["Leche","Pan"]. Si no hay ninguno, respondé [].`
      );
      const clean = resp.replace(/```json|```/g, "").trim();
      const arr = JSON.parse(clean);
      setDetectados(arr);
      arr.forEach(nombre => {
        const item = pendientes.find(i => i.nombre.toLowerCase() === nombre.toLowerCase());
        if (item) onToggle(item.id);
      });
    } catch {
      setDetectados(["error"]);
    }
    setLoading(false);
    e.target.value = "";
  };

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#43e97b22,#38f9d722)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#065f46", marginBottom: 10 }}>🛒 Foto del chango</div>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>Sacá una foto del carrito para descontar automáticamente lo que ya tenés.</p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFotoChango} />
        <button onClick={() => fileRef.current.click()} disabled={loading || pendientes.length === 0} style={{ background: "linear-gradient(135deg,#43e97b,#38f9d7)", color: "#065f46", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 15, width: "100%" }}>
          {loading ? "⏳ Analizando chango..." : "📷 Foto del chango"}
        </button>
        {detectados.length > 0 && detectados[0] !== "error" && (
          <div style={{ marginTop: 10, background: "#d1fae5", borderRadius: 10, padding: 10 }}>
            <strong>✅ Detectados en el chango:</strong> {detectados.join(", ")}
          </div>
        )}
        {detectados[0] === "error" && <div style={{ color: "#dc2626", marginTop: 8 }}>No pude analizar la foto.</div>}
      </div>
      <div style={{ marginBottom: 8, fontWeight: 700, color: "#1f2937" }}>📋 Pendientes ({pendientes.length})</div>
      {pendientes.length === 0 && <div style={{ color: "#9ca3af", textAlign: "center", padding: 20 }}>¡Lista completa! 🎉</div>}
      {pendientes.map(i => <ItemCard key={i.id} item={i} familiares={familiares} onToggle={onToggle} onDelete={() => {}} />)}
      {comprados.length > 0 && (
        <>
          <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 700, color: "#059669" }}>✅ Ya en el chango ({comprados.length})</div>
          {comprados.map(i => <ItemCard key={i.id} item={i} familiares={familiares} onToggle={onToggle} onDelete={() => {}} />)}
        </>
      )}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [tab, setTab] = useState("hogar");
  const [listaEspecialActiva, setListaEspecialActiva] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [nuevoFamiliar, setNuevoFamiliar] = useState("");
  const [nuevaListaNombre, setNuevaListaNombre] = useState("");
  const [addingLoading] = useState(false);
  const [subTab, setSubTab] = useState("lista");

  useEffect(() => saveState(state), [state]);

  const setFamiliarActivo = (f) => setState(s => ({ ...s, familiarActivo: f }));

  const addItem = (lista, item) => {
    if (lista === "hogar") setState(s => ({ ...s, listaHogar: [item, ...s.listaHogar] }));
    else setState(s => ({ ...s, listasEspeciales: s.listasEspeciales.map(l => l.id === lista ? { ...l, items: [item, ...l.items] } : l) }));
  };

  const addItems = (lista, nombres) => {
    const nuevos = nombres.map(n => ({ nombre: n, cantidad: 1, quien: state.familiarActivo, categoria: "", id: Date.now() + Math.random(), comprado: false, fecha: new Date().toLocaleDateString("es-AR") }));
    if (lista === "hogar") setState(s => ({ ...s, listaHogar: [...nuevos, ...s.listaHogar] }));
    else setState(s => ({ ...s, listasEspeciales: s.listasEspeciales.map(l => l.id === lista ? { ...l, items: [...nuevos, ...l.items] } : l) }));
  };

  const toggleItem = (lista, id) => {
    if (lista === "hogar") setState(s => ({ ...s, listaHogar: s.listaHogar.map(i => i.id === id ? { ...i, comprado: !i.comprado } : i) }));
    else setState(s => ({ ...s, listasEspeciales: s.listasEspeciales.map(l => l.id === lista ? { ...l, items: l.items.map(i => i.id === id ? { ...i, comprado: !i.comprado } : i) } : l) }));
  };

  const deleteItem = (lista, id) => {
    if (lista === "hogar") setState(s => ({ ...s, listaHogar: s.listaHogar.filter(i => i.id !== id) }));
    else setState(s => ({ ...s, listasEspeciales: s.listasEspeciales.map(l => l.id === lista ? { ...l, items: l.items.filter(i => i.id !== id) } : l) }));
  };

  const addFamiliar = () => {
    if (!nuevoFamiliar.trim() || state.familiares.includes(nuevoFamiliar.trim())) return;
    setState(s => ({ ...s, familiares: [...s.familiares, nuevoFamiliar.trim()] }));
    setNuevoFamiliar("");
  };

  const crearListaEspecial = () => {
    if (!nuevaListaNombre.trim()) return;
    const nueva = { id: Date.now(), nombre: nuevaListaNombre.trim(), emoji: "🎉", items: [], fecha: new Date().toLocaleDateString("es-AR") };
    setState(s => ({ ...s, listasEspeciales: [...s.listasEspeciales, nueva] }));
    setNuevaListaNombre("");
    setListaEspecialActiva(nueva.id);
    setTab("especial");
  };

  const listaActiva = tab === "hogar" ? state.listaHogar : (state.listasEspeciales.find(l => l.id === listaEspecialActiva)?.items || []);
  const listaId = tab === "hogar" ? "hogar" : listaEspecialActiva;
  const listaNombre = tab === "hogar" ? "Lista del Hogar" : (state.listasEspeciales.find(l => l.id === listaEspecialActiva)?.nombre || "");

  const TABS = [
    { id: "hogar", label: "🏠 Hogar", color: "#667eea" },
    { id: "especial", label: "🎉 Especiales", color: "#f093fb" },
    { id: "config", label: "⚙️", color: "#9ca3af" },
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI',sans-serif", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", padding: "20px 16px 0", color: "#fff" }}>
        <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 4 }}>🛒 Lista Familiar</div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 4 }}>
          {state.familiares.map(f => (
            <button key={f} onClick={() => setFamiliarActivo(f)} style={{ flexShrink: 0, background: state.familiarActivo === f ? "#fff" : "rgba(255,255,255,0.2)", color: state.familiarActivo === f ? "#764ba2" : "#fff", border: "none", borderRadius: 20, padding: "5px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{f}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== "config") setShowConfig(false); else setShowConfig(true); }} style={{ flex: t.id === "config" ? 0 : 1, padding: "8px 10px", background: tab === t.id ? "#fff" : "transparent", color: tab === t.id ? t.color : "#fff", border: "none", borderRadius: "10px 10px 0 0", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {tab === "config" && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16, color: "#4c1d95" }}>⚙️ Configuración</div>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px #0001" }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>👨‍👩‍👧 Familiares</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {state.familiares.map(f => (
                  <span key={f} style={{ background: familiarColor(state.familiares, f), color: "#fff", borderRadius: 20, padding: "4px 14px", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    {f}
                    <button onClick={() => setState(s => ({ ...s, familiares: s.familiares.filter(x => x !== f) }))} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={nuevoFamiliar} onChange={e => setNuevoFamiliar(e.target.value)} onKeyDown={e => e.key === "Enter" && addFamiliar()} placeholder="Nuevo familiar..." style={{ flex: 1, borderRadius: 10, border: "2px solid #e5e7eb", padding: "8px 12px" }} />
                <button onClick={addFamiliar} style={{ background: "#764ba2", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>+ Agregar</button>
              </div>
            </div>
          </div>
        )}

        {tab === "especial" && !listaEspecialActiva && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16, color: "#7c3aed" }}>🎉 Listas Especiales</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input value={nuevaListaNombre} onChange={e => setNuevaListaNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && crearListaEspecial()} placeholder="Nombre del evento (ej: Cumpleaños)" style={{ flex: 1, borderRadius: 10, border: "2px solid #e5e7eb", padding: "8px 12px", fontSize: 15 }} />
              <button onClick={crearListaEspecial} style={{ background: "linear-gradient(135deg,#f093fb,#f5576c)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>+ Crear</button>
            </div>
            {state.listasEspeciales.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>No hay listas especiales aún.<br/>Creá una para un evento 🎉</div>}
            {state.listasEspeciales.map(l => (
              <div key={l.id} onClick={() => setListaEspecialActiva(l.id)} style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 10, boxShadow: "0 2px 8px #0001", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>🎉 {l.nombre}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{l.items.length} ítems · {l.fecha}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ background: "#f3f4f6", borderRadius: 10, padding: "4px 10px", fontSize: 13, color: "#374151" }}>{l.items.filter(i => !i.comprado).length} pendientes</span>
                  <button onClick={e => { e.stopPropagation(); setState(s => ({ ...s, listasEspeciales: s.listasEspeciales.filter(x => x.id !== l.id) })); }} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>Borrar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {(tab === "hogar" || (tab === "especial" && listaEspecialActiva)) && (
          <div>
            {tab === "especial" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <button onClick={() => setListaEspecialActiva(null)} style={{ background: "#f3f4f6", border: "none", borderRadius: 10, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>← Volver</button>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#7c3aed" }}>🎉 {listaNombre}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {[{ id: "lista", label: "📋 Lista" }, { id: "ia", label: "🤖 IA" }, { id: "compras", label: "🛒 Compras" }].map(t => (
                <button key={t.id} onClick={() => setSubTab(t.id)} style={{ flex: 1, padding: "8px 4px", background: subTab === t.id ? "linear-gradient(135deg,#667eea,#764ba2)" : "#f3f4f6", color: subTab === t.id ? "#fff" : "#374151", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{t.label}</button>
              ))}
            </div>
            {subTab === "lista" && (
              <div>
                <AgregarItemForm familiares={state.familiares} familiarActivo={state.familiarActivo} onAdd={item => addItem(listaId, item)} loading={addingLoading} />
                {listaActiva.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>Lista vacía. ¡Agregá productos! 🛍️</div>}
                {listaActiva.filter(i => !i.comprado).map(i => <ItemCard key={i.id} item={i} familiares={state.familiares} onToggle={id => toggleItem(listaId, id)} onDelete={id => deleteItem(listaId, id)} />)}
                {listaActiva.filter(i => i.comprado).length > 0 && (
                  <>
                    <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 700, color: "#059669" }}>✅ Comprados</div>
                    {listaActiva.filter(i => i.comprado).map(i => <ItemCard key={i.id} item={i} familiares={state.familiares} onToggle={id => toggleItem(listaId, id)} onDelete={id => deleteItem(listaId, id)} />)}
                    <button onClick={() => {
                      if (listaId === "hogar") setState(s => ({ ...s, listaHogar: s.listaHogar.filter(i => !i.comprado) }));
                      else setState(s => ({ ...s, listasEspeciales: s.listasEspeciales.map(l => l.id === listaId ? { ...l, items: l.items.filter(i => !i.comprado) } : l) }));
                    }} style={{ marginTop: 8, background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer", width: "100%" }}>
                      🗑️ Limpiar comprados
                    </button>
                  </>
                )}
              </div>
            )}
            {subTab === "ia" && (
              <IASection onAddItems={nombres => addItems(listaId, nombres)} lista={listaActiva} />
            )}
            {subTab === "compras" && (
              <AsistenteCompras lista={listaActiva} familiares={state.familiares} onToggle={id => toggleItem(listaId, id)} listaNombre={listaNombre} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
