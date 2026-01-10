import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { LockClosedIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/hooks/useAuth'
import { Button, Input, Card, Alert } from '@/components/ui'

// セッション確立のタイムアウト（ms）
const SESSION_TIMEOUT_MS = 5000

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'パスワードが一致しません',
  path: ['confirmPassword'],
})

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { updatePassword, session, isLoading, isRecoveryMode } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  // パスワードリセットリンクからのセッション確立を待機
  useEffect(() => {
    // ロード中は何もしない
    if (isLoading) return

    // リカバリーモードまたはセッションがあればOK
    if (isRecoveryMode || session) return

    // セッションがない場合、無効なリンクとしてログインページへ
    // 少し待ってからリダイレクト（セッション確立の余裕を持たせる）
    const timer = setTimeout(() => {
      if (!session && !isRecoveryMode) {
        navigate('/login')
      }
    }, SESSION_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [session, isLoading, isRecoveryMode, navigate])

  const onSubmit = async (data: ResetPasswordFormData) => {
    setError(null)
    const { error: updateError } = await updatePassword(data.password)

    if (updateError) {
      setError('パスワードの更新に失敗しました')
      return
    }

    setSuccess(true)
    // Redirect to login after success
    setTimeout(() => {
      navigate('/login')
    }, 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="AF" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text">AI研修プラットフォーム</h1>
          <p className="text-text-light mt-2">Assist Frontier</p>
        </div>

        <Card className="shadow-lg">
          <h2 className="text-xl font-semibold text-text text-center mb-6">
            新しいパスワードを設定
          </h2>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-text-light">認証情報を確認中...</p>
            </div>
          ) : success ? (
            <div className="text-center">
              <Alert variant="success" className="mb-6">
                パスワードを更新しました。ログインページにリダイレクトします...
              </Alert>
            </div>
          ) : (
            <>
              {error && (
                <Alert variant="error" className="mb-6" onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="新しいパスワード"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="8文字以上"
                  leftIcon={<LockClosedIcon className="w-5 h-5" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="focus:outline-none"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  }
                  error={errors.password?.message}
                  {...register('password')}
                />

                <Input
                  label="パスワード確認"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="もう一度入力"
                  leftIcon={<LockClosedIcon className="w-5 h-5" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="focus:outline-none"
                    >
                      {showConfirmPassword ? (
                        <EyeSlashIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  }
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  isLoading={isSubmitting}
                >
                  パスワードを更新
                </Button>
              </form>
            </>
          )}
        </Card>

        <p className="text-center text-sm text-text-light mt-6">
          &copy; {new Date().getFullYear()} Assist Frontier. All rights reserved.
        </p>
      </motion.div>
    </div>
  )
}
