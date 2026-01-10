import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { LockClosedIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/hooks/useAuth'
import { Button, Input, Card, Alert } from '@/components/ui'

// NIST SP 800-63B準拠のパスワードポリシー
const passwordSchema = z
  .object({
    newPassword: z
      .string()
      .min(12, 'パスワードは12文字以上で入力してください')
      .regex(
        /^(?!.*(.)\1{2}).*$/,
        '同じ文字が3回以上連続することはできません'
      )
      .regex(
        /^(?!.*(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)).*$/i,
        '連続した文字・数字は使用できません'
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  })

type PasswordFormData = z.infer<typeof passwordSchema>

export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { updatePassword, clearMustChangePassword, isAuthenticated, mustChangePassword } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  const onSubmit = async (data: PasswordFormData) => {
    setError(null)
    try {
      const { error: updateError } = await updatePassword(data.newPassword)

      if (updateError) {
        setError(updateError)
        return
      }

      // Clear must_change_password flag
      const { error: clearError } = await clearMustChangePassword()
      if (clearError) {
        console.error('Failed to clear must_change_password:', clearError)
      }

      setSuccess(true)

      // Clear session and redirect to login after delay
      setTimeout(() => {
        // Clear all Supabase auth data from localStorage
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-')) {
            localStorage.removeItem(key)
          }
        })
        // Force full page reload to login
        window.location.replace('/login')
      }, 1500)
    } catch (err) {
      console.error('Password update error:', err)
      const detail = err instanceof Error ? err.message : '不明なエラー'
      setError(`[パスワード変更] パスワードの変更に失敗しました: ${detail}`)
    }
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
          <div className="inline-flex items-center justify-center w-16 h-16 gradient-hero rounded-2xl mb-4">
            <span className="text-2xl font-bold text-white">AF</span>
          </div>
          <h1 className="text-2xl font-bold text-text">
            {mustChangePassword ? '初回パスワード設定' : 'パスワード変更'}
          </h1>
          <p className="text-text-light mt-2">
            {mustChangePassword ? (
              <>
                セキュリティのため、
                <br />
                初回ログイン時にパスワードの変更が必要です
              </>
            ) : (
              '新しいパスワードを設定してください'
            )}
          </p>
        </div>

        <Card className="shadow-lg">
          {success ? (
            <Alert variant="success">
              パスワードを変更しました。<br></br>新しいパスワードでログインしてください。
            </Alert>
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
                  placeholder="12文字以上で入力"
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
                  error={errors.newPassword?.message}
                  helperText="12文字以上、連続した文字・数字は使用不可"
                  {...register('newPassword')}
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
                  パスワードを変更
                </Button>
              </form>

              {isAuthenticated && !mustChangePassword && (
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="w-full mt-4 text-center text-sm text-text-light hover:text-primary transition-colors"
                >
                  キャンセル
                </button>
              )}
            </>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
