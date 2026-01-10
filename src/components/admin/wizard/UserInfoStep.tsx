import { Input } from '@/components/ui'
import type { UserRole } from '@/types/database'
import { hasPermission } from '@/types/database'

interface UserInfoData {
  name: string
  email: string
  role: UserRole
}

interface UserInfoStepProps {
  data: UserInfoData
  currentUserRole: UserRole | null
  onChange: (data: Partial<UserInfoData>) => void
  errors?: {
    name?: string
    email?: string
  }
}

export function UserInfoStep({
  data,
  currentUserRole,
  onChange,
  errors,
}: UserInfoStepProps) {
  const canAssignAdminRole = currentUserRole ? hasPermission(currentUserRole, 'canAssignAdminRole') : false

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text mb-2">基本情報を入力</h3>
        <p className="text-sm text-text-light">ユーザーの基本情報を入力してください</p>
      </div>

      {/* 名前 */}
      <Input
        label="名前"
        placeholder="山田 太郎"
        value={data.name}
        onChange={(e) => onChange({ name: e.target.value })}
        error={errors?.name}
        required
      />

      {/* メールアドレス */}
      <Input
        label="メールアドレス"
        type="email"
        placeholder="email@example.com"
        value={data.email}
        onChange={(e) => onChange({ email: e.target.value })}
        error={errors?.email}
        required
      />

      {/* 権限 */}
      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          権限
        </label>
        <select
          className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
          value={data.role}
          onChange={(e) => onChange({ role: e.target.value as UserRole })}
        >
          <option value="trainee">研修生</option>
          {canAssignAdminRole && (
            <>
              <option value="group_admin">グループ管理者</option>
              <option value="super_admin">スーパー管理者</option>
            </>
          )}
        </select>
        <p className="mt-1 text-xs text-text-light">
          {data.role === 'trainee' && '研修を受けるユーザーです'}
          {data.role === 'group_admin' && '自分のグループ内のユーザーを管理できます'}
          {data.role === 'super_admin' && '全ての機能にアクセスできます'}
        </p>
      </div>
    </div>
  )
}
