import { Outlet } from 'react-router-dom'
import { Header } from './Header'

export function TraineeLayout() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <Header />

      {/* Page content */}
      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}
