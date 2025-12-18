import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useEffect } from "react";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import DashboardHome from "@/pages/DashboardHome";
import Orders from "@/pages/Orders";
import ArchivedOrders from "@/pages/ArchivedOrders";
import ArchivedOrderDetails from "@/pages/ArchivedOrderDetails";
import CompletedOrders from "@/pages/CompletedOrders";
import PhysicalStores from "@/pages/PhysicalStores";
import Sales from "@/pages/Sales";
import Shopify from "@/pages/Shopify";

import OrderPreparation from "@/pages/OrderPreparation";
import StoreOrderPreparation from "@/pages/StoreOrderPreparation";
import EditOrder from "@/pages/EditOrder";
import Picking from "@/pages/Picking";
import FreePickingMode from "@/pages/FreePickingMode";
import Products from "@/pages/Products";
import ProductDetail from "@/pages/ProductDetail";
import ProductLocation from "@/pages/ProductLocation";
import Bins from "@/pages/Bins";
import Inventory from "@/pages/Inventory";
import MoveProducts from "@/pages/MoveProducts";
import CreateOrder from "@/pages/CreateOrder";
import StockEntry from "@/pages/StockEntry";
import ImportStock from "@/pages/ImportStock";
import StockWithdrawal from "@/pages/StockWithdrawal";
import ImportStockWithdrawal from "@/pages/ImportStockWithdrawal";
import StockMovementsLog from "@/pages/StockMovementsLog";
import StockMovementDetail from "@/pages/StockMovementDetail";
import StockReconciliation from "@/pages/StockReconciliation";
import CrearVenta from "@/pages/CrearVenta";
import SalesReport from "@/pages/SalesReport";
import SalePreparation from "@/pages/SalePreparation";
import SalePicking from "@/pages/SalePicking";
import EditSale from "@/pages/EditSale";
import UsersManagement from "@/pages/UsersManagement";
import UserTypesManagement from "@/pages/UserTypesManagement";
import FrozenProducts from "@/pages/FrozenProducts";
import InventoryReports from "@/pages/InventoryReports";
import ProductCounter from "@/pages/ProductCounter";
import ImprimirEtiquetas from "@/pages/ImprimirEtiquetas";
import RecoverFailedFreePickings from "@/pages/RecoverFailedFreePickings";
import ManualCompleteSale from "@/pages/ManualCompleteSale";
import DiagnosticoAsignaciones from "@/pages/DiagnosticoAsignaciones";
import PickingAuditLogs from "@/pages/PickingAuditLogs";
import ZombieSessionsDashboard from "@/pages/ZombieSessionsDashboard";
import StuckSalesRecovery from "@/pages/StuckSalesRecovery";
import VerifyTransferReception from "@/pages/VerifyTransferReception";
import CodeExplorer from "@/pages/CodeExplorer";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  // Cleanup residual localStorage key from old fix
  useEffect(() => {
    localStorage.removeItem('fixV1011Done');
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/picking-libre" element={<FreePickingMode />} />
            <Route path="/traslado-entre-sucursales" element={<CreateOrder />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/stores" element={<PhysicalStores />} />
            <Route path="/orders/sales" element={<Sales />} />
            <Route path="/orders/completed" element={<CompletedOrders />} />
            <Route path="/orders/archived" element={<ArchivedOrders />} />
            <Route path="/orders/archived/:orderId/details" element={<ArchivedOrderDetails />} />
            <Route path="/orders/shopify" element={<Shopify />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:productName" element={<ProductDetail />} />
            <Route path="/productos/ubicaciones" element={<ProductLocation />} />
            <Route path="/productos/bins" element={<Bins />} />
            <Route path="/productos/inventario" element={<Inventory />} />
            <Route path="/productos/reportes-inventario" element={<InventoryReports />} />
            <Route path="/productos/mover" element={<MoveProducts />} />
        <Route path="/productos/ingreso" element={<StockEntry />} />
        <Route path="/productos/importar" element={<ImportStock />} />
        <Route path="/productos/retirar" element={<StockWithdrawal />} />
        <Route path="/productos/retirar/importar" element={<ImportStockWithdrawal />} />
        <Route path="/productos/logs" element={<StockMovementsLog />} />
        <Route path="/productos/logs/:movementId" element={<StockMovementDetail />} />
            <Route path="/orders/store/:orderId" element={<StoreOrderPreparation />} />
            <Route path="/orders/store/:orderId/edit" element={<EditOrder />} />
            <Route path="/orders/store/:orderId/picking" element={<Picking />} />
            <Route path="/orders/web/:orderId" element={<OrderPreparation />} />
          <Route path="/orders/sale/:orderId" element={<SalePreparation />} />
          <Route path="/orders/sale/:orderId/picking" element={<SalePicking />} />
           <Route path="/orders/sale/:orderId/edit" element={<EditSale />} />
            <Route path="/crear-venta" element={<CrearVenta />} />
            <Route path="/resumen-ventas" element={<SalesReport />} />
            <Route path="/contador-productos" element={<ProductCounter />} />
            <Route path="/imprimir-etiquetas" element={<ImprimirEtiquetas />} />
            <Route path="/conciliaciones" element={<StockReconciliation />} />
            <Route path="/admin/user-types" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <UserTypesManagement />
              </ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <UsersManagement />
              </ProtectedRoute>
            } />
            <Route path="/admin/recover-free-pickings" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <RecoverFailedFreePickings />
              </ProtectedRoute>
            } />
            <Route path="/admin/manual-complete-sale" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ManualCompleteSale />
              </ProtectedRoute>
            } />
            <Route path="/admin/diagnostico-asignaciones" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <DiagnosticoAsignaciones />
              </ProtectedRoute>
            } />
            <Route path="/admin/picking-audit-logs" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PickingAuditLogs />
              </ProtectedRoute>
            } />
            <Route path="/admin/zombie-sessions" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ZombieSessionsDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/stuck-sales-recovery" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <StuckSalesRecovery />
              </ProtectedRoute>
            } />
            <Route path="/frozen-products" element={<FrozenProducts />} />
            <Route path="/verificar-recepcion" element={<VerifyTransferReception />} />
            <Route path="/explorador-codigos" element={<CodeExplorer />} />
          </Route>
          <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </ThemeProvider>
  </QueryClientProvider>
  );
};

export default App;
