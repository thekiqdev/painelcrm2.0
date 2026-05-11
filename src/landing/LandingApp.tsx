import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingStandalonePage from "./LandingStandalonePage";

export default function LandingApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingStandalonePage />} />
      </Routes>
    </BrowserRouter>
  );
}
