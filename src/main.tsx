import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleAuthProvider } from "./lib/googleAuth";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><GoogleAuthProvider><App /></GoogleAuthProvider></React.StrictMode>
);
