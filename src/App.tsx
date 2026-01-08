import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { TraineeLayout } from '@/components/layout/TraineeLayout'

// Auth Pages
import { LoginPage } from '@/pages/auth/LoginPage'
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage'

// Admin Pages
import { AdminDashboardPage } from '@/pages/admin/DashboardPage'
import { UsersPage } from '@/pages/admin/UsersPage'
import { GroupsPage } from '@/pages/admin/GroupsPage'

// Trainee Pages
import { TraineeDashboardPage } from '@/pages/trainee/DashboardPage'

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5分間はキャッシュを使用
      gcTime: 1000 * 60 * 30, // 30分間キャッシュを保持
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="groups" element={<GroupsPage />} />
            </Route>

            {/* Trainee Routes */}
            <Route
              path="/trainee"
              element={
                <ProtectedRoute requiredRole="trainee">
                  <TraineeLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<TraineeDashboardPage />} />
            </Route>

            {/* Default Redirect */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
