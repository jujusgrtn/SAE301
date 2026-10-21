import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// Chemin du projet sur le serveur, avec la barre finale. Il doit être
// identique à « chemin » dans back/config/config.php.
const BASE = "/~segrestan1/SAE301-Starter/";

// Serveur qui héberge l'API.
const SERVEUR = "https://mmi.unilim.fr";

export default defineConfig({
  // Toutes les adresses de l'application commencent par BASE : celles des
  // fichiers produits par le build, et celles que gère le routeur
  // (import.meta.env.BASE_URL, voir src/main.js).
  base: BASE,

  plugins: [tailwindcss()],

  // En développement (npm run dev), le front est servi par Vite sur
  // http://localhost:5173/~votre_login/SAE301-Starter/ et les requêtes vers
  // /~votre_login/SAE301-Starter/api/... sont relayées vers le serveur. Pour le
  // navigateur, front et API ont donc la même origine et le même chemin
  // qu'en production : les cookies de l'API (préférences, session) sont
  // acceptés et renvoyés comme sur le serveur.
  server: {
    proxy: {
      [BASE + "api"]: { target: SERVEUR, changeOrigin: true },
      // Photos envoyées depuis le back-office : elles sont enregistrées sur le
      // serveur (uploads/), pas dans front/public/, donc Vite doit les relayer.
      [BASE + "uploads"]: { target: SERVEUR, changeOrigin: true },
    },
  },

  build: {
    target: "esnext",
  },
});
