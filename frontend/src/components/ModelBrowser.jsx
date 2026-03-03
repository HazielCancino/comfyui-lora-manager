import { useEffect, useState } from "react";

const DEFAULT_BASE_MODELS = ["FLUX", "SDXL", "Pony", "Illustrious", "SD1.5", "SD3", "Qwen", "Wan"];

const TYPE_LABELS = {
  checkpoint: "Checkpoints",
  vae:        "VAEs",
  upscaler:   "Upscalers",
  diffusion:  "Diffusion",
};

const TYPE_COLORS = {
  checkpoint: "#f59e0b",
  vae:        "#34d399",
  upscaler:   "#f472b6",
  diffusion:  "#818cf8",
};

function ModelBrowser({ initialTypeFilter = null }) {
  const [models, setModels]         = useState([]);
  const [tagsMap, setTagsMap]       = useState({});
  const [imagesMap, setImagesMap]   = useState({});
  const [allTags, setAllTags]       = useState([]);
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState(initialTypeFilter);      // checkpoint | vae | upscaler | diffusion
  const [folderFilter, setFolderFilter] = useState(null);
  const [tagFilter, setTagFilter]   = useState(null);
  const [focusedModel, setFocusedModel] = useState(null);
  const [carouselIndex, setCarouselIndex] = useState({});
  const [isRescanning, setIsRescanning]   = useState(false);
  const [hoveredTag, setHoveredTag]       = useState(null);

  // editing states
  const [editingField, setEditingField] = useState(null); // { modelId, field }
  const [fieldDraft, setFieldDraft]     = useState("");
  const [editingTagFor, setEditingTagFor] = useState(null);
  const [newTagName, setNewTagName]       = useState("");

  // =========================
  // LOAD
  // =========================
  useEffect(() => {
    fetch("http://127.0.0.1:5000/tags").then(r => r.json()).then(setAllTags);
  }, []);

  useEffect(() => {
    fetch("http://127.0.0.1:5000/models")
      .then(r => r.json())
      .then(data => {
        setModels(data);
        if (data.length > 0) setFocusedModel(data[0]);
        data.forEach(m => {
          fetch(`http://127.0.0.1:5000/model_tags/${m.id}`)
            .then(r => r.json())
            .then(tags => setTagsMap(p => ({ ...p, [m.id]: tags })));
          fetch(`http://127.0.0.1:5000/model_images/${m.id}`)
            .then(r => r.json())
            .then(imgs => setImagesMap(p => ({ ...p, [m.id]: imgs })));
        });
      });
  }, []);

  // =========================
  // RESCAN
  // =========================
  async function handleRescan() {
    setIsRescanning(true);
    try {
      const data = await (await fetch("http://127.0.0.1:5000/resync_models", { method: "POST" })).json();
      setModels(data);
      data.forEach(m => {
        fetch(`http://127.0.0.1:5000/model_tags/${m.id}`).then(r => r.json())
          .then(tags => setTagsMap(p => ({ ...p, [m.id]: tags })));
        fetch(`http://127.0.0.1:5000/model_images/${m.id}`).then(r => r.json())
          .then(imgs => setImagesMap(p => ({ ...p, [m.id]: imgs })));
      });
      setAllTags(await (await fetch("http://127.0.0.1:5000/tags")).json());
      if (focusedModel) {
        const still = data.find(m => m.id === focusedModel.id);
        setFocusedModel(still || data[0] || null);
      } else setFocusedModel(data[0] || null);
    } catch (err) { console.error(err); }
    setIsRescanning(false);
  }

  // =========================
  // SAVE FIELD (generic)
  // =========================
  async function saveField(modelId, field, value) {
    setEditingField(null); setFieldDraft("");
    await fetch("http://127.0.0.1:5000/update_model", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: modelId, field, value: value.trim() })
    });
    setModels(p => p.map(m => m.id === modelId ? { ...m, [field]: value.trim() } : m));
    if (focusedModel?.id === modelId) setFocusedModel(p => ({ ...p, [field]: value.trim() }));
  }

  // =========================
  // TAG FUNCTIONS
  // =========================
  async function createAndAssignTag(modelId) {
    if (!newTagName.trim()) return;
    const tagName = newTagName.trim();
    setNewTagName(""); setEditingTagFor(null);
    try {
      await fetch("http://127.0.0.1:5000/add_tag", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tagName })
      });
      const tags = await (await fetch("http://127.0.0.1:5000/tags")).json();
      setAllTags(tags);
      const tag = tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
      if (!tag) return;
      await fetch("http://127.0.0.1:5000/model_assign_tag", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, tag_id: tag.id })
      });
      const updated = await (await fetch(`http://127.0.0.1:5000/model_tags/${modelId}`)).json();
      setTagsMap(p => ({ ...p, [modelId]: updated }));
    } catch (err) { console.error(err); }
  }

  async function removeTag(modelId, tagId) {
    await fetch("http://127.0.0.1:5000/model_remove_tag", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId, tag_id: tagId })
    });
    const updated = await (await fetch(`http://127.0.0.1:5000/model_tags/${modelId}`)).json();
    setTagsMap(p => ({ ...p, [modelId]: updated }));
  }

  async function deleteTagGlobally(tag) {
    if (!window.confirm(`Delete tag "${tag.name}" globally?\nThis cannot be undone.`)) return;
    await fetch("http://127.0.0.1:5000/delete_tag", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tag.id })
    });
    setAllTags(p => p.filter(t => t.id !== tag.id));
    setTagsMap(p => {
      const u = { ...p };
      for (const k in u) u[k] = u[k].filter(t => t.id !== tag.id);
      return u;
    });
    if (tagFilter === tag.name) setTagFilter(null);
  }

  // =========================
  // HELPERS
  // =========================
  function getFolderName(model) {
    if (!model.local_path) return "";
    const parts = model.local_path.replace(/\\/g, "/").split("/");
    return parts.length >= 2 ? parts[parts.length - 2] : "";
  }

  function getAllImages(model) {
    const extra = imagesMap[model.id] || [];
    const main  = model.preview_image ? [{ id: "main", image_path: model.preview_image }] : [];
    return [...main, ...extra];
  }

  function previewUrl(path) {
    return "http://127.0.0.1:5000/preview?path=" + encodeURIComponent(path);
  }

  function carouselGo(modelId, dir, total) {
    setCarouselIndex(p => {
      const next = ((p[modelId] || 0) + dir + total) % total;
      return { ...p, [modelId]: next };
    });
  }

  // filtered models
  const visibleModels = models
    .filter(m => !typeFilter   || m.model_type === typeFilter)
    .filter(m => !tagFilter    || (tagsMap[m.id] || []).some(t => t.name === tagFilter))
    .filter(m => !folderFilter || getFolderName(m) === folderFilter)
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

  // unique folders for current type filter
  const folderNames = [...new Set(
    models
      .filter(m => !typeFilter || m.model_type === typeFilter)
      .map(getFolderName).filter(Boolean)
  )].sort();

  // type counts
  const typeCounts = models.reduce((acc, m) => {
    acc[m.model_type] = (acc[m.model_type] || 0) + 1;
    return acc;
  }, {});

  // shared styles
  const labelStyle = { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 };
  const addFieldStyle = { border: "1px dashed #333", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#444", cursor: "pointer", fontStyle: "italic" };

  // =========================
  // EDITABLE FIELD COMPONENT
  // =========================
  function EditableField({ model, field, color = "white", placeholder, multiline = false }) {
    const isEditing = editingField?.modelId === model.id && editingField?.field === field;
    const value = model[field];

    if (isEditing) {
      const sharedStyle = {
        width: "100%", background: "#111", color: "white", borderRadius: 8,
        fontSize: 12, padding: "8px 10px", boxSizing: "border-box",
        border: `1px solid ${color}`, lineHeight: 1.6
      };
      if (multiline) return (
        <textarea autoFocus value={fieldDraft}
          onChange={e => setFieldDraft(e.target.value)}
          onBlur={() => saveField(model.id, field, fieldDraft)}
          onKeyDown={e => { if (e.key === "Escape") { setEditingField(null); setFieldDraft(""); } }}
          style={{ ...sharedStyle, resize: "vertical", minHeight: 70 }}
          rows={3}
        />
      );
      return (
        <input autoFocus value={fieldDraft}
          onChange={e => setFieldDraft(e.target.value)}
          onBlur={() => saveField(model.id, field, fieldDraft)}
          onKeyDown={e => {
            if (e.key === "Enter") saveField(model.id, field, fieldDraft);
            if (e.key === "Escape") { setEditingField(null); setFieldDraft(""); }
          }}
          placeholder={placeholder}
          style={sharedStyle}
        />
      );
    }

    if (value) return (
      <div onClick={() => { setEditingField({ modelId: model.id, field }); setFieldDraft(value); }}
        title="Click to edit"
        style={{
          background: "#1a1d26", borderRadius: 8, padding: "8px 10px",
          fontSize: 12, color, lineHeight: 1.6, cursor: "pointer",
          border: "1px solid #2a2d36", wordBreak: "break-word",
          whiteSpace: field === "description" ? "pre-wrap" : "normal",
          fontFamily: field === "trigger_words" ? "monospace" : "inherit"
        }}>
        {field === "source_url"
          ? <a href={value} target="_blank" rel="noreferrer" style={{ color, textDecoration: "none" }}>🔗 {value}</a>
          : value
        }
        {field === "source_url" && (
          <span style={{ marginLeft: 6, color: "#555" }}>✎</span>
        )}
      </div>
    );

    return <div onClick={() => { setEditingField({ modelId: model.id, field }); setFieldDraft(""); }} style={addFieldStyle}>{placeholder}</div>;
  }

  // =========================
  // BASE MODEL SELECTOR
  // =========================
  function BaseModelField({ model }) {
    const [open, setOpen]           = useState(false);
    const [customInput, setCustomInput] = useState("");
    const color = TYPE_COLORS[model.model_type] || "#aaa";

    async function setBase(value) {
      setOpen(false); setCustomInput("");
      await saveField(model.id, "base_model", value);
    }

    return (
      <div style={{ position: "relative" }}>
        {model.base_model ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div onClick={() => setOpen(o => !o)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: color + "22", border: `1px solid ${color}55`, borderRadius: 20, padding: "4px 12px", cursor: "pointer", fontSize: 12, color, fontWeight: 600 }}>
              🧠 {model.base_model} ▾
            </div>
            <span onClick={() => saveField(model.id, "base_model", "")} title="Clear"
              style={{ color: "#444", cursor: "pointer", fontSize: 16 }}
              onMouseEnter={e => e.target.style.color = "#ef4444"}
              onMouseLeave={e => e.target.style.color = "#444"}>×</span>
          </div>
        ) : (
          <div onClick={() => setOpen(o => !o)} style={addFieldStyle}>+ Set base model</div>
        )}

        {open && (
          <div style={{ position: "absolute", top: "110%", left: 0, zIndex: 100, background: "#1a1d26", border: "1px solid #333", borderRadius: 10, overflow: "hidden", minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #2a2d36" }}>
              <input autoFocus value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && customInput.trim()) setBase(customInput.trim());
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Type custom model..."
                style={{ width: "100%", background: "#111", border: `1px solid ${color}`, color: "white", borderRadius: 6, fontSize: 12, padding: "5px 8px", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {allBaseModels
                .filter(opt => !customInput || opt.toLowerCase().includes(customInput.toLowerCase()))
                .map(opt => (
                  <div key={opt} onClick={() => setBase(opt)}
                    style={{ padding: "7px 12px", cursor: "pointer", fontSize: 12, color: model.base_model === opt ? color : "#ccc", background: model.base_model === opt ? color + "22" : "transparent", display: "flex", justifyContent: "space-between" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#2a2d36"}
                    onMouseLeave={e => e.currentTarget.style.background = model.base_model === opt ? color + "22" : "transparent"}>
                    <span>{opt}</span>
                    {model.base_model === opt && <span style={{ fontSize: 10 }}>✓</span>}
                  </div>
                ))
              }
              {customInput.trim() && !allBaseModels.some(o => o.toLowerCase() === customInput.toLowerCase()) && (
                <div onClick={() => setBase(customInput.trim())}
                  style={{ padding: "7px 12px", cursor: "pointer", fontSize: 12, color, borderTop: "1px solid #2a2d36" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#2a2d36"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  + Add "{customInput.trim()}"
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================
  // DETAIL PANEL
  // =========================
  function DetailPanel({ model }) {
    const tags       = tagsMap[model.id] || [];
    const allImages  = getAllImages(model);
    const folderName = getFolderName(model);
    const typeColor  = TYPE_COLORS[model.model_type] || "#aaa";
    const safeIdx    = Math.min(carouselIndex[model.id] || 0, allImages.length - 1);
    const currentImg = allImages[safeIdx];
    const hasMulti   = allImages.length > 1;

    return (
      <div style={{
        flex: 1, minWidth: 0, background: "#0f1117", border: "1px solid #222",
        borderRadius: 16, overflow: "hidden", display: "flex",
        position: "sticky", top: 20, alignSelf: "flex-start",
        maxHeight: "calc(100vh - 40px)"
      }}>

        {/* LEFT — CAROUSEL */}
        <div style={{ flex: "0 0 50%", display: "flex", flexDirection: "column", background: "#0a0c12", overflow: "hidden" }}>
          <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
            {currentImg ? (
              <img key={currentImg.image_path} src={previewUrl(currentImg.image_path)} alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 13 }}>
                No preview
              </div>
            )}
            {hasMulti && (
              <>
                <button onClick={() => carouselGo(model.id, -1, allImages.length)} style={arrowBtn("left")}>‹</button>
                <button onClick={() => carouselGo(model.id,  1, allImages.length)} style={arrowBtn("right")}>›</button>
                <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#aaa", fontSize: 11, padding: "2px 8px", borderRadius: 10, pointerEvents: "none" }}>
                  {safeIdx + 1} / {allImages.length}
                </div>
              </>
            )}
          </div>

          {hasMulti && (
            <div style={{ display: "flex", gap: 4, padding: "6px 8px", overflowX: "auto", background: "#06080f", flexShrink: 0 }}>
              {allImages.map((img, i) => (
                <div key={img.id + "_" + i}
                  onClick={() => setCarouselIndex(p => ({ ...p, [model.id]: i }))}
                  style={{ width: 52, height: 70, flexShrink: 0, borderRadius: 6, overflow: "hidden", cursor: "pointer", border: i === safeIdx ? `2px solid ${typeColor}` : "2px solid transparent", opacity: i === safeIdx ? 1 : 0.5, transition: "opacity 0.15s, border 0.15s" }}>
                  <img src={previewUrl(img.image_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: "6px 10px", background: "#06080f", fontSize: 10, color: "#2a2d36", textAlign: "center", flexShrink: 0 }}>
            Extra images auto-detected · Run Rescan to refresh
          </div>
        </div>

        {/* RIGHT — INFO */}
        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>

          {/* CLOSE + NAME */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, paddingRight: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ background: typeColor + "22", color: typeColor, fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: "bold", textTransform: "uppercase" }}>
                  {model.model_type}
                </span>
              </div>
              <div style={{ fontWeight: "bold", fontSize: 16, wordBreak: "break-word", lineHeight: 1.3 }}>{model.name}</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>{model.file_size_mb} MB &nbsp;·&nbsp; {model.file_name}</div>
            </div>
            <div onClick={() => setFocusedModel(null)}
              onMouseEnter={e => e.target.style.color = "white"}
              onMouseLeave={e => e.target.style.color = "#555"}
              style={{ cursor: "pointer", color: "#555", fontSize: 20, lineHeight: 1, flexShrink: 0, padding: "2px 4px" }}>✕</div>
          </div>

          {/* BASE MODEL */}
          <div>
            <div style={labelStyle}>Base Model</div>
              <BaseModelField model={model} />
          </div>

          {/* FOLDER */}
          <div>
            <div style={labelStyle}>Folder</div>
            <div onClick={() => setFolderFilter(folderFilter === folderName ? null : folderName)}
              style={{ background: "#1a1d26", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5, color: folderFilter === folderName ? typeColor : "#888", border: folderFilter === folderName ? `1px solid ${typeColor}` : "1px solid #2a2d36", cursor: "pointer" }}>
              📁 {folderName || model.local_path}
            </div>
            <div style={{ fontSize: 10, color: "#2a3040", marginTop: 4, fontFamily: "monospace", wordBreak: "break-all" }}>{model.local_path}</div>
          </div>

          {/* SOURCE URL */}
          <div>
            <div style={labelStyle}>Source URL</div>
            <EditableField model={model} field="source_url" color="#a78bfa" placeholder="+ Add source URL" />
          </div>

          {/* DESCRIPTION */}
          <div>
            <div style={labelStyle}>Description</div>
            <EditableField model={model} field="description" color="#ccc" placeholder="+ Add description" multiline />
          </div>

          {/* TRIGGER WORDS */}
          <div>
            <div style={labelStyle}>Trigger Words</div>
            <EditableField model={model} field="trigger_words" color="#f5a623" placeholder="+ Add trigger words" multiline />
          </div>

          {/* TAGS */}
          <div>
            <div style={labelStyle}>Tags</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {tags.map(tag => (
                <div key={tag.id} onClick={() => removeTag(model.id, tag.id)} title="Click to remove"
                  style={{ background: typeColor, padding: "3px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", color: "#000" }}>
                  {tag.name} ×
                </div>
              ))}
              {editingTagFor === model.id ? (
                <input autoFocus value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  onBlur={() => setEditingTagFor(null)}
                  onKeyDown={e => { if (e.key === "Enter") createAndAssignTag(model.id); if (e.key === "Escape") setEditingTagFor(null); }}
                  placeholder="tag..."
                  style={{ background: "#111", border: `1px solid ${typeColor}`, color: "white", borderRadius: 6, fontSize: 12, padding: "3px 8px", width: 80 }}
                />
              ) : (
                <div onClick={() => setEditingTagFor(model.id)}
                  style={{ border: `1px dashed ${typeColor}`, padding: "3px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", color: typeColor }}>
                  + Add tag
                </div>
              )}
            </div>
          </div>

          {/* ACTIONS */}
          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            <button onClick={() => fetch("http://127.0.0.1:5000/open_folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: model.local_path }) })}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "#1a1d26", color: "white", cursor: "pointer", fontSize: 13 }}>
              Open Folder
            </button>
            {model.trigger_words && (
              <button onClick={() => { navigator.clipboard.writeText(model.trigger_words); alert("Trigger words copied"); }}
                style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "#1a1d26", color: "#f5a623", cursor: "pointer", fontSize: 13 }}>
                Copy Trigger
              </button>
            )}
          </div>

        </div>
      </div>
    );
  }

  function arrowBtn(side) {
    return {
      position: "absolute", [side]: 8, top: "50%", transform: "translateY(-50%)",
      background: "rgba(0,0,0,0.55)", border: "none", color: "white",
      width: 32, height: 32, borderRadius: "50%", cursor: "pointer",
      fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2
    };
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={{ display: "flex", gap: 16 }}>

      {/* SIDEBAR */}
      <div style={{ width: 195, flexShrink: 0, background: "#0f1117", border: "1px solid #222", borderRadius: 12, padding: 10, position: "sticky", top: 20, alignSelf: "flex-start", maxHeight: "calc(100vh - 40px)", overflowY: "auto" }}>

        <button onClick={handleRescan} disabled={isRescanning}
          style={{ width: "100%", padding: "8px 0", marginBottom: 14, background: isRescanning ? "#1a1d26" : "#2563eb", color: isRescanning ? "#555" : "white", border: "none", borderRadius: 8, cursor: isRescanning ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500 }}>
          {isRescanning ? "Rescanning..." : "⟳ Rescan Models"}
        </button>

        {/* TYPE FILTER */}
        <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Type</div>
        <div onClick={() => setTypeFilter(null)}
          style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between", background: typeFilter === null ? "#4da3ff" : "transparent" }}>
          <span>All types</span>
          <span style={{ opacity: 0.45, fontSize: 11 }}>{models.length}</span>
        </div>
        {Object.entries(TYPE_LABELS).map(([type, label]) => {
          const count = typeCounts[type] || 0;
          const color = TYPE_COLORS[type];
          return (
            <div key={type} onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", background: typeFilter === type ? color + "33" : "transparent", color: typeFilter === type ? color : "white" }}>
              <span>{label}</span>
              <span style={{ opacity: 0.45, fontSize: 11 }}>{count}</span>
            </div>
          );
        })}

        <div style={{ height: 1, background: "#222", margin: "12px 0" }} />

        {/* FOLDER FILTER */}
        <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Folders</div>
        <div onClick={() => setFolderFilter(null)}
          style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between", background: folderFilter === null ? "#4da3ff" : "transparent" }}>
          <span>All folders</span>
        </div>
        {folderNames.map(folder => (
          <div key={folder} onClick={() => setFolderFilter(folderFilter === folder ? null : folder)}
            style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, background: folderFilter === folder ? "#4da3ff" : "transparent" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>📁 {folder}</span>
            <span style={{ opacity: 0.45, fontSize: 11, flexShrink: 0 }}>
              {models.filter(m => getFolderName(m) === folder && (!typeFilter || m.model_type === typeFilter)).length}
            </span>
          </div>
        ))}

        <div style={{ height: 1, background: "#222", margin: "12px 0" }} />

        {/* TAG FILTER */}
        <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Tags</div>
        <div onClick={() => setTagFilter(null)}
          style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 13, background: tagFilter === null ? "#4da3ff" : "transparent" }}>
          All
        </div>
        {allTags.map(tag => {
          const count = Object.values(tagsMap).flat().filter(t => t?.name === tag.name).length;
          const isHov = hoveredTag === tag.id;
          return (
            <div key={tag.id}
              onMouseEnter={() => setHoveredTag(tag.id)}
              onMouseLeave={() => setHoveredTag(null)}
              style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, background: tagFilter === tag.name ? "#4da3ff" : isHov ? "#1a1d26" : "transparent" }}>
              <span onClick={() => setTagFilter(tag.name)} style={{ flex: 1 }}>{tag.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ opacity: 0.45, fontSize: 11 }}>{count}</span>
                {isHov && (
                  <span onClick={e => { e.stopPropagation(); deleteTagGlobally(tag); }}
                    title="Delete tag globally"
                    style={{ color: "#ef4444", fontSize: 13, lineHeight: 1, padding: "1px 3px", borderRadius: 4, cursor: "pointer" }}
                    onMouseEnter={e => e.target.style.color = "#ff6b6b"}
                    onMouseLeave={e => e.target.style.color = "#ef4444"}>×</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* GRID + DETAIL */}
      <div style={{ flex: 1, display: "flex", gap: 16, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input placeholder="Search models..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: "10px 14px", width: "100%", marginBottom: 16, background: "#1a1d26", color: "white", border: "1px solid #333", borderRadius: 8, boxSizing: "border-box", fontSize: 13 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px" }}>
            {visibleModels.map(model => {
              const allImages  = getAllImages(model);
              const thumb      = allImages[0];
              const isFocused  = focusedModel?.id === model.id;
              const folderName = getFolderName(model);
              const typeColor  = TYPE_COLORS[model.model_type] || "#aaa";

              return (
                <div key={model.id} onClick={() => setFocusedModel(isFocused ? null : model)}
                  style={{ position: "relative", background: "#1a1d26", borderRadius: 10, overflow: "hidden", cursor: "pointer", border: isFocused ? `2px solid ${typeColor}` : "2px solid transparent", transform: isFocused ? "scale(1.02)" : "scale(1)", transition: "border 0.15s, transform 0.15s" }}>
                  <div style={{ width: "100%", aspectRatio: "2 / 3", overflow: "hidden", background: "#111", position: "relative" }}>
                    {thumb ? (
                      <img src={previewUrl(thumb.image_path)} alt={model.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 11 }}>No preview</div>
                    )}
                    {/* type badge */}
                    <div style={{ position: "absolute", top: 6, left: 6, background: typeColor + "cc", color: "#000", fontSize: 9, padding: "2px 6px", borderRadius: 5, fontWeight: "bold", textTransform: "uppercase" }}>
                      {model.model_type}
                    </div>
                    {/* base model badge */}
                    {model.base_model && (
                      <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", padding: "2px 7px", borderRadius: 5, fontSize: 9, color: "#aaa" }}>
                        {model.base_model}
                      </div>
                    )}
                    {allImages.length > 1 && (
                      <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.65)", color: "#aaa", fontSize: 9, padding: "2px 6px", borderRadius: 8 }}>
                        +{allImages.length - 1}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontWeight: "bold", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{model.name}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{model.file_size_mb} MB</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                      {(tagsMap[model.id] || []).map(tag => (
                        <div key={tag.id} onClick={e => { e.stopPropagation(); removeTag(model.id, tag.id); }}
                          style={{ background: typeColor, padding: "1px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer", color: "#000" }}>
                          {tag.name} ×
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {focusedModel && <DetailPanel model={focusedModel} />}
      </div>
    </div>
  );
}

export default ModelBrowser;