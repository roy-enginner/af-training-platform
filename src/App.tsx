import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { TraineeLayout } from '@/components/layout/TraineeLayout'

// Auth Pages
import { LoginPage } from '@/pages/auth/LoginPage'
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'

// Admin Pages
import { AdminDashboardPage } from '@/pages/admin/DashboardPage'
import { UsersPage } from '@/pages/admin/UsersPage'
import { GroupsPage } from '@/pages/admin/GroupsPage'
import { CompaniesPage } from '@/pages/admin/CompaniesPage'
import { DepartmentsPage } from '@/pages/admin/DepartmentsPage'
import { CurriculaPage } from '@/pages/admin/CurriculaPage'
import { CurriculumDetailPage } from '@/pages/admin/CurriculumDetailPage'
import { AttributesPage } from '@/pages/admin/AttributesPage'
import { MaterialsPage } from '@/pages/admin/MaterialsPage'
import { TemplatesPage } from '@/pages/admin/TemplatesPage'
import { SeriesPage } from '@/pages/admin/SeriesPage'
import { FeedbackPage } from '@/pages/admin/FeedbackPage'
import { EscalationPage } from '@/pages/admin/EscalationPage'
import { TokenUsagePage } from '@/pages/admin/TokenUsagePage'

// Trainee Pages
import { TraineeDashboardPage } from '@/pages/trainee/DashboardPage'
import { TraineeCurriculaPage } from '@/pages/trainee/CurriculaPage'
import { CurriculumLearningPage } from '@/pages/trainee/CurriculumLearningPage'

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
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Protected route for password change (no role required) */}
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePasswordPage />
                </ProtectedRoute>
              }
            />

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
              <Route path="companies" element={<CompaniesPage />} />
              <Route path="departments" element={<DepartmentsPage />} />
              <Route path="curricula" element={<CurriculaPage />} />
              <Route path="curricula/:id" element={<CurriculumDetailPage />} />
              <Route path="series" element={<SeriesPage />} />
              <Route path="materials" element={<MaterialsPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="feedback" element={<FeedbackPage />} />
              <Route path="escalation" element={<EscalationPage />} />
              <Route path="token-usage" element={<TokenUsagePage />} />
              <Route path="attributes" element={<AttributesPage />} />
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
              <Route path="curricula" element={<TraineeCurriculaPage />} />
              <Route path="curricula/:id" element={<CurriculumLearningPage />} />
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
