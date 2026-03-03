import { useState } from "react";
import LoraBrowser from "./components/LoraBrowser";
import ModelBrowser from "./components/ModelBrowser";


const TABS = [
  { id: "loras",       label: "LoRAs",       color: "#4da3ff" },
  { id: "checkpoint",  label: "Checkpoints", color: "#f59e0b" },
  { id: "vae",         label: "VAEs",        color: "#34d399" },
  { id: "upscaler",    label: "Upscalers",   color: "#f472b6" },
  { id: "diffusion",   label: "Diffusion",   color: "#818cf8" },
];

function App() {
  const [activeTab, setActiveTab]       = useState("loras");
  const [selectedLoras, setSelectedLoras] = useState([]);

  const activeColor = TABS.find(t => t.id === activeTab)?.color || "#4da3ff";

  return (
    <div style={{
      padding: 20,
      fontFamily: "Arial",
      background: "#0f1117",
      color: "white",
      minHeight: "100vh"
    }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: "#aaa", fontWeight: 400 }}>
          ComfyUI <span style={{ color: activeColor, fontWeight: 700 }}>Asset Manager</span>
        </h1>
      </div>

      {/* TABS */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        borderBottom: "1px solid #222", paddingBottom: 0
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <div key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 18px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? tab.color : "#555",
                borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                marginBottom: -1,
                transition: "color 0.15s, border-color 0.15s",
                userSelect: "none"
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "#aaa"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "#555"; }}
            >
              {tab.label}
            </div>
          );
        })}
      </div>

      {/* CONTENT */}
      {activeTab === "loras" ? (
        <LoraBrowser
          selectedLoras={selectedLoras}
          setSelectedLoras={setSelectedLoras}
        />
      ) : (
        <ModelBrowser key={activeTab} initialTypeFilter={activeTab} />
      )}

    </div>
  );
}

export default App;