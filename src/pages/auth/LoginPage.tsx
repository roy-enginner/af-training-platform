import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/hooks/useAuth'
import { Button, Input, Card, Alert } from '@/components/ui'

const loginSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(1, 'パスワードを入力してください'),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, isAuthenticated, role, mustChangePassword } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Check if role is an admin role
  const isAdminRole = role === 'super_admin' || role === 'group_admin'

  // Redirect if already authenticated and role is loaded
  useEffect(() => {
    if (isAuthenticated && role) {
      // Redirect to password change if required
      if (mustChangePassword) {
        navigate('/change-password', { replace: true })
        return
      }

      const from = (location.state as { from?: { pathname: string } })?.from?.pathname
      if (from) {
        navigate(from, { replace: true })
      } else if (isAdminRole) {
        navigate('/admin', { replace: true })
      } else {
        navigate('/trainee', { replace: true })
      }
    }
  }, [isAuthenticated, role, isAdminRole, mustChangePassword, navigate, location.state])

  const onSubmit = async (data: LoginFormData) => {
    setError(null)
    const { error: signInError, role: userRole, mustChangePassword: needsPasswordChange } = await signIn(data.email, data.password)

    if (signInError) {
      setError('メールアドレスまたはパスワードが正しくありません')
      return
    }

    // Redirect to password change if required
    if (needsPasswordChange) {
      navigate('/change-password', { replace: true })
      return
    }

    // Redirect based on role
    const isUserAdminRole = userRole === 'super_admin' || userRole === 'group_admin'
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname
    if (from) {
      navigate(from, { replace: true })
    } else if (isUserAdminRole) {
      navigate('/admin', { replace: true })
    } else {
      navigate('/trainee', { replace: true })
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
          <img src="/favicon.svg" alt="AF" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text">AI研修プラットフォーム</h1>
          <p className="text-text-light mt-2">Assist Frontier</p>
        </div>

        <Card className="shadow-lg">
          <h2 className="text-xl font-semibold text-text text-center mb-6">ログイン</h2>

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

            <Input
              label="パスワード"
              type={showPassword ? 'text' : 'password'}
              placeholder="パスワードを入力"
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

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isSubmitting}
            >
              ログイン
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link
              to="/forgot-password"
              className="text-sm text-primary hover:text-primary-dark transition-colors"
            >
              パスワードをお忘れですか？
            </Link>
          </div>
        </Card>

        <p className="text-center text-sm text-text-light mt-6">
          &copy; {new Date().getFullYear()} Assist Frontier. All rights reserved.
        </p>
      </motion.div>
    </div>
  )
}
