import { useState, useCallback } from 'react'
import { ArrowUpTrayIcon, ArrowDownTrayIcon, DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Button, Alert, Badge, ModalFooter } from '@/components/ui'
import { parseCSV } from '@/lib/utils'
import type { Company, Department } from '@/types/database'

export interface CsvGroupRow {
  action: 'add' | 'delete'
  companyName: string
  departmentName: string
  groupName: string
  dailyTokenLimit: number
  startDate: string
  endDate: string
  reviewPeriodDays: number
}

interface GroupCsvUploadProps {
  companies: Company[]
  departments: Department[]
  onImport: (groups: CsvGroupRow[]) => Promise<void>
  onCancel: () => void
}

const downloadTemplate = () => {
  const template = `アクション,企業名,部署名,グループ名,日次トークン上限,研修開始日,研修終了日,復習期間日数
add,株式会社サンプル,営業部,2025年4月営業研修,100000,2025-04-01,2025-04-30,14
add,株式会社サンプル,開発部,2025年4月開発研修,150000,2025-04-01,2025-05-31,21
add,株式会社サンプル,,全社共通研修,100000,2025-04-01,2025-04-15,14
delete,株式会社サンプル,,廃止研修,,,`

  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'group_import_template.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}

export function GroupCsvUpload({ companies, departments, onImport, onCancel }: GroupCsvUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedGroups, setParsedGroups] = useState<CsvGroupRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const companyNames = companies.map(c => c.name.toLowerCase())

  const handleFileChange = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return

    setFile(selectedFile)
    setErrors([])

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const rows = parseCSV(content)
      const dataRows = rows.slice(1)

      const validationErrors: string[] = []
      const groups: CsvGroupRow[] = []

      dataRows.forEach((row, index) => {
        const lineNum = index + 2

        if (row.length < 4) {
          validationErrors.push(`行${lineNum}: カラム数が不足しています`)
          return
        }

        const [action, companyName, departmentName, groupName, tokenLimitStr, startDate, endDate, reviewDaysStr] = row
        const trimmedAction = action?.trim().toLowerCase()

        if (trimmedAction !== 'add' && trimmedAction !== 'delete') {
          validationErrors.push(`行${lineNum}: アクションは 'add' または 'delete' を指定してください`)
          return
        }

        if (!companyName?.trim()) {
          validationErrors.push(`行${lineNum}: 企業名が空です`)
          return
        }

        if (!companyNames.includes(companyName.trim().toLowerCase())) {
          validationErrors.push(`行${lineNum}: 企業「${companyName}」が見つかりません`)
          return
        }

        if (!groupName?.trim()) {
          validationErrors.push(`行${lineNum}: グループ名が空です`)
          return
        }

        // 部署名のチェック（指定されている場合）
        if (departmentName?.trim()) {
          const company = companies.find(c => c.name.toLowerCase() === companyName.trim().toLowerCase())
          if (company) {
            const deptExists = departments.some(
              d => d.company_id === company.id && d.name.toLowerCase() === departmentName.trim().toLowerCase()
            )
            if (!deptExists) {
              validationErrors.push(`行${lineNum}: 部署「${departmentName}」が企業内に見つかりません`)
              return
            }
          }
        }

        const dailyTokenLimit = tokenLimitStr ? parseInt(tokenLimitStr.trim(), 10) : 100000
        const reviewPeriodDays = reviewDaysStr ? parseInt(reviewDaysStr.trim(), 10) : 14

        groups.push({
          action: trimmedAction as 'add' | 'delete',
          companyName: companyName.trim(),
          departmentName: departmentName?.trim() || '',
          groupName: groupName.trim(),
          dailyTokenLimit: isNaN(dailyTokenLimit) ? 100000 : dailyTokenLimit,
          startDate: startDate?.trim() || '',
          endDate: endDate?.trim() || '',
          reviewPeriodDays: isNaN(reviewPeriodDays) ? 14 : reviewPeriodDays,
        })
      })

      setErrors(validationErrors)
      setParsedGroups(groups)
    }

    reader.readAsText(selectedFile)
  }, [companyNames, companies, departments])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile && droppedFile.type === 'text/csv') {
        handleFileChange(droppedFile)
      } else {
        setErrors(['CSVファイルのみアップロード可能です'])
      }
    },
    [handleFileChange]
  )

  const handleImport = async () => {
    if (parsedGroups.length === 0) return

    setIsLoading(true)
    try {
      await onImport(parsedGroups)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setFile(null)
    setParsedGroups([])
    setErrors([])
  }

  const addCount = parsedGroups.filter((g) => g.action === 'add').length
  const deleteCount = parsedGroups.filter((g) => g.action === 'delete').length

  return (
    <div className="space-y-4">
      <div className="bg-primary-light rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-primary">CSVフォーマット</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={downloadTemplate}
            leftIcon={<ArrowDownTrayIcon className="w-4 h-4" />}
          >
            テンプレートDL
          </Button>
        </div>
        <p className="text-sm text-text-light mb-2">
          以下の形式でCSVファイルを作成してください：
        </p>
        <code className="block bg-white rounded px-3 py-2 text-sm font-mono overflow-x-auto">
          アクション,企業名,部署名,グループ名,日次トークン上限,研修開始日,研修終了日,復習期間日数
          <br />
          add,株式会社サンプル,営業部,2025年4月営業研修,100000,2025-04-01,2025-04-30,14
        </code>
        <p className="text-xs text-text-light mt-2">
          ※ 部署名は省略可（全社共通の場合）。日付はYYYY-MM-DD形式。
        </p>
      </div>

      {!file ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-xl p-8
            flex flex-col items-center justify-center
            transition-colors cursor-pointer
            ${isDragging ? 'border-primary bg-primary-light' : 'border-border hover:border-primary'}
          `}
        >
          <ArrowUpTrayIcon className="w-12 h-12 text-text-light mb-4" />
          <p className="text-text font-medium mb-2">CSVファイルをドラッグ&ドロップ</p>
          <p className="text-text-light text-sm mb-4">または</p>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            />
            <span className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors">
              ファイルを選択
            </span>
          </label>
        </div>
      ) : (
        <div className="border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DocumentTextIcon className="w-8 h-8 text-primary" />
              <div>
                <p className="font-medium text-text">{file.name}</p>
                <p className="text-sm text-text-light">
                  {parsedGroups.length}件のグループを検出
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-text-light" />
            </button>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <Alert variant="error">
          <p className="font-medium mb-2">以下のエラーがあります：</p>
          <ul className="list-disc list-inside space-y-1">
            {errors.slice(0, 5).map((error, index) => (
              <li key={index}>{error}</li>
            ))}
            {errors.length > 5 && <li>...他 {errors.length - 5} 件のエラー</li>}
          </ul>
        </Alert>
      )}

      {parsedGroups.length > 0 && errors.length === 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-border flex items-center justify-between">
            <p className="font-medium text-text">プレビュー（先頭5件）</p>
            <div className="flex items-center gap-2 text-sm">
              {addCount > 0 && <Badge variant="success" size="sm">追加: {addCount}件</Badge>}
              {deleteCount > 0 && <Badge variant="error" size="sm">削除: {deleteCount}件</Badge>}
            </div>
          </div>
          <div className="divide-y divide-border">
            {parsedGroups.slice(0, 5).map((group, index) => (
              <div key={index} className="px-4 py-3 flex items-center gap-4">
                <Badge variant={group.action === 'add' ? 'success' : 'error'} size="sm">
                  {group.action === 'add' ? '追加' : '削除'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text truncate">{group.groupName}</p>
                  <p className="text-sm text-text-light truncate">
                    {group.companyName}
                    {group.departmentName && ` / ${group.departmentName}`}
                    {group.startDate && ` (${group.startDate} 〜 ${group.endDate || '未定'})`}
                  </p>
                </div>
              </div>
            ))}
            {parsedGroups.length > 5 && (
              <div className="px-4 py-3 text-center text-text-light">
                ...他 {parsedGroups.length - 5} 件
              </div>
            )}
          </div>
        </div>
      )}

      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          キャンセル
        </Button>
        <Button
          onClick={handleImport}
          isLoading={isLoading}
          disabled={parsedGroups.length === 0 || errors.length > 0}
        >
          実行する
          {parsedGroups.length > 0 && (
            <span className="ml-1">
              ({addCount > 0 && `追加${addCount}`}
              {addCount > 0 && deleteCount > 0 && ' / '}
              {deleteCount > 0 && `削除${deleteCount}`})
            </span>
          )}
        </Button>
      </ModalFooter>
    </div>
  )
}
