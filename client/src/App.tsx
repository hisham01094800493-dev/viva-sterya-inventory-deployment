import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "./contexts/ThemeContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
const AdditionsPage = lazy(() => import("./pages/InventoryPages").then(module => ({ default: module.AdditionsPage })));
const AlertsPage = lazy(() => import("./pages/InventoryPages").then(module => ({ default: module.AlertsPage })));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const DisbursementsPage = lazy(() => import("./pages/InventoryPages").then(module => ({ default: module.DisbursementsPage })));
const ItemsPage = lazy(() => import("./pages/InventoryPages").then(module => ({ default: module.ItemsPage })));
const InventoryAuditPage = lazy(() => import("./pages/InventoryAuditPage"));
const SettingsPage = lazy(() => import("./pages/InventoryPages").then(module => ({ default: module.SettingsPage })));
const TransfersPage = lazy(() => import("./pages/InventoryPages").then(module => ({ default: module.TransfersPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const GovernancePage = lazy(() => import("./pages/GovernancePage"));
const StockAdjustmentsPage = lazy(() => import("./pages/StockAdjustmentsPage"));
const WarehousesPage = lazy(() => import("./pages/WarehousesSuppliersPages").then(module => ({ default: module.WarehousesPage })));
const SuppliersPage = lazy(() => import("./pages/WarehousesSuppliersPages").then(module => ({ default: module.SuppliersPage })));
const CustomersPage = lazy(() => import("./pages/WarehousesSuppliersPages").then(module => ({ default: module.CustomersPage })));
const AccountStatementPage = lazy(() => import("./pages/WarehousesSuppliersPages").then(module => ({ default: module.AccountStatementPage })));
import NotFound from "./pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import OfflineSyncManager from "./components/OfflineSyncManager";
import NetworkStatusIndicator from "./components/NetworkStatusIndicator";
import IframePdfCanvasOverlays from "./components/IframePdfCanvasOverlays";
import MobilePdfToolbarCollapser from "./components/MobilePdfToolbarCollapser";
import TableColumnPinning from "./components/TableColumnPinning";
import AccountStatementTableZoom from "./components/AccountStatementTableZoom";
import WarehouseMovementAssistant from "./components/WarehouseMovementAssistant";

function NavigationFallback() {
  return (
    <div className="navigation-loading min-h-svh bg-[#f4f7fb] p-4 sm:p-6" dir="rtl" aria-live="polite" aria-busy="true">
      <div className="navigation-progress" />
      <div className="mx-auto flex min-h-[calc(100svh-2rem)] max-w-[1500px] flex-col gap-5 sm:min-h-[calc(100svh-3rem)]">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#b5dce9]/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3"><span className="navigation-loading-orb" /><div className="space-y-2"><div className="navigation-skeleton h-3 w-28 rounded-full" /><div className="navigation-skeleton h-2 w-44 rounded-full" /></div></div>
          <div className="navigation-skeleton h-9 w-24 rounded-xl" />
        </div>
        <div className="grid flex-1 gap-5 lg:grid-cols-[230px_1fr]">
          <div className="hidden rounded-3xl border border-[#b5dce9]/60 bg-white/70 p-4 shadow-sm lg:block"><div className="navigation-skeleton mb-6 h-10 w-full rounded-2xl" />{Array.from({ length: 7 }).map((_, index) => <div key={index} className="navigation-skeleton mb-3 h-9 w-full rounded-xl" />)}</div>
          <main className="space-y-5"><div className="navigation-skeleton h-32 rounded-[2rem]" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="navigation-skeleton h-32 rounded-2xl" />)}</div><div className="navigation-skeleton min-h-[260px] rounded-3xl" /></main>
        </div>
      </div>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <div key={location} className="page-transition">
    <Suspense fallback={<NavigationFallback />}>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/items" component={ItemsPage} />
      <Route path="/inventory-audit" component={InventoryAuditPage} />
      <Route path="/warehouses" component={WarehousesPage} />
      <Route path="/warehouses/:slot" component={WarehousesPage} />
      <Route path="/suppliers" component={SuppliersPage} />
      <Route path="/suppliers/:id/statement"><AccountStatementPage kind="supplier" /></Route>
      <Route path="/customers" component={CustomersPage} />
      <Route path="/customers/:id/statement"><AccountStatementPage kind="customer" /></Route>
      <Route path="/additions" component={AdditionsPage} />
      <Route path="/disbursements" component={DisbursementsPage} />
      <Route path="/transfers" component={TransfersPage} />
      <Route path="/alerts" component={AlertsPage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/governance" component={GovernancePage} />
      <Route path="/stock-adjustments" component={StockAdjustmentsPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
      </Switch>
    </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-left" richColors />
          <PwaInstallPrompt />
          <PwaUpdatePrompt />
          <OfflineSyncManager />
          <NetworkStatusIndicator />
          <IframePdfCanvasOverlays />
          <MobilePdfToolbarCollapser />
          <TableColumnPinning />
          <AccountStatementTableZoom />
          <WarehouseMovementAssistant />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
