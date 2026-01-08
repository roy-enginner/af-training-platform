import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: ReactNode
  onClose?: () => void
  className?: string
}

const variantConfig: Record<AlertVariant, { icon: typeof InformationCircleIcon; styles: string }> = {
  info: {
    icon: InformationCircleIcon,
    styles: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  success: {
    icon: CheckCircleIcon,
    styles: 'bg-green-50 border-success/20 text-green-800',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    styles: 'bg-amber-50 border-warning/20 text-amber-800',
  },
  error: {
    icon: XCircleIcon,
    styles: 'bg-red-50 border-error/20 text-red-800',
  },
}

export function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  className = '',
}: AlertProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`
          flex items-start gap-3 p-4
          border rounded-lg
          ${config.styles}
          ${className}
        `}
      >
        <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          {title && <h4 className="font-semibold mb-1">{title}</h4>}
          <div className="text-sm">{children}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-black/5 transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
