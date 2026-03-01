import { useState } from "react";
import LoraBrowser from "./components/LoraBrowser";

function App() {

  const [selectedLoras, setSelectedLoras] = useState([]);

  return (

    <div style={{
      padding: 20,
      fontFamily: "Arial",
      background: "#0f1117",
      color: "white",
      minHeight: "100vh"
    }}>

      <h1>ComfyUI LoRA Manager</h1>

      <LoraBrowser
        selectedLoras={selectedLoras}
        setSelectedLoras={setSelectedLoras}
      />

      <h2>Selected LoRAs:</h2>

      <pre>
        {JSON.stringify(selectedLoras, null, 2)}
      </pre>

    </div>

  );

}

export default App;