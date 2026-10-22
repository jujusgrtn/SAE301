import { Router } from "./lib/router.js";
import { RootLayout } from "./layouts/root/layout.js";
import { CataloguePage } from "./pages/catalogue/page.js";
import { CategoryPage } from "./pages/categorie/page.js";
import { ProductPage } from "./pages/produit/page.js";
import { CartPage } from "./pages/panier/page.js";
import { LoginPage } from "./pages/connexion/page.js";
import { SummaryPage } from "./pages/recapitulatif/page.js";
import { ConfirmationPage } from "./pages/confirmation/page.js";
import { AccountHomePage } from "./pages/espace-client/page.js";
import { ProfilePage } from "./pages/profil/page.js";
import { OrderHistoryPage } from "./pages/mes-commandes/page.js";
import { MyOrderPage } from "./pages/ma-commande/page.js";
import { AdminPage } from "./pages/admin/page.js";
import { AdminProductsPage } from "./pages/admin-produits/page.js";
import { AdminProductFormPage } from "./pages/admin-produit/page.js";
import { AdminCategoriesPage } from "./pages/admin-categories/page.js";
import { AdminCategoryFormPage } from "./pages/admin-categorie/page.js";
import { AdminOrdersPage } from "./pages/admin-commandes/page.js";
import { AdminJournalPage } from "./pages/admin-journal/page.js";
import { AdminStatsPage } from "./pages/admin-statistiques/page.js";
import { AdminOrderPage } from "./pages/admin-commande/page.js";
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
router.addRoute("/compte", AccountHomePage);
router.addRoute("/compte/profil", ProfilePage);
router.addRoute("/compte/commandes", OrderHistoryPage);
router.addRoute("/compte/commandes/:numero", MyOrderPage);
router.addRoute("/admin", AdminPage);
router.addRoute("/admin/produits", AdminProductsPage);
router.addRoute("/admin/produits/nouveau", AdminProductFormPage);
router.addRoute("/admin/produits/:id/modifier", AdminProductFormPage);
router.addRoute("/admin/categories", AdminCategoriesPage);
router.addRoute("/admin/categories/nouveau", AdminCategoryFormPage);
router.addRoute("/admin/categories/:id/modifier", AdminCategoryFormPage);
router.addRoute("/admin/statistiques", AdminStatsPage);
router.addRoute("/admin/journal", AdminJournalPage);
router.addRoute("/admin/commandes", AdminOrdersPage);
router.addRoute("/admin/commandes/:numero", AdminOrderPage);

// En dernier : toute adresse qui ne correspond à aucune route.
router.addRoute("*", The404Page);

// Démarrer le routeur
router.start();
