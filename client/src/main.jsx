import "@mantine/core/styles.css";

import { ColorSchemeScript, MantineProvider, createTheme } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

const theme = createTheme({
  primaryColor: "blue",
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    {/* "auto" suit le thème du système ; le choix de l'utilisateur est mémorisé
        par Mantine dans le localStorage du navigateur. */}
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <App />
    </MantineProvider>
  </React.StrictMode>
);
