import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpenIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  CheckCircleIcon,
  PlayCircleIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import { Card, CardContent, Input, Badge, Button } from '@/components/ui'
import { useTraineeCurricula, type AssignedCurriculum } from '@/hooks/useTraineeCurricula'

type FilterStatus = 'all' | 'not_started' | 'in_progress' | 'completed'

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
}

const DIFFICULTY_COLORS: Record<string, 'success' | 'warning' | 'error'> = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'error',
}

const STATUS_LABELS: Record<FilterStatus, string> = {
  all: 'すべて',
  not_started: '未開始',
  in_progress: '学習中',
  completed: '完了',
}

function CurriculumCard({
  curriculum,
  index,
}: {
  curriculum: AssignedCurriculum
  index: number
}) {
  const status = curriculum.progress?.status || 'not_started'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link to={`/trainee/curricula/${curriculum.id}`}>
        <Card hover className="h-full">
          <CardContent>
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={DIFFICULTY_COLORS[curriculum.difficulty_level]}
                  size="sm"
                >
                  {DIFFICULTY_LABELS[curriculum.difficulty_level]}
                </Badge>
                {curriculum.assignment.is_required && (
                  <Badge variant="error" size="sm">必須</Badge>
                )}
              </div>
              {status === 'completed' ? (
                <CheckCircleIcon className="w-6 h-6 text-success flex-shrink-0" />
              ) : status === 'in_progress' ? (
                <PlayCircleIcon className="w-6 h-6 text-warning flex-shrink-0" />
              ) : null}
            </div>

            {/* Title */}
            <h3 className="font-semibold text-text mb-2 line-clamp-2">
              {curriculum.name}
            </h3>

            {/* Description */}
            {curriculum.description && (
              <p className="text-sm text-text-light line-clamp-2 mb-3">
                {curriculum.description}
              </p>
            )}

            {/* Meta */}
            <div className="flex items-center gap-4 text-xs text-text-light mb-4">
              <span className="flex items-center gap-1">
                <ClockIcon className="w-4 h-4" />
                {curriculum.duration_minutes ? `${curriculum.duration_minutes}分` : '-'}
              </span>
              <span className="flex items-center gap-1">
                <BookOpenIcon className="w-4 h-4" />
                {curriculum.chapters.length}チャプター
              </span>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-light">進捗</span>
                <span className="font-medium text-text">
                  {curriculum.progress?.progress_percent || 0}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    status === 'completed'
                      ? 'bg-success'
                      : status === 'in_progress'
                        ? 'bg-warning'
                        : 'bg-gray-300'
                  }`}
                  style={{
                    width: `${curriculum.progress?.progress_percent || 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Due date */}
            {curriculum.assignment.due_date && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-warning">
                  期限: {new Date(curriculum.assignment.due_date).toLocaleDateString('ja-JP')}
                </p>
              </div>
            )}

            {/* Action button */}
            <div className="mt-4">
              <Button
                variant={status === 'completed' ? 'outline' : 'primary'}
                size="sm"
                className="w-full"
              >
                {status === 'completed'
                  ? '復習する'
                  : status === 'in_progress'
                    ? '続きから学習'
                    : '学習を開始'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}

export function TraineeCurriculaPage() {
  const { curricula, stats, isLoading } = useTraineeCurricula()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [showFilters, setShowFilters] = useState(false)

  // Filter curricula
  const filteredCurricula = useMemo(() => {
    return curricula.filter((curriculum) => {
      // Search filter
      const matchesSearch =
        searchQuery === '' ||
        curriculum.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        curriculum.description?.toLowerCase().includes(searchQuery.toLowerCase())

      // Status filter
      const status = curriculum.progress?.status || 'not_started'
      const matchesStatus = filterStatus === 'all' || status === filterStatus

      return matchesSearch && matchesStatus
    })
  }, [curricula, searchQuery, filterStatus])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">カリキュラム一覧</h1>
        <p className="text-text-light mt-1">
          割り当てられたカリキュラム（{stats.totalAssigned}件）
        </p>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-text">{stats.totalAssigned}</p>
            <p className="text-xs text-text-light">全体</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-warning">{stats.inProgress}</p>
            <p className="text-xs text-text-light">学習中</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-success">{stats.completed}</p>
            <p className="text-xs text-text-light">完了</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.overallProgress}%</p>
            <p className="text-xs text-text-light">進捗率</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and filters */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="カリキュラムを検索..."
              leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            leftIcon={<FunnelIcon className="w-5 h-5" />}
            onClick={() => setShowFilters(!showFilters)}
          >
            フィルター
          </Button>
        </div>

        {/* Filter options */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-border"
          >
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_LABELS) as FilterStatus[]).map((status) => (
                <Button
                  key={status}
                  variant={filterStatus === status ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus(status)}
                >
                  {STATUS_LABELS[status]}
                  {status !== 'all' && (
                    <span className="ml-1 text-xs opacity-70">
                      ({status === 'not_started'
                        ? stats.notStarted
                        : status === 'in_progress'
                          ? stats.inProgress
                          : stats.completed})
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </motion.div>
        )}
      </Card>

      {/* Curricula grid */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-light">読み込み中...</p>
        </div>
      ) : filteredCurricula.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <BookOpenIcon className="w-16 h-16 text-text-light mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text mb-2">
              {searchQuery || filterStatus !== 'all'
                ? '該当するカリキュラムがありません'
                : 'カリキュラムがまだ割り当てられていません'}
            </h3>
            <p className="text-text-light">
              {searchQuery || filterStatus !== 'all'
                ? '検索条件を変更してみてください'
                : '管理者からカリキュラムが割り当てられると、ここに表示されます。'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCurricula.map((curriculum, index) => (
            <CurriculumCard
              key={curriculum.id}
              curriculum={curriculum}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  )
}
