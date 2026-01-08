import { motion } from 'framer-motion'
import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import { Card, CardHeader, CardContent } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

export function TraineeDashboardPage() {
  const { profile } = useAuth()

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
                <p className="text-3xl font-bold text-text">0</p>
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
                <p className="text-3xl font-bold text-text">0%</p>
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
                <ChatBubbleLeftRightIcon className="w-8 h-8 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-text-light">チャットセッション</p>
                <p className="text-3xl font-bold text-text">0</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Assigned curricula placeholder */}
      <Card>
        <CardHeader
          title="割当カリキュラム"
          description="あなたに割り当てられたカリキュラム一覧"
        />
        <CardContent>
          <div className="text-center py-12">
            <BookOpenIcon className="w-16 h-16 text-text-light mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text mb-2">
              カリキュラムがまだ割り当てられていません
            </h3>
            <p className="text-text-light">
              管理者からカリキュラムが割り当てられると、ここに表示されます。
            </p>
          </div>
        </CardContent>
      </Card>

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
