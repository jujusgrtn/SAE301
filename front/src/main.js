import { Router } from "./lib/router.js";
import { RootLayout } from "./layouts/root/layout.js";
import { CataloguePage } from "./pages/catalogue/page.js";
import { CategoryPage } from "./pages/categorie/page.js";
import { ProductPage } from "./pages/produit/page.js";
import { CartPage } from "./pages/panier/page.js";
import { LoginPage } from "./pages/connexion/page.js";
import { SummaryPage } from "./pages/recapitulatif/page.js";
import { ConfirmationPage } from "./pages/confirmation/page.js";
import { AdminPage } from "./pages/admin/page.js";
import { AdminProductsPage } from "./pages/admin-produits/page.js";
import { AdminProductFormPage } from "./pages/admin-produit/page.js";
import { The404Page } from "./pages/404/page.js";

// base : chemin du projet sur le serveur (BASE dans vite.config.js).
const router = new Router("app", { base: import.meta.env.BASE_URL });

router.addLayout("/", RootLayout);

router.addRoute("/", CataloguePage);
router.addRoute("/categorie/:slug", CategoryPage);
router.addRoute("/produit/:slug", ProductPage);
router.addRoute("/panier", CartPage);
router.addRoute("/connexion", LoginPage);
router.addRoute("/commande/recapitulatif", SummaryPage);
router.addRoute("/commande/confirmation", ConfirmationPage);
router.addRoute("/admin", AdminPage);
router.addRoute("/admin/produits", AdminProductsPage);
router.addRoute("/admin/produits/nouveau", AdminProductFormPage);
router.addRoute("/admin/produits/:id/modifier", AdminProductFormPage);

// En dernier : toute adresse qui ne correspond à aucune route.
router.addRoute("*", The404Page);

// Démarrer le routeur
router.start();
