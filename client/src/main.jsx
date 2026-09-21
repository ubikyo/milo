import "@mantine/core/styles.css";

import { ColorSchemeScript, MantineProvider, createTheme } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Favicon from "./components/Favicon.jsx";

const theme = createTheme({
  primaryColor: "blue",
  components: {
    // Tous les liens en vert.
    Anchor: { defaultProps: { c: "teal" } },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    {/* "auto" suit le thème du système ; le choix de l'utilisateur est mémorisé
        par Mantine dans le localStorage du navigateur. */}
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Favicon />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
