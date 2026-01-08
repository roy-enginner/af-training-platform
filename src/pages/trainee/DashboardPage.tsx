import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpenIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  PlayIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { Card, CardHeader, CardContent, Badge, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useTraineeCurricula } from '@/hooks/useTraineeCurricula'

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

export function TraineeDashboardPage() {
  const { profile } = useAuth()
  const { curricula, stats, isLoading } = useTraineeCurricula()

  // Get curricula to show on dashboard (in progress first, then not started)
  const inProgressCurricula = curricula.filter(
    (c) => c.progress?.status === 'in_progress'
  )
  const notStartedCurricula = curricula.filter(
    (c) => !c.progress || c.progress.status === 'not_started'
  )
  const recentCurricula = [...inProgressCurricula, ...notStartedCurricula].slice(0, 3)

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="gradient-hero text-white">
          <CardContent>
            <h1 className="text-2xl font-bold">
              ようこそ、{profile?.name || 'ゲスト'}さん
            </h1>
            <p className="mt-2 text-white/90">
              AI研修プラットフォームへようこそ。カリキュラムを通じてAIの活用方法を学びましょう。
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card hover>
            <CardContent className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary-light">
                <BookOpenIcon className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-sm text-text-light">割当カリキュラム</p>
                <p className="text-3xl font-bold text-text">
                  {isLoading ? '-' : stats.totalAssigned}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card hover>
            <CardContent className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-50">
                <ChartBarIcon className="w-8 h-8 text-success" />
              </div>
              <div>
                <p className="text-sm text-text-light">学習進捗</p>
                <p className="text-3xl font-bold text-text">
                  {isLoading ? '-' : `${stats.overallProgress}%`}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card hover>
            <CardContent className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-cyan-50">
                <CheckCircleIcon className="w-8 h-8 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-text-light">完了済み</p>
                <p className="text-3xl font-bold text-text">
                  {isLoading ? '-' : stats.completed}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Assigned curricula */}
      <Card>
        <CardHeader
          title="割当カリキュラム"
          description="あなたに割り当てられたカリキュラム一覧"
          action={
            curricula.length > 0 ? (
              <Link to="/trainee/curricula">
                <Button variant="ghost" size="sm" rightIcon={<ArrowRightIcon className="w-4 h-4" />}>
                  すべて表示
                </Button>
              </Link>
            ) : undefined
          }
        />
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-text-light">読み込み中...</p>
            </div>
          ) : recentCurricula.length === 0 ? (
            <div className="text-center py-12">
              <BookOpenIcon className="w-16 h-16 text-text-light mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text mb-2">
                カリキュラムがまだ割り当てられていません
              </h3>
              <p className="text-text-light">
                管理者からカリキュラムが割り当てられると、ここに表示されます。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentCurricula.map((curriculum, index) => (
                <motion.div
                  key={curriculum.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  <Link to={`/trainee/curricula/${curriculum.id}`}>
                    <div className="p-4 border border-border rounded-xl hover:border-primary hover:shadow-md transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-text truncate">
                              {curriculum.name}
                            </h3>
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
                          {curriculum.description && (
                            <p className="text-sm text-text-light line-clamp-2 mb-2">
                              {curriculum.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-text-light">
                            <span className="flex items-center gap-1">
                              <ClockIcon className="w-4 h-4" />
                              {curriculum.duration_minutes
                                ? `${curriculum.duration_minutes}分`
                                : '-'}
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpenIcon className="w-4 h-4" />
                              {curriculum.chapters.length}チャプター
                            </span>
                            {curriculum.assignment.due_date && (
                              <span className="text-warning">
                                期限: {new Date(curriculum.assignment.due_date).toLocaleDateString('ja-JP')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {curriculum.progress?.status === 'completed' ? (
                            <Badge variant="success">完了</Badge>
                          ) : curriculum.progress?.status === 'in_progress' ? (
                            <Badge variant="warning">学習中</Badge>
                          ) : (
                            <Badge variant="default">未開始</Badge>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{
                                  width: `${curriculum.progress?.progress_percent || 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-text-light min-w-[3ch]">
                              {curriculum.progress?.progress_percent || 0}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Continue learning (if there's an in-progress curriculum) */}
      {inProgressCurricula.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <Card className="border-primary">
            <CardContent className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary-light">
                  <PlayIcon className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-text-light">学習を続ける</p>
                  <p className="font-semibold text-text">
                    {inProgressCurricula[0].name}
                  </p>
                  <p className="text-sm text-text-light">
                    進捗: {inProgressCurricula[0].progress?.progress_percent || 0}% 完了
                  </p>
                </div>
              </div>
              <Link to={`/trainee/curricula/${inProgressCurricula[0].id}`}>
                <Button rightIcon={<ArrowRightIcon className="w-4 h-4" />}>
                  続きから学習
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Info card */}
      <Card>
        <CardHeader title="研修について" />
        <CardContent>
          <div className="space-y-4 text-text-light">
            <p>
              このプラットフォームでは、AI（ChatGPT、Claude、Gemini）を活用した
              ハンズオン形式の研修を受けることができます。
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>カリキュラムに沿って学習を進めましょう</li>
              <li>各チャプターには実践的な課題があります</li>
              <li>AIチャット機能で質問しながら学べます</li>
              <li>進捗状況はいつでも確認できます</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
