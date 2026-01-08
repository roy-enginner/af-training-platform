import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types/database'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'trainee' // 'admin' = super_admin or group_admin
}

// Check if role is an admin role (super_admin or group_admin)
function isAdminRole(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'group_admin'
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, role, mustChangePassword } = useAuth()
  const location = useLocation()

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-light">読み込み中...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Force password change if required
  if (mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  // Check role if required
  if (requiredRole) {
    const hasAccess = requiredRole === 'admin' ? isAdminRole(role) : role === 'trainee'

    if (!hasAccess) {
      // Redirect to appropriate dashboard based on role
      if (isAdminRole(role)) {
        return <Navigate to="/admin" replace />
      }
      if (role === 'trainee') {
        return <Navigate to="/trainee" replace />
      }
      // If no role, redirect to login
      return <Navigate to="/login" replace />
    }
  }

  return <>{children}</>
}
