import { useState } from 'react'
import { CheckIcon } from '@heroicons/react/24/outline'
import { Button, ModalFooter } from '@/components/ui'
import { UserTypeStep } from './wizard/UserTypeStep'
import { OrganizationStep } from './wizard/OrganizationStep'
import { UserInfoStep } from './wizard/UserInfoStep'
import type { Company, Department, Group, UserRole } from '@/types/database'

export interface UserWizardSubmitData {
  name: string
  email: string
  role: UserRole
  companyId: string | null
  departmentId: string | null
  groupId: string | null
  isIndividual: boolean
  startDate: string | null
  endDate: string | null
  reviewPeriodDays: number
}

interface UserWizardProps {
  companies: Company[]
  departments: Department[]
  groups: Group[]
  currentUserRole: UserRole | null
  onSubmit: (data: UserWizardSubmitData) => Promise<void>
  onCancel: () => void
}

type WizardStep = 'type' | 'organization' | 'info'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'type', label: 'タイプ選択' },
  { key: 'organization', label: '所属選択' },
  { key: 'info', label: '基本情報' },
]

export function UserWizard({
  companies,
  departments,
  groups,
  currentUserRole,
  onSubmit,
  onCancel,
}: UserWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('type')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})

  // ウィザードデータ
  const [isIndividual, setIsIndividual] = useState(false)
  const [organizationData, setOrganizationData] = useState({
    companyId: null as string | null,
    departmentId: null as string | null,
    groupId: null as string | null,
    startDate: '',
    endDate: '',
    reviewPeriodDays: 14,
  })
  const [userInfoData, setUserInfoData] = useState({
    name: '',
    email: '',
    role: 'trainee' as UserRole,
  })

  // ステップのインデックス
  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep)

  // 次のステップへ進めるか
  const canProceed = () => {
    switch (currentStep) {
      case 'type':
        return true
      case 'organization':
        // 通常ユーザーはグループ必須
        if (!isIndividual && !organizationData.groupId) return false
        return true
      case 'info':
        return userInfoData.name.trim() !== '' && userInfoData.email.trim() !== ''
      default:
        return false
    }
  }

  // バリデーション
  const validate = (): boolean => {
    const newErrors: { name?: string; email?: string } = {}

    if (!userInfoData.name.trim()) {
      newErrors.name = '名前を入力してください'
    }

    if (!userInfoData.email.trim()) {
      newErrors.email = 'メールアドレスを入力してください'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userInfoData.email)) {
      newErrors.email = '有効なメールアドレスを入力してください'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // 次へ
  const handleNext = () => {
    if (currentStep === 'type') {
      setCurrentStep('organization')
    } else if (currentStep === 'organization') {
      setCurrentStep('info')
    }
  }

  // 戻る
  const handleBack = () => {
    if (currentStep === 'info') {
      setCurrentStep('organization')
    } else if (currentStep === 'organization') {
      setCurrentStep('type')
    }
  }

  // 送信
  const handleSubmit = async () => {
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        name: userInfoData.name,
        email: userInfoData.email,
        role: userInfoData.role,
        companyId: organizationData.companyId,
        departmentId: organizationData.departmentId,
        groupId: isIndividual ? null : organizationData.groupId,
        isIndividual,
        startDate: isIndividual ? organizationData.startDate || null : null,
        endDate: isIndividual ? organizationData.endDate || null : null,
        reviewPeriodDays: organizationData.reviewPeriodDays,
      })
    } catch {
      // エラーは親コンポーネントで処理
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                index < currentStepIndex
                  ? 'bg-primary text-white'
                  : index === currentStepIndex
                  ? 'bg-primary text-white'
                  : 'bg-gray-200 text-text-light'
              }`}
            >
              {index < currentStepIndex ? (
                <CheckIcon className="w-4 h-4" />
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`ml-2 text-sm ${
                index === currentStepIndex ? 'text-text font-medium' : 'text-text-light'
              }`}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <div
                className={`w-8 h-0.5 mx-3 ${
                  index < currentStepIndex ? 'bg-primary' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="min-h-[300px]">
        {currentStep === 'type' && (
          <UserTypeStep
            isIndividual={isIndividual}
            onChange={setIsIndividual}
          />
        )}

        {currentStep === 'organization' && (
          <OrganizationStep
            isIndividual={isIndividual}
            data={organizationData}
            companies={companies}
            departments={departments}
            groups={groups}
            onChange={(data) => setOrganizationData((prev) => ({ ...prev, ...data }))}
          />
        )}

        {currentStep === 'info' && (
          <UserInfoStep
            data={userInfoData}
            currentUserRole={currentUserRole}
            onChange={(data) => setUserInfoData((prev) => ({ ...prev, ...data }))}
            errors={errors}
          />
        )}
      </div>

      {/* Footer */}
      <ModalFooter>
        {currentStep === 'type' ? (
          <Button variant="ghost" onClick={onCancel}>
            キャンセル
          </Button>
        ) : (
          <Button variant="ghost" onClick={handleBack}>
            戻る
          </Button>
        )}

        {currentStep === 'info' ? (
          <Button
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={!canProceed()}
          >
            追加する
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={!canProceed()}>
            次へ
          </Button>
        )}
      </ModalFooter>
    </div>
  )
}
