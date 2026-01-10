import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HomeIcon,
  UsersIcon,
  BuildingOffice2Icon,
  BuildingOfficeIcon,
  RectangleStackIcon,
  BookOpenIcon,
  QueueListIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  TagIcon,
  ChartBarIcon,
  XMarkIcon,
  Bars3BottomLeftIcon,
  BellAlertIcon,
  CurrencyYenIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/hooks/useAuth'
import { hasPermission } from '@/types/database'

interface SidebarProps {
  isOpen: boolean
  isCollapsed: boolean
  onClose: () => void
  onToggleCollapse: () => void
}

export function Sidebar({ isOpen, isCollapsed, onClose, onToggleCollapse }: SidebarProps) {
  const { role } = useAuth()

  // Build menu items based on role permissions
  const menuItems = [
    { path: '/admin', icon: HomeIcon, label: 'ダッシュボード', end: true },
    { path: '/admin/users', icon: UsersIcon, label: 'ユーザー管理' },
    // Companies page only for super_admin
    ...(role && hasPermission(role, 'canManageCompanies')
      ? [{ path: '/admin/companies', icon: BuildingOffice2Icon, label: '企業管理' }]
      : []),
    // Departments page only for super_admin
    ...(role && hasPermission(role, 'canManageDepartments')
      ? [{ path: '/admin/departments', icon: BuildingOfficeIcon, label: '部署管理' }]
      : []),
    // Groups page only for super_admin
    ...(role && hasPermission(role, 'canManageGroups')
      ? [{ path: '/admin/groups', icon: RectangleStackIcon, label: 'グループ管理' }]
      : []),
    // Curriculum page only for super_admin
    ...(role && hasPermission(role, 'canManageCurriculum')
      ? [{ path: '/admin/curricula', icon: BookOpenIcon, label: 'カリキュラム管理' }]
      : []),
    // Series page only for super_admin
    ...(role && hasPermission(role, 'canManageCurriculum')
      ? [{ path: '/admin/series', icon: QueueListIcon, label: 'シリーズ管理' }]
      : []),
    // Materials page only for super_admin
    ...(role && hasPermission(role, 'canManageCurriculum')
      ? [{ path: '/admin/materials', icon: DocumentDuplicateIcon, label: '資料管理' }]
      : []),
    // Templates page only for super_admin
    ...(role && hasPermission(role, 'canManageCurriculum')
      ? [{ path: '/admin/templates', icon: DocumentTextIcon, label: 'テンプレート管理' }]
      : []),
    // Feedback page only for super_admin
    ...(role && hasPermission(role, 'canManageCurriculum')
      ? [{ path: '/admin/feedback', icon: ChatBubbleLeftRightIcon, label: 'フィードバック管理' }]
      : []),
    // Escalation page only for super_admin
    ...(role && hasPermission(role, 'canManageCompanies')
      ? [{ path: '/admin/escalation', icon: BellAlertIcon, label: 'エスカレーション管理' }]
      : []),
    // Token usage page only for super_admin
    ...(role && hasPermission(role, 'canManageCompanies')
      ? [{ path: '/admin/token-usage', icon: CurrencyYenIcon, label: 'トークン使用量' }]
      : []),
    // Attributes page only for super_admin
    ...(role && hasPermission(role, 'canManageAttributes')
      ? [{ path: '/admin/attributes', icon: TagIcon, label: '属性管理' }]
      : []),
    // Analytics only for super_admin
    ...(role && hasPermission(role, 'canViewAllReports')
      ? [{ path: '/admin/analytics', icon: ChartBarIcon, label: '分析・レポート' }]
      : []),
  ]
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
        {/* Header with logo and collapse button */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          <div className={`flex items-center gap-2 ${isCollapsed ? 'md:justify-center md:w-full' : ''}`}>
            <img src="/favicon.svg" alt="AF" className="w-8 h-8 flex-shrink-0" />
            <span className={`font-semibold text-text whitespace-nowrap ${isCollapsed ? 'md:hidden' : ''}`}>
              管理画面
            </span>
          </div>

          {/* Mobile: Close button / Desktop: Collapse button */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors md:hidden"
          >
            <XMarkIcon className="w-5 h-5 text-text-light" />
          </button>
          <button
            onClick={onToggleCollapse}
            className={`hidden md:flex p-2 rounded-lg hover:bg-gray-100 transition-colors ${isCollapsed ? 'md:hidden' : ''}`}
            title="メニューを折りたたむ"
          >
            <Bars3BottomLeftIcon className="w-5 h-5 text-text-light" />
          </button>
        </div>

        {/* Expand button when collapsed (inside header area) */}
        {isCollapsed && (
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex w-full justify-center py-3 hover:bg-gray-50 transition-colors border-b border-border"
            title="メニューを展開"
          >
            <Bars3BottomLeftIcon className="w-5 h-5 text-text-light" />
          </button>
        )}

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
