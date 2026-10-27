import React from "react";
import ReactDOM from "react-dom/client";
import LandingApp from "./LandingApp";
import "@/lib/i18n/i18n";
import "./landing.css";

const el = document.getElementById("root");
if (!el) {
  throw new Error("Elemento #root não encontrado");
}

ReactDOM.createRoot(el).render(
  <React.StrictMode>
    <LandingApp />
  </React.StrictMode>
);
