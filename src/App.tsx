import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Templates from "./pages/Templates";
import UploadDocument from "./pages/UploadDocument";
import DocumentArchive from "./pages/DocumentArchive";
import ActivityLogs from "./pages/ActivityLogs";
import UserManagement from "./pages/UserManagement";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import PendingApproval from "./pages/PendingApproval";
import ResetPassword from "./pages/ResetPassword";
import Approvals from "./pages/Approvals";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
   <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/upload" element={<UploadDocument />} />
              <Route path="/archive" element={<DocumentArchive />} />
              <Route path="/logs" element={<ActivityLogs />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
   </ThemeProvider>
  </QueryClientProvider>
);

export default App;
