import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeftIcon,
  BookOpenIcon,
  ClockIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListBulletIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid'
import { Card, CardContent, Badge, Button, Alert } from '@/components/ui'
import { useTraineeCurriculum } from '@/hooks/useTraineeCurricula'
import type { Chapter } from '@/types/database'

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

function ChapterContent({ chapter }: { chapter: Chapter }) {
  return (
    <motion.div
      key={chapter.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Chapter header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-text-light mb-2">
          <ClockIcon className="w-4 h-4" />
          <span>目安: {chapter.estimated_minutes}分</span>
        </div>
        <h2 className="text-2xl font-bold text-text">{chapter.title}</h2>
      </div>

      {/* Chapter content */}
      {chapter.content && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <DocumentTextIcon className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-text">学習内容</h3>
            </div>
            <div className="prose prose-slate max-w-none">
              {chapter.content.split('\n').map((paragraph, i) => (
                <p key={i} className="text-text-light mb-3 last:mb-0">
                  {paragraph}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task description */}
      {chapter.task_description && (
        <Card className="border-primary">
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <ClipboardDocumentListIcon className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-text">実践課題</h3>
            </div>
            <div className="bg-primary-light rounded-lg p-4">
              {chapter.task_description.split('\n').map((line, i) => (
                <p key={i} className="text-text mb-2 last:mb-0">
                  {line}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!chapter.content && !chapter.task_description && (
        <Card>
          <CardContent className="text-center py-12">
            <BookOpenIcon className="w-16 h-16 text-text-light mx-auto mb-4" />
            <p className="text-text-light">
              このチャプターのコンテンツはまだ準備中です。
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}

export function CurriculumLearningPage() {
  const { id } = useParams<{ id: string }>()
  const { curriculum, isLoading, error, startCurriculum, updateProgress } =
    useTraineeCurriculum(id || '')
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [showChapterList, setShowChapterList] = useState(false)

  // Start curriculum on first load if not started
  useEffect(() => {
    if (curriculum && !curriculum.progress) {
      startCurriculum()
    }
  }, [curriculum, startCurriculum])

  // Restore last viewed chapter based on progress
  useEffect(() => {
    if (curriculum?.progress && curriculum.chapters.length > 0) {
      const progressPercent = curriculum.progress.progress_percent
      const estimatedChapter = Math.floor(
        (progressPercent / 100) * curriculum.chapters.length
      )
      if (estimatedChapter > 0 && estimatedChapter < curriculum.chapters.length) {
        setCurrentChapterIndex(estimatedChapter)
      }
    }
  }, [curriculum])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-light">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error || !curriculum) {
    return (
      <div className="space-y-6">
        <Link to="/trainee/curricula">
          <Button variant="ghost" leftIcon={<ArrowLeftIcon className="w-4 h-4" />}>
            カリキュラム一覧に戻る
          </Button>
        </Link>
        <Alert variant="error">{error || 'カリキュラムが見つかりません'}</Alert>
      </div>
    )
  }

  const chapters = curriculum.chapters
  const currentChapter = chapters[currentChapterIndex]
  const isLastChapter = currentChapterIndex === chapters.length - 1
  const isFirstChapter = currentChapterIndex === 0
  const completedChapters = curriculum.completedChapters

  const handlePrevious = () => {
    if (!isFirstChapter) {
      setCurrentChapterIndex(currentChapterIndex - 1)
    }
  }

  const handleNext = () => {
    if (!isLastChapter) {
      // Update progress when moving to next chapter
      updateProgress(currentChapterIndex, chapters.length)
      setCurrentChapterIndex(currentChapterIndex + 1)
    }
  }

  const handleComplete = () => {
    // Mark as 100% complete
    updateProgress(chapters.length - 1, chapters.length)
  }

  const handleChapterSelect = (index: number) => {
    setCurrentChapterIndex(index)
    setShowChapterList(false)
  }

  return (
    <div className="space-y-6">
      {/* Back button and curriculum info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/trainee/curricula">
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeftIcon className="w-4 h-4" />}>
              一覧に戻る
            </Button>
          </Link>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Badge variant={DIFFICULTY_COLORS[curriculum.difficulty_level]} size="sm">
              {DIFFICULTY_LABELS[curriculum.difficulty_level]}
            </Badge>
            {curriculum.assignment.is_required && (
              <Badge variant="error" size="sm">必須</Badge>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<ListBulletIcon className="w-4 h-4" />}
          onClick={() => setShowChapterList(!showChapterList)}
        >
          チャプター一覧
        </Button>
      </div>

      {/* Curriculum title and progress */}
      <Card>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-text">{curriculum.name}</h1>
              {curriculum.description && (
                <p className="text-sm text-text-light mt-1 line-clamp-2">
                  {curriculum.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-text-light">進捗</p>
                <p className="text-2xl font-bold text-primary">
                  {curriculum.progress?.progress_percent || 0}%
                </p>
              </div>
              <div className="w-32">
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${curriculum.progress?.progress_percent || 0}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-text-light text-center mt-1">
                  {completedChapters}/{chapters.length} チャプター
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-6">
        {/* Chapter list sidebar (desktop) */}
        <AnimatePresence>
          {showChapterList && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 300 }}
              exit={{ opacity: 0, width: 0 }}
              className="hidden md:block flex-shrink-0 overflow-hidden"
            >
              <Card className="sticky top-6">
                <CardContent>
                  <h3 className="font-semibold text-text mb-4">チャプター一覧</h3>
                  <div className="space-y-2">
                    {chapters.map((chapter, index) => {
                      const isCompleted = index < completedChapters
                      const isCurrent = index === currentChapterIndex

                      return (
                        <button
                          key={chapter.id}
                          onClick={() => handleChapterSelect(index)}
                          className={`w-full text-left p-3 rounded-lg transition-colors ${
                            isCurrent
                              ? 'bg-primary text-white'
                              : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {isCompleted ? (
                                <CheckCircleSolidIcon
                                  className={`w-5 h-5 ${
                                    isCurrent ? 'text-white' : 'text-success'
                                  }`}
                                />
                              ) : (
                                <div
                                  className={`w-5 h-5 rounded-full border-2 ${
                                    isCurrent
                                      ? 'border-white'
                                      : 'border-gray-300'
                                  }`}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium truncate ${
                                  isCurrent ? 'text-white' : 'text-text'
                                }`}
                              >
                                {index + 1}. {chapter.title}
                              </p>
                              <p
                                className={`text-xs ${
                                  isCurrent ? 'text-white/70' : 'text-text-light'
                                }`}
                              >
                                {chapter.estimated_minutes}分
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Chapter navigation */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm text-text-light">
              チャプター {currentChapterIndex + 1} / {chapters.length}
            </span>
            <div className="flex items-center gap-2">
              {chapters.map((_, index) => (
                <button
                  key={index}
                  onClick={() => handleChapterSelect(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentChapterIndex
                      ? 'bg-primary'
                      : index < completedChapters
                        ? 'bg-success'
                        : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Chapter content */}
          {currentChapter ? (
            <AnimatePresence mode="wait">
              <ChapterContent chapter={currentChapter} />
            </AnimatePresence>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <BookOpenIcon className="w-16 h-16 text-text-light mx-auto mb-4" />
                <p className="text-text-light">チャプターが見つかりません</p>
              </CardContent>
            </Card>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <Button
              variant="outline"
              leftIcon={<ChevronLeftIcon className="w-4 h-4" />}
              onClick={handlePrevious}
              disabled={isFirstChapter}
            >
              前のチャプター
            </Button>

            {isLastChapter ? (
              <Button
                leftIcon={<CheckCircleIcon className="w-5 h-5" />}
                onClick={handleComplete}
                disabled={curriculum.progress?.status === 'completed'}
              >
                {curriculum.progress?.status === 'completed'
                  ? '完了済み'
                  : 'カリキュラムを完了'}
              </Button>
            ) : (
              <Button
                rightIcon={<ChevronRightIcon className="w-4 h-4" />}
                onClick={handleNext}
              >
                次のチャプター
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile chapter list modal */}
      <AnimatePresence>
        {showChapterList && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 md:hidden"
            onClick={() => setShowChapterList(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[70vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-border sticky top-0 bg-white">
                <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
                <h3 className="font-semibold text-text text-center">チャプター一覧</h3>
              </div>
              <div className="p-4 space-y-2">
                {chapters.map((chapter, index) => {
                  const isCompleted = index < completedChapters
                  const isCurrent = index === currentChapterIndex

                  return (
                    <button
                      key={chapter.id}
                      onClick={() => handleChapterSelect(index)}
                      className={`w-full text-left p-4 rounded-lg transition-colors ${
                        isCurrent
                          ? 'bg-primary text-white'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isCompleted ? (
                          <CheckCircleSolidIcon
                            className={`w-6 h-6 ${
                              isCurrent ? 'text-white' : 'text-success'
                            }`}
                          />
                        ) : (
                          <div
                            className={`w-6 h-6 rounded-full border-2 ${
                              isCurrent ? 'border-white' : 'border-gray-300'
                            }`}
                          />
                        )}
                        <div className="flex-1">
                          <p
                            className={`font-medium ${
                              isCurrent ? 'text-white' : 'text-text'
                            }`}
                          >
                            {index + 1}. {chapter.title}
                          </p>
                          <p
                            className={`text-sm ${
                              isCurrent ? 'text-white/70' : 'text-text-light'
                            }`}
                          >
                            {chapter.estimated_minutes}分
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
