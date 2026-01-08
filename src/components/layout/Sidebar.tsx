import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HomeIcon,
  UsersIcon,
  BuildingOffice2Icon,
  BookOpenIcon,
  ChartBarIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'

interface SidebarProps {
  isOpen: boolean
  isCollapsed: boolean
  onClose: () => void
  onToggleCollapse: () => void
}

const menuItems = [
  { path: '/admin', icon: HomeIcon, label: 'ダッシュボード', end: true },
  { path: '/admin/users', icon: UsersIcon, label: 'ユーザー管理' },
  { path: '/admin/groups', icon: BuildingOffice2Icon, label: 'グループ管理' },
  { path: '/admin/curricula', icon: BookOpenIcon, label: 'カリキュラム管理' },
  { path: '/admin/analytics', icon: ChartBarIcon, label: '分析・レポート' },
]

export function Sidebar({ isOpen, isCollapsed, onClose, onToggleCollapse }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full bg-white border-r border-border
          transform transition-all duration-300 ease-in-out
          md:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isCollapsed ? 'md:w-16' : 'w-64'}
        `}
      >
        {/* Header with logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          <div className={`flex items-center gap-2 ${isCollapsed ? 'md:justify-center md:w-full' : ''}`}>
            <img src="/favicon.svg" alt="AF" className="w-8 h-8 flex-shrink-0" />
            <span className={`font-semibold text-text whitespace-nowrap ${isCollapsed ? 'md:hidden' : ''}`}>
              管理画面
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors md:hidden"
          >
            <XMarkIcon className="w-6 h-6 text-text" />
          </button>
        </div>

        {/* Navigation */}
        <nav className={`p-4 space-y-1 ${isCollapsed ? 'md:p-2' : ''}`}>
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={() => onClose()}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg
                font-medium transition-colors
                ${isCollapsed ? 'md:justify-center md:px-2' : ''}
                ${
                  isActive
                    ? 'bg-primary-light text-primary'
                    : 'text-text-light hover:bg-gray-50 hover:text-text'
                }
              `}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className={isCollapsed ? 'md:hidden' : ''}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Collapse toggle button (desktop only) */}
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex absolute bottom-16 left-0 right-0 mx-auto w-8 h-8 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          title={isCollapsed ? 'メニューを展開' : 'メニューを折りたたむ'}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="w-4 h-4 text-text" />
          ) : (
            <ChevronLeftIcon className="w-4 h-4 text-text" />
          )}
        </button>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <p className={`text-xs text-text-light text-center ${isCollapsed ? 'md:hidden' : ''}`}>
            &copy; {new Date().getFullYear()} Assist Frontier
          </p>
        </div>
      </aside>
    </>
  )
}
