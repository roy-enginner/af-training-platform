import { useMemo } from 'react'
import type { Company, Department, Group } from '@/types/database'

interface OrganizationData {
  companyId: string | null
  departmentId: string | null
  groupId: string | null
  // 個人ユーザー用
  startDate: string
  endDate: string
  reviewPeriodDays: number
}

interface OrganizationStepProps {
  isIndividual: boolean
  data: OrganizationData
  companies: Company[]
  departments: Department[]
  groups: Group[]
  onChange: (data: Partial<OrganizationData>) => void
}

export function OrganizationStep({
  isIndividual,
  data,
  companies,
  departments,
  groups,
  onChange,
}: OrganizationStepProps) {
  // 企業でフィルタした部署
  const filteredDepartments = useMemo(() => {
    if (!data.companyId) return []
    return departments.filter((d) => d.company_id === data.companyId && d.is_active)
  }, [departments, data.companyId])

  // 企業・部署でフィルタしたグループ
  const filteredGroups = useMemo(() => {
    if (data.departmentId) {
      return groups.filter((g) => g.department_id === data.departmentId && g.is_active)
    }
    if (data.companyId) {
      return groups.filter((g) => g.company_id === data.companyId && g.is_active)
    }
    return groups.filter((g) => g.is_active)
  }, [groups, data.companyId, data.departmentId])

  // 企業変更時に部署・グループをリセット
  const handleCompanyChange = (companyId: string) => {
    onChange({
      companyId: companyId || null,
      departmentId: null,
      groupId: null,
    })
  }

  // 部署変更時にグループをリセット
  const handleDepartmentChange = (departmentId: string) => {
    onChange({
      departmentId: departmentId || null,
      groupId: null,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text mb-2">
          {isIndividual ? '所属企業と利用期間' : '所属を選択'}
        </h3>
        <p className="text-sm text-text-light">
          {isIndividual
            ? '所属企業と利用期間を設定してください'
            : '企業、部署、グループを順番に選択してください'}
        </p>
      </div>

      {/* 企業選択 */}
      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          所属企業
        </label>
        <select
          className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
          value={data.companyId || ''}
          onChange={(e) => handleCompanyChange(e.target.value)}
        >
          <option value="">企業を選択...</option>
          {companies.filter((c) => c.is_active).map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>

      {/* 部署選択（企業選択後） */}
      {data.companyId && filteredDepartments.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            所属部署
          </label>
          <select
            className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
            value={data.departmentId || ''}
            onChange={(e) => handleDepartmentChange(e.target.value)}
          >
            <option value="">部署なし</option>
            {filteredDepartments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* グループ選択（通常ユーザーのみ） */}
      {!isIndividual && (
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            所属グループ <span className="text-error">*</span>
          </label>
          <select
            className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
            value={data.groupId || ''}
            onChange={(e) => onChange({ groupId: e.target.value || null })}
          >
            <option value="">グループを選択...</option>
            {filteredGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {!data.groupId && (
            <p className="mt-1 text-sm text-text-light">
              通常研修生はグループの選択が必須です
            </p>
          )}
        </div>
      )}

      {/* 個人ユーザーの期間設定 */}
      {isIndividual && (
        <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg space-y-4">
          <p className="text-sm font-medium text-blue-700">
            個人ユーザーの期間設定
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                利用開始日
              </label>
              <input
                type="date"
                className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                  focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                value={data.startDate}
                onChange={(e) => onChange({ startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                利用終了日
              </label>
              <input
                type="date"
                className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                  focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
                value={data.endDate}
                onChange={(e) => onChange({ endDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              復習期間（日数）
            </label>
            <input
              type="number"
              min="0"
              max="365"
              className="w-full px-4 py-2.5 border border-border rounded-lg bg-white text-text
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-primary/50 focus:border-primary"
              value={data.reviewPeriodDays}
              onChange={(e) => onChange({ reviewPeriodDays: parseInt(e.target.value) || 0 })}
            />
            <p className="mt-1 text-xs text-text-light">
              研修実施日からこの日数は復習期間としてアクセスを許可します
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
