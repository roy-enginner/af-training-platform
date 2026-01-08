import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/hooks/useAuth'
import { Button, Card } from '@/components/ui'

interface AccessDeniedPageProps {
  message?: string
}

export function AccessDeniedPage({ message }: AccessDeniedPageProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-lg text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
              <ExclamationTriangleIcon className="w-8 h-8 text-warning" />
            </div>
          </div>

          <h1 className="text-xl font-bold text-text mb-2">
            アクセスできません
          </h1>

          <p className="text-text-light mb-6">
            {message || 'このサービスへのアクセス権限がありません。'}
          </p>

          <Button onClick={handleSignOut} variant="outline" className="w-full">
            ログアウト
          </Button>
        </Card>

        <p className="text-center text-sm text-text-light mt-6">
          ご不明な点がございましたら、管理者にお問い合わせください。
        </p>
      </motion.div>
    </div>
  )
}
