import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { FinanceProvider } from "./context/FinanceContext.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import "./index.css";
import { registerServiceWorker } from "./pwa/pwa.js";

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FinanceProvider>
          <App />
        </FinanceProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
