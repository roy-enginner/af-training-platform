import { UsersIcon, UserIcon } from '@heroicons/react/24/outline'

interface UserTypeStepProps {
  isIndividual: boolean
  onChange: (isIndividual: boolean) => void
}

export function UserTypeStep({ isIndividual, onChange }: UserTypeStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text mb-2">ユーザータイプを選択</h3>
        <p className="text-sm text-text-light">追加するユーザーのタイプを選択してください</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 通常ユーザー */}
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`p-6 rounded-xl border-2 transition-all text-left ${
            !isIndividual
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-gray-300'
          }`}
        >
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
            !isIndividual ? 'bg-primary/10' : 'bg-gray-100'
          }`}>
            <UsersIcon className={`w-6 h-6 ${!isIndividual ? 'text-primary' : 'text-text-light'}`} />
          </div>
          <h4 className="font-semibold text-text mb-1">通常研修生</h4>
          <p className="text-sm text-text-light">
            グループに所属して研修を受けるユーザー。グループの研修期間に従います。
          </p>
        </button>

        {/* 個人ユーザー */}
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`p-6 rounded-xl border-2 transition-all text-left ${
            isIndividual
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-gray-300'
          }`}
        >
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
            isIndividual ? 'bg-primary/10' : 'bg-gray-100'
          }`}>
            <UserIcon className={`w-6 h-6 ${isIndividual ? 'text-primary' : 'text-text-light'}`} />
          </div>
          <h4 className="font-semibold text-text mb-1">個人ユーザー</h4>
          <p className="text-sm text-text-light">
            グループに所属しない個別ユーザー。個別の利用期間を設定できます。
          </p>
        </button>
      </div>
    </div>
  )
}
