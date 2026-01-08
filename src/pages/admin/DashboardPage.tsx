import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  UsersIcon,
  BuildingOffice2Icon,
  BookOpenIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import { Card, CardHeader, CardContent, SkeletonCard } from '@/components/ui'
import { useDashboardStats } from '@/hooks/useQueries'

const statCards = [
  {
    key: 'totalUsers',
    label: '総ユーザー数',
    icon: UsersIcon,
    color: 'text-primary',
    bgColor: 'bg-primary-light',
  },
  {
    key: 'totalGroups',
    label: '企業グループ数',
    icon: BuildingOffice2Icon,
    color: 'text-secondary',
    bgColor: 'bg-cyan-50',
  },
  {
    key: 'activeTrainees',
    label: '研修生数',
    icon: BookOpenIcon,
    color: 'text-success',
    bgColor: 'bg-green-50',
  },
] as const

type StatKey = (typeof statCards)[number]['key']

export function AdminDashboardPage() {
  const { data: stats, isLoading, isError } = useDashboardStats()

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text">ダッシュボード</h1>
        <p className="text-text-light mt-1">研修プラットフォームの概要</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          // Skeleton loading state
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : isError ? (
          // Error state
          <div className="col-span-3 text-center py-8 text-error">
            データの取得に失敗しました
          </div>
        ) : (
          // Data loaded
          statCards.map((card, index) => (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Card hover>
                <CardContent className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${card.bgColor}`}>
                    <card.icon className={`w-8 h-8 ${card.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-text-light">{card.label}</p>
                    <p className="text-3xl font-bold text-text">
                      {stats?.[card.key as StatKey] ?? 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader title="クイックアクション" description="よく使う機能にすばやくアクセス" />
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickActionButton
              icon={UsersIcon}
              label="ユーザー管理"
              href="/admin/users"
            />
            <QuickActionButton
              icon={BuildingOffice2Icon}
              label="グループ管理"
              href="/admin/groups"
            />
            <QuickActionButton
              icon={BookOpenIcon}
              label="カリキュラム管理"
              href="/admin/curricula"
            />
            <QuickActionButton
              icon={ChartBarIcon}
              label="分析レポート"
              href="/admin/analytics"
            />
          </div>
        </CardContent>
      </Card>

      {/* Recent activity placeholder */}
      <Card>
        <CardHeader title="最近のアクティビティ" />
        <CardContent>
          <p className="text-text-light text-center py-8">
            アクティビティデータは今後のフェーズで実装予定です
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

interface QuickActionButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  href: string
}

function QuickActionButton({ icon: Icon, label, href }: QuickActionButtonProps) {
  return (
    <Link
      to={href}
      className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary-light transition-all duration-200"
    >
      <Icon className="w-6 h-6 text-primary" />
      <span className="font-medium text-text">{label}</span>
    </Link>
  )
}
