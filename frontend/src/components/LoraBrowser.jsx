import { useEffect, useState } from "react";

function LoraBrowser({ selectedLoras, setSelectedLoras }) {
  const [loras, setLoras] = useState([]);
  const [tagsMap, setTagsMap] = useState({});
  const [imagesMap, setImagesMap] = useState({});
  const [search, setSearch] = useState("");
  const [editingTagFor, setEditingTagFor] = useState(null);
  const [newTagName, setNewTagName] = useState("");
  const [allTags, setAllTags] = useState([]);
  const [selectedTagFilter, setSelectedTagFilter] = useState(null);
  const [selectedFolderFilter, setSelectedFolderFilter] = useState(null);
  const [editingTriggerFor, setEditingTriggerFor] = useState(null);
  const [triggerDraft, setTriggerDraft] = useState("");
  const [editingUrlFor, setEditingUrlFor] = useState(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [editingDescFor, setEditingDescFor] = useState(null);
  const [descDraft, setDescDraft] = useState("");
  const [focusedLora, setFocusedLora] = useState(null);
  const [isRescanning, setIsRescanning] = useState(false);
  const [hoveredTag, setHoveredTag] = useState(null);
  const [carouselIndex, setCarouselIndex] = useState({});
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 48;
  const [ratingFilter, setRatingFilter] = useState(0);

  // =========================
  // INITIAL LOAD
  // =========================
  useEffect(() => {
    fetch("http://127.0.0.1:5000/tags")
      .then(r => r.json()).then(setAllTags);
  }, []);

  useEffect(() => {
    fetch("http://127.0.0.1:5000/loras")
      .then(r => r.json())
      .then(data => {
        setLoras(data);
        if (data.length > 0) setFocusedLora(data[0]);
        data.forEach(lora => {
          fetch(`http://127.0.0.1:5000/lora_tags/${lora.id}`)
            .then(r => r.json())
            .then(tags => setTagsMap(p => ({ ...p, [lora.id]: tags })));
          fetch(`http://127.0.0.1:5000/lora_images/${lora.id}`)
            .then(r => r.json())
            .then(imgs => setImagesMap(p => ({ ...p, [lora.id]: imgs })));
        });
      });
  }, []);
useEffect(() => { setPage(1); }, [search, selectedTagFilter, selectedFolderFilter, ratingFilter]);

  // =========================
  // TAG FUNCTIONS
  // =========================
  async function createAndAssignTag(loraId) {
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
      await fetch("http://127.0.0.1:5000/assign_tag", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lora_id: loraId, tag_id: tag.id })
      });
      const updatedTags = await (await fetch(`http://127.0.0.1:5000/lora_tags/${loraId}`)).json();
      setTagsMap(p => ({ ...p, [loraId]: updatedTags }));
    } catch (err) { console.error(err); }
  }

  async function removeTag(loraId, tagId) {
    await fetch("http://127.0.0.1:5000/remove_tag", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lora_id: loraId, tag_id: tagId })
    });
    const updatedTags = await (await fetch(`http://127.0.0.1:5000/lora_tags/${loraId}`)).json();
    setTagsMap(p => ({ ...p, [loraId]: updatedTags }));
  }

  async function deleteTagGlobally(tag) {
    if (!window.confirm(`Delete tag "${tag.name}" from all LoRAs?\nThis cannot be undone.`)) return;
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
    if (selectedTagFilter === tag.name) setSelectedTagFilter(null);
  }

  // =========================
  // FIELD SAVE FUNCTIONS
  // =========================
  async function saveTriggerWords(loraId) {
    const value = triggerDraft.trim();
    setEditingTriggerFor(null); setTriggerDraft("");
    await fetch("http://127.0.0.1:5000/update_trigger", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loraId, trigger_words: value })
    });
    setLoras(p => p.map(l => l.id === loraId ? { ...l, trigger_words: value } : l));
    if (focusedLora?.id === loraId) setFocusedLora(p => ({ ...p, trigger_words: value }));
  }

  async function saveSourceUrl(loraId) {
    const value = urlDraft.trim();
    setEditingUrlFor(null); setUrlDraft("");
    await fetch("http://127.0.0.1:5000/update_source_url", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loraId, source_url: value })
    });
    setLoras(p => p.map(l => l.id === loraId ? { ...l, source_url: value } : l));
    if (focusedLora?.id === loraId) setFocusedLora(p => ({ ...p, source_url: value }));
  }

  async function saveDescription(loraId) {
    const value = descDraft.trim();
    setEditingDescFor(null); setDescDraft("");
    await fetch("http://127.0.0.1:5000/update_description", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loraId, description: value })
    });
    setLoras(p => p.map(l => l.id === loraId ? { ...l, description: value } : l));
    if (focusedLora?.id === loraId) setFocusedLora(p => ({ ...p, description: value }));
  }

  // =========================
  // RESCAN
  // =========================
  async function handleRescan() {
    setIsRescanning(true);
    try {
      const data = await (await fetch("http://127.0.0.1:5000/resync", { method: "POST" })).json();
      setLoras(data);
      data.forEach(lora => {
        fetch(`http://127.0.0.1:5000/lora_tags/${lora.id}`).then(r => r.json())
          .then(tags => setTagsMap(p => ({ ...p, [lora.id]: tags })));
        fetch(`http://127.0.0.1:5000/lora_images/${lora.id}`).then(r => r.json())
          .then(imgs => setImagesMap(p => ({ ...p, [lora.id]: imgs })));
      });
      setAllTags(await (await fetch("http://127.0.0.1:5000/tags")).json());
      if (focusedLora) {
        const still = data.find(l => l.id === focusedLora.id);
        setFocusedLora(still || data[0] || null);
      } else setFocusedLora(data[0] || null);
    } catch (err) { console.error(err); }
    setIsRescanning(false);
  }

  // =========================
  // FOLDER HELPERS
  // =========================
  function getFolderName(lora) {
    if (!lora.local_path) return "";
    const parts = lora.local_path.replace(/\\/g, "/").split("/");
    return parts.length >= 2 ? parts[parts.length - 2] : "";
  }
  const folderNames = [...new Set(loras.map(getFolderName).filter(Boolean))].sort();

  // =========================
  // FILTER
  // =========================
  const filtered = loras
  .filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
  .filter(l => !selectedTagFilter || (tagsMap[l.id] || []).some(t => t.name === selectedTagFilter))
  .filter(l => !selectedFolderFilter || getFolderName(l) === selectedFolderFilter)
  .filter(l => !ratingFilter || (l.rating || 0) >= ratingFilter);  

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // =========================
  // IMAGE HELPERS
  // =========================
  function getAllImages(lora) {
    const extra = imagesMap[lora.id] || [];
    const main  = lora.preview_image ? [{ id: "main", image_path: lora.preview_image }] : [];
    return [...main, ...extra];
  }

  function previewUrl(path) {
    return "http://127.0.0.1:5000/preview?path=" + encodeURIComponent(path);
  }

  function carouselGo(loraId, dir, total) {
    setCarouselIndex(p => {
      const cur  = p[loraId] || 0;
      const next = (cur + dir + total) % total;
      return { ...p, [loraId]: next };
    });
  }

  // =========================
  // SHARED STYLES
  // =========================
  const labelStyle = {
    fontSize: 11, color: "#555", textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 6
  };
  const addFieldStyle = {
    border: "1px dashed #333", borderRadius: 8, padding: "8px 10px",
    fontSize: 12, color: "#444", cursor: "pointer", fontStyle: "italic"
  };

  // =========================
  // DETAIL PANEL
  // =========================
  function DetailPanel({ lora }) {
    const tags      = tagsMap[lora.id]   || [];
    const allImages = getAllImages(lora);
    const isSelected = selectedLoras.find(x => x.id === lora.id);
    const folderName = getFolderName(lora);

    const safeIdx    = Math.min(carouselIndex[lora.id] || 0, allImages.length - 1);
    const currentImg = allImages[safeIdx];
    const hasMulti   = allImages.length > 1;

    return (
      <div style={{
        flex: 1, minWidth: 0, background: "#0f1117", border: "1px solid #222",
        borderRadius: 16, overflow: "hidden", display: "flex",
        position: "sticky", top: 20, alignSelf: "flex-start",
        maxHeight: "calc(100vh - 40px)"
      }}>

        {/* ── LEFT: CAROUSEL ── */}
        <div style={{
          flex: "0 0 50%", display: "flex", flexDirection: "column",
          background: "#0a0c12", overflow: "hidden"
        }}>

          {/* MAIN IMAGE */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
            {currentImg ? (
              // use <img> for everything — browsers animate GIFs natively
              <img
                key={currentImg.image_path}
                src={previewUrl(currentImg.image_path)}
                alt=""
                style={{
                  width: "100%", height: "100%",
                  objectFit: "cover", objectPosition: "center top",
                  display: "block"
                }}
              />
            ) : (
              <div style={{
                width: "100%", height: "100%", minHeight: 300,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#333", fontSize: 13
              }}>
                No preview
              </div>
            )}

            {/* NAV ARROWS */}
            {hasMulti && (
              <>
                <button onClick={() => carouselGo(lora.id, -1, allImages.length)} style={arrowBtn("left")}>‹</button>
                <button onClick={() => carouselGo(lora.id,  1, allImages.length)} style={arrowBtn("right")}>›</button>
                <div style={{
                  position: "absolute", bottom: 8, right: 8,
                  background: "rgba(0,0,0,0.6)", color: "#aaa",
                  fontSize: 11, padding: "2px 8px", borderRadius: 10, pointerEvents: "none"
                }}>
                  {safeIdx + 1} / {allImages.length}
                </div>
              </>
            )}
          </div>

          {/* THUMBNAIL STRIP */}
          {hasMulti && (
            <div style={{
              display: "flex", gap: 4, padding: "6px 8px",
              overflowX: "auto", background: "#06080f", flexShrink: 0,
              scrollbarWidth: "thin"
            }}>
              {allImages.map((img, i) => (
                <div
                  key={img.id + "_" + i}
                  onClick={() => setCarouselIndex(p => ({ ...p, [lora.id]: i }))}
                  style={{
                    width: 52, height: 70, flexShrink: 0,
                    borderRadius: 6, overflow: "hidden", cursor: "pointer",
                    border: i === safeIdx ? "2px solid #4da3ff" : "2px solid transparent",
                    opacity: i === safeIdx ? 1 : 0.5,
                    transition: "opacity 0.15s, border 0.15s"
                  }}
                >
                  <img
                    src={previewUrl(img.image_path)}
                    alt=""
                    style={{
                      width: "100%", height: "100%",
                      objectFit: "cover", objectPosition: "center top",
                      display: "block"
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* HINT */}
          <div style={{
            padding: "6px 10px", background: "#06080f",
            fontSize: 10, color: "#2a2d36", textAlign: "center", flexShrink: 0
          }}>
            Extra images auto-detected from folder · Run Rescan to refresh
          </div>
        </div>

        {/* ── RIGHT: INFO ── */}
        <div style={{
          flex: 1, padding: 20, display: "flex", flexDirection: "column",
          gap: 14, overflowY: "auto"
        }}>

          {/* CLOSE + NAME */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, paddingRight: 8 }}>
              <div style={{ fontWeight: "bold", fontSize: 16, wordBreak: "break-word", lineHeight: 1.3 }}>
                {lora.name}
              </div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                {lora.file_size_mb} MB &nbsp;·&nbsp; {lora.file_name}
              </div>
            </div>
            <div
              onClick={() => setFocusedLora(null)}
              onMouseEnter={e => e.target.style.color = "white"}
              onMouseLeave={e => e.target.style.color = "#555"}
              style={{ cursor: "pointer", color: "#555", fontSize: 20, lineHeight: 1, flexShrink: 0, padding: "2px 4px" }}
            >✕</div>
          </div>

          {/* FOLDER */}
          <div>
            <div style={labelStyle}>Folder</div>
            <div
              onClick={() => setSelectedFolderFilter(selectedFolderFilter === folderName ? null : folderName)}
              style={{
                background: "#1a1d26", borderRadius: 8, padding: "7px 10px",
                fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5,
                color: selectedFolderFilter === folderName ? "#4da3ff" : "#888",
                border: selectedFolderFilter === folderName ? "1px solid #4da3ff" : "1px solid #2a2d36",
                cursor: "pointer"
              }}
            >
              📁 {folderName || lora.local_path}
            </div>
            <div style={{ fontSize: 10, color: "#2a3040", marginTop: 4, fontFamily: "monospace", wordBreak: "break-all" }}>
              {lora.local_path}
            </div>
          </div>

          {/* SOURCE URL */}
          <div>
            <div style={labelStyle}>Source URL</div>
            {editingUrlFor === lora.id ? (
              <input autoFocus value={urlDraft} onChange={e => setUrlDraft(e.target.value)}
                onBlur={() => saveSourceUrl(lora.id)}
                onKeyDown={e => {
                  if (e.key === "Enter") saveSourceUrl(lora.id);
                  if (e.key === "Escape") { setEditingUrlFor(null); setUrlDraft(""); }
                }}
                placeholder="https://civitai.com/models/..."
                style={{ width: "100%", background: "#111", border: "1px solid #a78bfa", color: "white", borderRadius: 8, fontSize: 12, padding: "8px 10px", boxSizing: "border-box" }}
              />
            ) : lora.source_url ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <a href={lora.source_url} target="_blank" rel="noreferrer"
                  style={{ flex: 1, background: "#1a1d26", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#a78bfa", wordBreak: "break-all", border: "1px solid #2a2d36", textDecoration: "none", lineHeight: 1.5 }}>
                  🔗 {lora.source_url}
                </a>
                <span onClick={() => { setEditingUrlFor(lora.id); setUrlDraft(lora.source_url); }}
                  style={{ cursor: "pointer", color: "#555", fontSize: 14, padding: "4px 6px" }}
                  onMouseEnter={e => e.target.style.color = "white"}
                  onMouseLeave={e => e.target.style.color = "#555"}
                >✎</span>
              </div>
            ) : (
              <div onClick={() => { setEditingUrlFor(lora.id); setUrlDraft(""); }} style={addFieldStyle}>
                + Add source URL
              </div>
            )}
          </div>

          {/* DESCRIPTION */}
          <div>
            <div style={labelStyle}>Description</div>
            {editingDescFor === lora.id ? (
              <textarea autoFocus value={descDraft}
                onChange={e => setDescDraft(e.target.value)}
                onBlur={() => saveDescription(lora.id)}
                onKeyDown={e => { if (e.key === "Escape") { setEditingDescFor(null); setDescDraft(""); } }}
                placeholder="What does this LoRA do? Style, character, use cases..."
                style={{
                  width: "100%", background: "#111", border: "1px solid #34d399", color: "white",
                  borderRadius: 8, fontSize: 12, padding: "8px 10px", resize: "vertical",
                  boxSizing: "border-box", lineHeight: 1.6, minHeight: 80
                }}
                rows={4}
              />
            ) : lora.description ? (
              <div
                onClick={() => { setEditingDescFor(lora.id); setDescDraft(lora.description); }}
                title="Click to edit"
                style={{
                  background: "#1a1d26", borderRadius: 8, padding: "8px 10px", fontSize: 12,
                  color: "#ccc", lineHeight: 1.7, cursor: "pointer", border: "1px solid #2a2d36",
                  whiteSpace: "pre-wrap", wordBreak: "break-word"
                }}
              >
                {lora.description}
              </div>
            ) : (
              <div onClick={() => { setEditingDescFor(lora.id); setDescDraft(""); }} style={addFieldStyle}>
                + Add description
              </div>
            )}
          </div>

          {/* TRIGGER WORDS */}
          <div>
            <div style={labelStyle}>Trigger Words</div>
            {editingTriggerFor === lora.id ? (
              <textarea autoFocus value={triggerDraft}
                onChange={e => setTriggerDraft(e.target.value)}
                onBlur={() => saveTriggerWords(lora.id)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveTriggerWords(lora.id); }
                  if (e.key === "Escape") { setEditingTriggerFor(null); setTriggerDraft(""); }
                }}
                style={{
                  width: "100%", background: "#111", border: "1px solid #f5a623", color: "white",
                  borderRadius: 8, fontSize: 12, padding: "8px 10px", resize: "vertical",
                  boxSizing: "border-box", fontFamily: "monospace", lineHeight: 1.5
                }}
                rows={3}
              />
            ) : lora.trigger_words ? (
              <div onClick={() => { setEditingTriggerFor(lora.id); setTriggerDraft(lora.trigger_words); }}
                style={{
                  background: "#1a1d26", borderRadius: 8, padding: "8px 10px", fontSize: 12,
                  color: "#f5a623", fontFamily: "monospace", wordBreak: "break-all",
                  lineHeight: 1.6, cursor: "pointer", border: "1px solid #2a2d36"
                }}>
                {lora.trigger_words}
              </div>
            ) : (
              <div onClick={() => { setEditingTriggerFor(lora.id); setTriggerDraft(""); }} style={addFieldStyle}>
                + Add trigger words
              </div>
            )}
          </div>

          {/* TAGS */}
          <div>
            <div style={labelStyle}>Tags</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {tags.map(tag => (
                <div key={tag.id} onClick={() => removeTag(lora.id, tag.id)} title="Click to remove"
                  style={{ background: "#4da3ff", padding: "3px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                  {tag.name} ×
                </div>
              ))}
              {editingTagFor === lora.id ? (
                <input autoFocus value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  onBlur={() => setEditingTagFor(null)}
                  onKeyDown={e => { if (e.key === "Enter") createAndAssignTag(lora.id); if (e.key === "Escape") setEditingTagFor(null); }}
                  placeholder="tag..."
                  style={{ background: "#111", border: "1px solid #4da3ff", color: "white", borderRadius: 6, fontSize: 12, padding: "3px 8px", width: 80 }}
                />
              ) : (
                <div onClick={() => setEditingTagFor(lora.id)}
                  style={{ border: "1px dashed #4da3ff", padding: "3px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", color: "#4da3ff" }}>
                  + Add tag
                </div>
              )}
            </div>
          </div>
              

              {/* RATING */}
          <div>
            <div style={labelStyle}>Rating</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1,2,3,4,5].map(star => (
                <span key={star}
                  onClick={async () => {
                    const newRating = lora.rating === star ? 0 : star;
                    await fetch("http://127.0.0.1:5000/set_rating", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: lora.id, asset_type: "lora", rating: newRating })
                    });
                    setLoras(p => p.map(x => x.id === lora.id ? { ...x, rating: newRating } : x));
                    setFocusedLora(p => ({ ...p, rating: newRating }));
                  }}
                  style={{ fontSize: 22, cursor: "pointer", color: star <= (lora.rating || 0) ? "#f59e0b" : "#2a2d36", transition: "color 0.1s" }}
                  onMouseEnter={e => e.target.style.color = "#f59e0b"}
                  onMouseLeave={e => e.target.style.color = star <= (lora.rating || 0) ? "#f59e0b" : "#2a2d36"}
                >★</span>
              ))}
              {lora.rating > 0 && (
                <span style={{ fontSize: 11, color: "#555", alignSelf: "center", marginLeft: 4 }}>
                  {["","★","★★","★★★","★★★★","★★★★★"][lora.rating]}
                </span>
              )}
            </div>
          </div>

          {/* ACTIONS */}
          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            <button onClick={() => { if (isSelected) setSelectedLoras(selectedLoras.filter(x => x.id !== lora.id)); else setSelectedLoras([...selectedLoras, lora]); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: isSelected ? "#4da3ff" : "#1a1d26", color: "white", cursor: "pointer", fontSize: 13, fontWeight: isSelected ? "bold" : "normal" }}>
              {isSelected ? "✓ Selected" : "Select"}
            </button>
            <button onClick={() => fetch("http://127.0.0.1:5000/open_folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: lora.local_path }) })}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "#1a1d26", color: "white", cursor: "pointer", fontSize: 13 }}>
              Open Folder
            </button>
            <button onClick={() => { if (!lora.trigger_words) { alert("No trigger words saved"); return; } navigator.clipboard.writeText(lora.trigger_words); alert("Trigger words copied"); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "#1a1d26", color: "#f5a623", cursor: "pointer", fontSize: 13 }}>
              Copy Trigger
            </button>
          </div>

        </div>
      </div>
    );
  }
    function pageBtn(disabled) {
    return {
      padding: "5px 10px", borderRadius: 6, border: "1px solid #2a2d36",
      background: "#1a1d26", color: disabled ? "#333" : "#aaa",
      cursor: disabled ? "not-allowed" : "pointer", fontSize: 13
    };
  }
  // arrow button style helper
  function arrowBtn(side) {
    return {
      position: "absolute", [side]: 8, top: "50%", transform: "translateY(-50%)",
      background: "rgba(0,0,0,0.55)", border: "none", color: "white",
      width: 32, height: 32, borderRadius: "50%", cursor: "pointer",
      fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 2
    };
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={{ display: "flex", gap: 16 }}>

      {/* SIDEBAR */}
      <div style={{
        width: 195, flexShrink: 0, background: "#0f1117", border: "1px solid #222",
        borderRadius: 12, padding: 10, position: "sticky", top: 20,
        alignSelf: "flex-start", maxHeight: "calc(100vh - 40px)", overflowY: "auto"
      }}>
        <button onClick={handleRescan} disabled={isRescanning}
          style={{
            width: "100%", padding: "8px 0", marginBottom: 14,
            background: isRescanning ? "#1a1d26" : "#2563eb",
            color: isRescanning ? "#555" : "white",
            border: "none", borderRadius: 8,
            cursor: isRescanning ? "not-allowed" : "pointer",
            fontSize: 12, fontWeight: 500
          }}>
          {isRescanning ? "Rescanning..." : "⟳ Rescan Library"}
        </button>

        {/* FOLDERS */}
        <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Folders</div>
        <div onClick={() => setSelectedFolderFilter(null)}
          style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between", background: selectedFolderFilter === null ? "#4da3ff" : "transparent" }}>
          <span>All folders</span>
          <span style={{ opacity: 0.45, fontSize: 11 }}>{loras.length}</span>
        </div>
        {folderNames.map(folder => {
          const count = loras.filter(l => getFolderName(l) === folder).length;
          return (
            <div key={folder} onClick={() => setSelectedFolderFilter(selectedFolderFilter === folder ? null : folder)}
              style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, background: selectedFolderFilter === folder ? "#4da3ff" : "transparent" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>📁 {folder}</span>
              <span style={{ opacity: 0.45, fontSize: 11, flexShrink: 0 }}>{count}</span>
            </div>
          );
        })}

        <div style={{ height: 1, background: "#222", margin: "12px 0" }} />

        <div style={{ height: 1, background: "#222", margin: "12px 0" }} />
<div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Rating mínimo</div>
<div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
  {[0,1,2,3,4,5].map(r => (
    <span key={r} onClick={() => setRatingFilter(r)}
      style={{ fontSize: 18, cursor: "pointer", color: r === 0 ? (ratingFilter === 0 ? "#4da3ff" : "#333") : r <= ratingFilter ? "#f59e0b" : "#2a2d36" }}>
      {r === 0 ? "✕" : "★"}
    </span>
  ))}
</div>

        {/* TAGS */}
        <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Tags</div>
        <div onClick={() => setSelectedTagFilter(null)}
          style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 13, background: selectedTagFilter === null ? "#4da3ff" : "transparent" }}>
          All
        </div>
        {allTags.map(tag => {
          const count = Object.values(tagsMap).flat().filter(t => t?.name === tag.name).length;
          const isHov = hoveredTag === tag.id;
          return (
            <div key={tag.id}
              onMouseEnter={() => setHoveredTag(tag.id)}
              onMouseLeave={() => setHoveredTag(null)}
              style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, background: selectedTagFilter === tag.name ? "#4da3ff" : isHov ? "#1a1d26" : "transparent" }}
            >
              <span onClick={() => setSelectedTagFilter(tag.name)} style={{ flex: 1 }}>{tag.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ opacity: 0.45, fontSize: 11 }}>{count}</span>
                {isHov && (
                  <span onClick={e => { e.stopPropagation(); deleteTagGlobally(tag); }}
                    title="Delete tag globally"
                    style={{ color: "#ef4444", fontSize: 13, lineHeight: 1, padding: "1px 3px", borderRadius: 4, cursor: "pointer" }}
                    onMouseEnter={e => e.target.style.color = "#ff6b6b"}
                    onMouseLeave={e => e.target.style.color = "#ef4444"}
                  >×</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

 {/* GRID + DETAIL */}
      <div style={{ flex: 1, display: "flex", gap: 16, minWidth: 0 }}>

        <div style={{ flex: 1, minWidth: 0 }}>
          <input placeholder="Search LoRAs..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: "10px 14px", width: "100%", marginBottom: 16, background: "#1a1d26", color: "white", border: "1px solid #333", borderRadius: 8, boxSizing: "border-box", fontSize: 13 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px" }}>
            {paginated.map(lora => {
              const allImages  = getAllImages(lora);
              const thumb      = allImages[0];
              const isFocused  = focusedLora?.id === lora.id;
              const isSelected = selectedLoras.find(x => x.id === lora.id);
              const folderName = getFolderName(lora);

              return (
                <div key={lora.id} onClick={() => setFocusedLora(isFocused ? null : lora)}
                  style={{
                    position: "relative", background: "#1a1d26", borderRadius: 10,
                    overflow: "hidden", cursor: "pointer",
                    border: isFocused ? "2px solid #4da3ff" : isSelected ? "2px solid #4da3ff66" : "2px solid transparent",
                    transform: isFocused ? "scale(1.02)" : "scale(1)",
                    transition: "border 0.15s, transform 0.15s"
                  }}
                >
                  <div style={{ width: "100%", aspectRatio: "2 / 3", overflow: "hidden", background: "#111", position: "relative" }}>
                    {thumb ? (
                      <img src={previewUrl(thumb.image_path)} alt={lora.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 11 }}>No preview</div>
                    )}
                    {folderName && (
                      <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", padding: "2px 7px", borderRadius: 5, fontSize: 9, color: "#aaa", maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {folderName}
                      </div>
                    )}
                    {allImages.length > 1 && (
                      <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.65)", color: "#aaa", fontSize: 9, padding: "2px 6px", borderRadius: 8 }}>
                        +{allImages.length - 1}
                      </div>
                    )}
                  </div>

                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontWeight: "bold", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lora.name}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{lora.file_size_mb} MB</div>

                    {!isFocused && (
                      <>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
                          {(tagsMap[lora.id] || []).map(tag => (
                            <div key={tag.id} onClick={e => { e.stopPropagation(); removeTag(lora.id, tag.id); }}
                              style={{ background: "#4da3ff", padding: "1px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>
                              {tag.name} ×
                            </div>
                          ))}
                          {editingTagFor === lora.id ? (
                            <input autoFocus value={newTagName} onChange={e => setNewTagName(e.target.value)}
                              onBlur={() => setEditingTagFor(null)} onClick={e => e.stopPropagation()}
                              onKeyDown={e => { if (e.key === "Enter") createAndAssignTag(lora.id); if (e.key === "Escape") setEditingTagFor(null); }}
                              placeholder="tag..."
                              style={{ background: "#111", border: "1px solid #4da3ff", color: "white", borderRadius: 5, fontSize: 10, padding: "1px 5px", width: 60 }}
                            />
                          ) : (
                            <div onClick={e => { e.stopPropagation(); setEditingTagFor(lora.id); }}
                              style={{ border: "1px dashed #4da3ff", padding: "1px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer", color: "#4da3ff" }}>
                              + tag
                            </div>
                          )}
                        </div>
                        <div style={{ marginTop: 5 }}>
                          {editingTriggerFor === lora.id ? (
                            <textarea autoFocus value={triggerDraft} onChange={e => setTriggerDraft(e.target.value)}
                              onBlur={() => saveTriggerWords(lora.id)} onClick={e => e.stopPropagation()}
                              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveTriggerWords(lora.id); } if (e.key === "Escape") { setEditingTriggerFor(null); setTriggerDraft(""); } }}
                              style={{ width: "100%", background: "#111", border: "1px solid #f5a623", color: "white", borderRadius: 6, fontSize: 10, padding: "3px 5px", resize: "none", boxSizing: "border-box", fontFamily: "monospace" }}
                              rows={2}
                            />
                          ) : lora.trigger_words ? (
                            <div onClick={e => { e.stopPropagation(); setEditingTriggerFor(lora.id); setTriggerDraft(lora.trigger_words); }}
                              style={{ fontSize: 10, color: "#f5a623", cursor: "pointer", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {lora.trigger_words}
                            </div>
                          ) : (
                            <div onClick={e => { e.stopPropagation(); setEditingTriggerFor(lora.id); setTriggerDraft(""); }}
                              style={{ fontSize: 10, color: "#444", cursor: "pointer", fontStyle: "italic" }}>
                              + Add trigger words
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* PAGINADOR */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
              <button onClick={() => setPage(1)} disabled={page === 1} style={pageBtn(page === 1)}>«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn(page === 1)}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                .reduce((acc, n, i, arr) => {
                  if (i > 0 && n - arr[i-1] > 1) acc.push("...");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) => n === "..." ? (
                  <span key={"e"+i} style={{ color: "#555", padding: "0 4px" }}>…</span>
                ) : (
                  <button key={n} onClick={() => setPage(n)}
                    style={{ ...pageBtn(false), background: page === n ? "#4da3ff" : "#1a1d26", color: page === n ? "white" : "#aaa", fontWeight: page === n ? 700 : 400 }}>
                    {n}
                  </button>
                ))
              }
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtn(page === totalPages)}>›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={pageBtn(page === totalPages)}>»</button>
              <span style={{ fontSize: 12, color: "#555", marginLeft: 8 }}>
                {filtered.length} total · página {page} de {totalPages}
              </span>
            </div>
          )}
        </div>

        {focusedLora && <DetailPanel lora={focusedLora} />}

      </div>
    </div>
  );
}

export default LoraBrowser;