import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  KeyIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/hooks/useAuth'

interface HeaderProps {
  onMenuClick?: () => void
  showMenuButton?: boolean
}

export function Header({ onMenuClick, showMenuButton = false }: HeaderProps) {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border">
      <div className="flex items-center justify-between h-16 px-4 md:px-6">
        {/* Left side */}
        <div className="flex items-center gap-4">
          {showMenuButton && (
            <button
              onClick={onMenuClick}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors md:hidden"
            >
              <Bars3Icon className="w-6 h-6 text-text" />
            </button>
          )}
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="AF" className="w-8 h-8" />
            <span className="font-semibold text-text hidden sm:inline">
              AI研修プラットフォーム
            </span>
          </Link>
        </div>

        {/* Right side - User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <UserCircleIcon className="w-8 h-8 text-text-light" />
            <span className="text-sm font-medium text-text hidden sm:inline">
              {profile?.name || 'ユーザー'}
            </span>
          </button>

          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-border shadow-lg py-2"
              >
                {/* User info */}
                <div className="px-4 py-2 border-b border-border">
                  <p className="font-medium text-text">{profile?.name}</p>
                  <p className="text-sm text-text-light">
                    {profile?.role === 'super_admin'
                      ? 'スーパー管理者'
                      : profile?.role === 'group_admin'
                      ? 'グループ管理者'
                      : '研修生'}
                  </p>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false)
                      navigate('/change-password')
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-text hover:bg-gray-50 transition-colors"
                  >
                    <KeyIcon className="w-5 h-5 text-text-light" />
                    パスワード変更
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-error hover:bg-red-50 transition-colors"
                  >
                    <ArrowRightOnRectangleIcon className="w-5 h-5" />
                    ログアウト
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
