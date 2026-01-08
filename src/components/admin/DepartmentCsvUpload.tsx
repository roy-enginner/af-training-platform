import { useState, useCallback } from 'react'
import { ArrowUpTrayIcon, ArrowDownTrayIcon, DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Button, Alert, Badge, ModalFooter } from '@/components/ui'
import { parseCSV } from '@/lib/utils'
import type { Company } from '@/types/database'

export interface CsvDepartmentRow {
  action: 'add' | 'delete'
  companyName: string
  departmentName: string
  parentDepartmentName: string
  sortOrder: number
}

interface DepartmentCsvUploadProps {
  companies: Company[]
  onImport: (departments: CsvDepartmentRow[]) => Promise<void>
  onCancel: () => void
}

const downloadTemplate = () => {
  const template = `アクション,企業名,部署名,親部署名,表示順
add,株式会社サンプル,営業部,,1
add,株式会社サンプル,営業1課,営業部,1
add,株式会社サンプル,営業2課,営業部,2
add,株式会社サンプル,開発部,,2
delete,株式会社サンプル,廃止部署,,`

  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'department_import_template.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}

export function DepartmentCsvUpload({ companies, onImport, onCancel }: DepartmentCsvUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedDepartments, setParsedDepartments] = useState<CsvDepartmentRow[]>([])
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
      const departments: CsvDepartmentRow[] = []

      dataRows.forEach((row, index) => {
        const lineNum = index + 2

        if (row.length < 3) {
          validationErrors.push(`行${lineNum}: カラム数が不足しています`)
          return
        }

        const [action, companyName, departmentName, parentDepartmentName, sortOrderStr] = row
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

        if (!departmentName?.trim()) {
          validationErrors.push(`行${lineNum}: 部署名が空です`)
          return
        }

        const sortOrder = sortOrderStr ? parseInt(sortOrderStr.trim(), 10) : 0

        departments.push({
          action: trimmedAction as 'add' | 'delete',
          companyName: companyName.trim(),
          departmentName: departmentName.trim(),
          parentDepartmentName: parentDepartmentName?.trim() || '',
          sortOrder: isNaN(sortOrder) ? 0 : sortOrder,
        })
      })

      setErrors(validationErrors)
      setParsedDepartments(departments)
    }

    reader.readAsText(selectedFile)
  }, [companyNames])

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
    if (parsedDepartments.length === 0) return

    setIsLoading(true)
    try {
      await onImport(parsedDepartments)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setFile(null)
    setParsedDepartments([])
    setErrors([])
  }

  const addCount = parsedDepartments.filter((d) => d.action === 'add').length
  const deleteCount = parsedDepartments.filter((d) => d.action === 'delete').length

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
        <code className="block bg-white rounded px-3 py-2 text-sm font-mono">
          アクション,企業名,部署名,親部署名,表示順
          <br />
          add,株式会社サンプル,営業部,,1
          <br />
          add,株式会社サンプル,営業1課,営業部,1
        </code>
        <p className="text-xs text-text-light mt-2">
          ※ 親部署名・表示順は省略可。親部署は先に登録が必要です。
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
                  {parsedDepartments.length}件の部署を検出
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

      {parsedDepartments.length > 0 && errors.length === 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-border flex items-center justify-between">
            <p className="font-medium text-text">プレビュー（先頭5件）</p>
            <div className="flex items-center gap-2 text-sm">
              {addCount > 0 && <Badge variant="success" size="sm">追加: {addCount}件</Badge>}
              {deleteCount > 0 && <Badge variant="error" size="sm">削除: {deleteCount}件</Badge>}
            </div>
          </div>
          <div className="divide-y divide-border">
            {parsedDepartments.slice(0, 5).map((dept, index) => (
              <div key={index} className="px-4 py-3 flex items-center gap-4">
                <Badge variant={dept.action === 'add' ? 'success' : 'error'} size="sm">
                  {dept.action === 'add' ? '追加' : '削除'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text truncate">{dept.departmentName}</p>
                  <p className="text-sm text-text-light truncate">
                    {dept.companyName}
                    {dept.parentDepartmentName && ` / ${dept.parentDepartmentName}`}
                  </p>
                </div>
              </div>
            ))}
            {parsedDepartments.length > 5 && (
              <div className="px-4 py-3 text-center text-text-light">
                ...他 {parsedDepartments.length - 5} 件
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
          disabled={parsedDepartments.length === 0 || errors.length > 0}
        >
          実行する
          {parsedDepartments.length > 0 && (
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
