import { Link, useLocation } from 'react-router-dom'
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline'

// パス名から表示名へのマッピング
const pathNameMap: Record<string, string> = {
  admin: '管理画面',
  users: 'ユーザー管理',
  companies: '企業管理',
  departments: '部署管理',
  groups: 'グループ管理',
  curricula: 'カリキュラム管理',
  series: 'シリーズ管理',
  materials: '資料管理',
  templates: 'テンプレート管理',
  feedback: 'フィードバック管理',
  escalation: 'エスカレーション管理',
  'token-usage': 'トークン使用量',
  'knowledge-base': 'ナレッジベース',
  attributes: '属性管理',
  organization: '組織管理',
}

interface BreadcrumbItem {
  label: string
  path: string
  isLast: boolean
}

interface BreadcrumbProps {
  // オプショナルでカスタムアイテムを追加
  customItems?: { label: string; path?: string }[]
  // 動的なパスパラメータの名前解決用
  dynamicLabels?: Record<string, string>
}

export function Breadcrumb({ customItems, dynamicLabels }: BreadcrumbProps) {
  const location = useLocation()
  const pathSegments = location.pathname.split('/').filter(Boolean)

  // パスセグメントからブレッドクラムアイテムを生成
  const items: BreadcrumbItem[] = pathSegments.map((segment, index) => {
    const path = '/' + pathSegments.slice(0, index + 1).join('/')
    const isLast = index === pathSegments.length - 1

    // 動的ラベルがあれば使用（例: グループID → グループ名）
    const label = dynamicLabels?.[segment] || pathNameMap[segment] || segment

    return { label, path, isLast }
  })

  // カスタムアイテムがあれば追加
  if (customItems) {
    customItems.forEach((item, index) => {
      items.push({
        label: item.label,
        path: item.path || '',
        isLast: index === customItems.length - 1,
      })
    })
    // 最後のアイテムを更新
    if (items.length > 0) {
      items.forEach((item, idx) => {
        item.isLast = idx === items.length - 1
      })
    }
  }

  // 管理画面以外では表示しない
  if (!location.pathname.startsWith('/admin')) {
    return null
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-text-light mb-4">
      <Link
        to="/admin"
        className="flex items-center gap-1 hover:text-primary transition-colors"
      >
        <HomeIcon className="w-4 h-4" />
      </Link>

      {items.map((item, index) => (
        <div key={item.path || index} className="flex items-center gap-1">
          <ChevronRightIcon className="w-3 h-3 text-gray-400" />
          {item.isLast ? (
            <span className="text-text font-medium">{item.label}</span>
          ) : (
            <Link
              to={item.path}
              className="hover:text-primary transition-colors"
            >
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  )
}
