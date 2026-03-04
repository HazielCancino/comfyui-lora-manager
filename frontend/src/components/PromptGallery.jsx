import { useEffect, useState, useRef } from "react";

const API = "http://127.0.0.1:5000";

function PromptGallery() {
  const [prompts, setPrompts]           = useState([]);
  const [focused, setFocused]           = useState(null);
  const [search, setSearch]             = useState("");
  const [isDragging, setIsDragging]     = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [editingNotes, setEditingNotes] = useState(null);
  const [notesDraft, setNotesDraft]     = useState("");
  const [pendingMeta, setPendingMeta]   = useState(null); // extracted metadata waiting for confirm
  const [filterBase, setFilterBase]     = useState(null);
  const dropZoneRef = useRef(null);

  useEffect(() => {
    loadPrompts();
  }, []);

  async function loadPrompts() {
    const data = await (await fetch(`${API}/prompts`)).json();
    setPrompts(data);
  }

  // =========================
  // DRAG & DROP — extract metadata
  // =========================
  function onDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(e) {
    if (!dropZoneRef.current?.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  }

    async function onDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
        /\.(png|jpg|jpeg)$/i.test(f.name)
    );
    if (files.length === 0) return;
    setIsLoading(true);
    for (const file of files) {
        await extractAndPreview(file);
    }
    setIsLoading(false);
    }

    async function extractAndPreview(fileOrPath) {
    let res;
    if (typeof fileOrPath === "string") {
        // called from manual path input
        res = await fetch(`${API}/prompts/extract`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_path: fileOrPath })
        });
    } else {
        // called from drag & drop — send as FormData
        const form = new FormData();
        form.append("file", fileOrPath);
        res = await fetch(`${API}/prompts/extract`, {
        method: "POST",
        body: form   // no Content-Type header — browser sets it with boundary
        });
    }
    const meta = await res.json();
    if (meta.error) { alert("Could not read: " + (fileOrPath.name || fileOrPath)); return; }
    setPendingMeta(meta);
    }

  async function confirmSave(meta) {
    await fetch(`${API}/prompts/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta)
    });
    setPendingMeta(null);
    await loadPrompts();
  }

  async function deletePrompt(id) {
    if (!window.confirm("Delete this prompt entry?")) return;
    await fetch(`${API}/prompts/delete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (focused?.id === id) setFocused(null);
    await loadPrompts();
  }

  async function saveNotes(id) {
    await fetch(`${API}/prompts/update_notes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, notes: notesDraft })
    });
    setPrompts(p => p.map(x => x.id === id ? { ...x, notes: notesDraft } : x));
    if (focused?.id === id) setFocused(p => ({ ...p, notes: notesDraft }));
    setEditingNotes(null);
  }

  // Manual add — open path prompt
  async function handleManualAdd() {
    const path = window.prompt("Paste full path to a PNG image:");
    if (!path) return;
    setIsLoading(true);
    await extractAndPreview(path.trim());
    setIsLoading(false);
  }

  function previewUrl(path) {
    return `${API}/preview?path=` + encodeURIComponent(path);
  }

  function parseLoras(lorasJson) {
    try { return JSON.parse(lorasJson || "[]"); }
    catch { return []; }
  }

  function formatDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // unique base models for filter
  const baseModels = [...new Set(prompts.map(p => p.base_model).filter(Boolean))].sort();

  const visible = prompts
    .filter(p => !filterBase || p.base_model === filterBase)
    .filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (p.positive || "").toLowerCase().includes(q) ||
        (p.base_model || "").toLowerCase().includes(q) ||
        (p.notes || "").toLowerCase().includes(q) ||
        (p.loras_used || "").toLowerCase().includes(q)
      );
    });

  const labelStyle = { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 };

  // =========================
  // CONFIRM MODAL
  // =========================
  function ConfirmModal({ meta, onConfirm, onCancel }) {
    const [editMeta, setEditMeta] = useState({ ...meta });
    const loras = parseLoras(editMeta.loras_used);

    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
      }}>
        <div style={{
          background: "#0f1117", border: "1px solid #333", borderRadius: 16,
          padding: 24, width: 640, maxHeight: "85vh", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 14
        }}>
          <div style={{ fontWeight: "bold", fontSize: 16, color: "#4da3ff" }}>
            📋 Save Prompt Entry
          </div>

          {/* IMAGE PREVIEW */}
          {editMeta.image_path && (
            <div style={{ borderRadius: 10, overflow: "hidden", maxHeight: 220, background: "#111" }}>
              <img src={previewUrl(editMeta.image_path)} alt=""
                style={{ width: "100%", maxHeight: 220, objectFit: "contain", display: "block" }} />
            </div>
          )}

          {/* METADATA SUMMARY */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={labelStyle}>Base Model</div>
              <input value={editMeta.base_model || ""}
                onChange={e => setEditMeta(p => ({ ...p, base_model: e.target.value }))}
                style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Seed</div>
              <input value={editMeta.seed || ""} readOnly style={{ ...inputStyle, color: "#888" }} />
            </div>
            <div>
              <div style={labelStyle}>Sampler</div>
              <input value={editMeta.sampler || ""} readOnly style={{ ...inputStyle, color: "#888" }} />
            </div>
            <div>
              <div style={labelStyle}>Steps / CFG</div>
              <input value={`${editMeta.steps ?? "?"} steps · CFG ${editMeta.cfg ?? "?"}`} readOnly style={{ ...inputStyle, color: "#888" }} />
            </div>
          </div>

          {/* LORAS */}
          {loras.length > 0 && (
            <div>
              <div style={labelStyle}>LoRAs Detected</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {loras.map((l, i) => (
                  <div key={i} style={{ background: "#4da3ff22", border: "1px solid #4da3ff55", color: "#4da3ff", fontSize: 11, padding: "3px 10px", borderRadius: 10 }}>
                    {l.name} <span style={{ opacity: 0.6 }}>×{l.strength}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* POSITIVE PROMPT */}
          <div>
            <div style={labelStyle}>Positive Prompt</div>
            <textarea value={editMeta.positive || ""}
              onChange={e => setEditMeta(p => ({ ...p, positive: e.target.value }))}
              rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6 }} />
          </div>

          {/* NEGATIVE PROMPT */}
          {editMeta.negative && (
            <div>
              <div style={labelStyle}>Negative Prompt</div>
              <textarea value={editMeta.negative || ""}
                onChange={e => setEditMeta(p => ({ ...p, negative: e.target.value }))}
                rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: "#f87171" }} />
            </div>
          )}

          {/* NOTES */}
          <div>
            <div style={labelStyle}>Personal Notes</div>
            <textarea value={editMeta.notes || ""}
              onChange={e => setEditMeta(p => ({ ...p, notes: e.target.value }))}
              placeholder="What worked well? What would you change?"
              rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          {!meta.raw_found && (
            <div style={{ fontSize: 11, color: "#f59e0b", background: "#f59e0b11", padding: "8px 12px", borderRadius: 8 }}>
              ⚠️ No ComfyUI metadata found in this image. Fields were left blank — fill them manually.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onCancel}
              style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#888", cursor: "pointer", fontSize: 13 }}>
              Cancel
            </button>
            <button onClick={() => onConfirm(editMeta)}
              style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#4da3ff", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Save to Gallery
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inputStyle = {
    width: "100%", background: "#111", border: "1px solid #2a2d36",
    color: "white", borderRadius: 8, fontSize: 12, padding: "8px 10px",
    boxSizing: "border-box", lineHeight: 1.5
  };

  // =========================
  // DETAIL PANEL
  // =========================
  function DetailPanel({ prompt }) {
    const loras = parseLoras(prompt.loras_used);

    return (
      <div style={{
        flex: 1, minWidth: 0, background: "#0f1117", border: "1px solid #222",
        borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column",
        position: "sticky", top: 20, alignSelf: "flex-start",
        maxHeight: "calc(100vh - 40px)"
      }}>
        {/* IMAGE */}
        {prompt.image_path && (
          <div style={{ flex: "0 0 auto", background: "#0a0c12", maxHeight: 300, overflow: "hidden" }}>
            <img src={previewUrl(prompt.image_path)} alt=""
              style={{ width: "100%", maxHeight: 300, objectFit: "contain", display: "block" }} />
          </div>
        )}

        <div style={{ flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* HEADER */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, color: "#555" }}>{formatDate(prompt.created_at)}</div>
              {prompt.base_model && (
                <div style={{ marginTop: 4, background: "#f59e0b22", color: "#f59e0b", fontSize: 11, padding: "2px 10px", borderRadius: 10, display: "inline-block", fontWeight: 600 }}>
                  {prompt.base_model}
                </div>
              )}
            </div>
            <div onClick={() => setFocused(null)} style={{ cursor: "pointer", color: "#555", fontSize: 20 }}
              onMouseEnter={e => e.target.style.color = "white"}
              onMouseLeave={e => e.target.style.color = "#555"}>✕</div>
          </div>

          {/* STATS ROW */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              prompt.sampler && `🎲 ${prompt.sampler}`,
              prompt.scheduler && `📐 ${prompt.scheduler}`,
              prompt.steps && `⚡ ${prompt.steps} steps`,
              prompt.cfg && `🎛 CFG ${prompt.cfg}`,
              prompt.seed && `🌱 ${prompt.seed}`,
              prompt.width && `📏 ${prompt.width}×${prompt.height}`,
            ].filter(Boolean).map((item, i) => (
              <div key={i} style={{ background: "#1a1d26", border: "1px solid #2a2d36", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#888" }}>
                {item}
              </div>
            ))}
          </div>

          {/* LORAS */}
          {loras.length > 0 && (
            <div>
              <div style={labelStyle}>LoRAs Used</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {loras.map((l, i) => (
                  <div key={i} style={{ background: "#4da3ff22", border: "1px solid #4da3ff55", color: "#4da3ff", fontSize: 11, padding: "3px 10px", borderRadius: 10 }}>
                    {l.name} <span style={{ opacity: 0.6 }}>×{l.strength}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* POSITIVE */}
          <div>
            <div style={labelStyle}>Positive Prompt</div>
            <div style={{ background: "#1a1d26", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#ccc", fontFamily: "monospace", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", border: "1px solid #2a2d36" }}>
              {prompt.positive || <span style={{ color: "#444" }}>—</span>}
            </div>
            {prompt.positive && (
              <button onClick={() => navigator.clipboard.writeText(prompt.positive)}
                style={{ marginTop: 6, padding: "4px 12px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#4da3ff", cursor: "pointer", fontSize: 11 }}>
                Copy prompt
              </button>
            )}
          </div>

          {/* NEGATIVE */}
          {prompt.negative && (
            <div>
              <div style={labelStyle}>Negative Prompt</div>
              <div style={{ background: "#1a1d26", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#f87171", fontFamily: "monospace", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", border: "1px solid #2a2d36" }}>
                {prompt.negative}
              </div>
            </div>
          )}

          {/* NOTES */}
          <div>
            <div style={labelStyle}>Notes</div>
            {editingNotes === prompt.id ? (
              <textarea autoFocus value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                onBlur={() => saveNotes(prompt.id)}
                onKeyDown={e => { if (e.key === "Escape") setEditingNotes(null); }}
                placeholder="Your thoughts on this prompt..."
                rows={3} style={{ ...inputStyle, resize: "vertical", border: "1px solid #4da3ff" }}
              />
            ) : prompt.notes ? (
              <div onClick={() => { setEditingNotes(prompt.id); setNotesDraft(prompt.notes); }}
                style={{ background: "#1a1d26", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#ccc", cursor: "pointer", lineHeight: 1.6, whiteSpace: "pre-wrap", border: "1px solid #2a2d36" }}>
                {prompt.notes}
              </div>
            ) : (
              <div onClick={() => { setEditingNotes(prompt.id); setNotesDraft(""); }}
                style={{ border: "1px dashed #333", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#444", cursor: "pointer", fontStyle: "italic" }}>
                + Add notes
              </div>
            )}
          </div>

          {/* DELETE */}
          <button onClick={() => deletePrompt(prompt.id)}
            style={{ marginTop: "auto", padding: "8px 0", borderRadius: 8, border: "1px solid #ef444455", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>
            Delete entry
          </button>
        </div>
      </div>
    );
  }

  // =========================
  // RENDER
  // =========================
  return (
    <div style={{ display: "flex", gap: 16 }}>

      {/* CONFIRM MODAL */}
      {pendingMeta && (
        <ConfirmModal
          meta={pendingMeta}
          onConfirm={confirmSave}
          onCancel={() => setPendingMeta(null)}
        />
      )}

      {/* SIDEBAR */}
      <div style={{ width: 195, flexShrink: 0, background: "#0f1117", border: "1px solid #222", borderRadius: 12, padding: 10, position: "sticky", top: 20, alignSelf: "flex-start", maxHeight: "calc(100vh - 40px)", overflowY: "auto" }}>

        <button onClick={handleManualAdd}
          style={{ width: "100%", padding: "8px 0", marginBottom: 10, background: "#2563eb", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
          + Add from path
        </button>

        <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, marginTop: 4 }}>Base Model</div>
        <div onClick={() => setFilterBase(null)}
          style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between", background: filterBase === null ? "#4da3ff" : "transparent" }}>
          <span>All</span>
          <span style={{ opacity: 0.45, fontSize: 11 }}>{prompts.length}</span>
        </div>
        {baseModels.map(bm => (
          <div key={bm} onClick={() => setFilterBase(filterBase === bm ? null : bm)}
            style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between", background: filterBase === bm ? "#f59e0b33" : "transparent", color: filterBase === bm ? "#f59e0b" : "white" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bm}</span>
            <span style={{ opacity: 0.45, fontSize: 11 }}>{prompts.filter(p => p.base_model === bm).length}</span>
          </div>
        ))}
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", gap: 16, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* SEARCH */}
          <input placeholder="Search prompts, models, LoRAs..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: "10px 14px", width: "100%", marginBottom: 16, background: "#1a1d26", color: "white", border: "1px solid #333", borderRadius: 8, boxSizing: "border-box", fontSize: 13 }}
          />

          {/* DROP ZONE */}
          <div ref={dropZoneRef}
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            style={{
              border: isDragging ? "2px dashed #4da3ff" : "2px dashed #2a2d36",
              borderRadius: 12, padding: "20px 16px", marginBottom: 20,
              textAlign: "center", background: isDragging ? "#4da3ff11" : "transparent",
              transition: "all 0.15s", cursor: "default"
            }}>
            {isLoading ? (
              <div style={{ color: "#4da3ff", fontSize: 13 }}>Reading metadata...</div>
            ) : (
              <div style={{ color: isDragging ? "#4da3ff" : "#444", fontSize: 13 }}>
                {isDragging ? "Drop to extract metadata" : "🖼 Drop ComfyUI images here to extract prompts"}
              </div>
            )}
          </div>

          {/* GRID */}
          {visible.length === 0 ? (
            <div style={{ color: "#333", textAlign: "center", marginTop: 40, fontSize: 14 }}>
              No prompts saved yet. Drop images above to get started.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {visible.map(p => {
                const loras   = parseLoras(p.loras_used);
                const isFocus = focused?.id === p.id;
                return (
                  <div key={p.id}
                    onClick={() => setFocused(isFocus ? null : p)}
                    style={{
                      background: "#1a1d26", borderRadius: 10, overflow: "hidden",
                      cursor: "pointer", border: isFocus ? "2px solid #4da3ff" : "2px solid transparent",
                      transform: isFocus ? "scale(1.02)" : "scale(1)", transition: "border 0.15s, transform 0.15s"
                    }}>

                    {/* THUMBNAIL */}
                    <div style={{ width: "100%", aspectRatio: "1 / 1", overflow: "hidden", background: "#111", position: "relative" }}>
                      {p.image_path ? (
                        <img src={previewUrl(p.image_path)} alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 24 }}>📋</div>
                      )}
                      {p.base_model && (
                        <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", padding: "2px 7px", borderRadius: 5, fontSize: 9, color: "#f59e0b", fontWeight: 600 }}>
                          {p.base_model}
                        </div>
                      )}
                      {loras.length > 0 && (
                        <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.65)", color: "#4da3ff", fontSize: 9, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>
                          {loras.length} LoRA{loras.length > 1 ? "s" : ""}
                        </div>
                      )}
                    </div>

                    {/* INFO */}
                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>{formatDate(p.created_at)}</div>
                      <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", fontFamily: "monospace" }}>
                        {p.positive || <span style={{ color: "#444", fontStyle: "italic" }}>No prompt</span>}
                      </div>
                      {p.notes && (
                        <div style={{ marginTop: 5, fontSize: 10, color: "#4da3ff", fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          📝 {p.notes}
                        </div>
                      )}
                      {/* sampler / seed mini row */}
                      <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {p.sampler && (
                          <span style={{ fontSize: 9, color: "#555", background: "#111", padding: "1px 5px", borderRadius: 4 }}>{p.sampler}</span>
                        )}
                        {p.steps && (
                          <span style={{ fontSize: 9, color: "#555", background: "#111", padding: "1px 5px", borderRadius: 4 }}>{p.steps}s</span>
                        )}
                        {p.cfg && (
                          <span style={{ fontSize: 9, color: "#555", background: "#111", padding: "1px 5px", borderRadius: 4 }}>CFG {p.cfg}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {focused && <DetailPanel prompt={focused} />}
      </div>
    </div>
  );
}

export default PromptGallery;