import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { EnvelopeIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/hooks/useAuth'
import { Button, Input, Card, Alert } from '@/components/ui'

const forgotPasswordSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
})

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setError(null)
    const { error: resetError } = await resetPassword(data.email)

    if (resetError) {
      setError(`[パスワードリセット/メール送信] パスワードリセットメールの送信に失敗しました。メールアドレスが正しいか確認してください。詳細: ${resetError}`)
      return
    }

    setSuccess(true)
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
            パスワードをリセット
          </h2>

          {success ? (
            <div className="text-center">
              <Alert variant="success" className="mb-6">
                パスワードリセット用のメールを送信しました。メールをご確認ください。
              </Alert>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-primary hover:text-primary-dark transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                ログインに戻る
              </Link>
            </div>
          ) : (
            <>
              <p className="text-text-light text-sm mb-6 text-center">
                登録済みのメールアドレスを入力してください。<br></br>
                パスワードリセット用のリンクをお送りします。
              </p>

              {error && (
                <Alert variant="error" className="mb-6" onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="メールアドレス"
                  type="email"
                  placeholder="email@example.com"
                  leftIcon={<EnvelopeIcon className="w-5 h-5" />}
                  error={errors.email?.message}
                  {...register('email')}
                />

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  isLoading={isSubmitting}
                >
                  リセットメールを送信
                </Button>
              </form>

              <div className="mt-4 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-dark transition-colors"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  ログインに戻る
                </Link>
              </div>
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
