import { useState, useCallback } from 'react'
import { ArrowUpTrayIcon, DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Button, Alert, ModalFooter } from '@/components/ui'
import { parseCSV, isValidEmail } from '@/lib/utils'

interface CsvUser {
  groupName: string
  userName: string
  email: string
}

interface CsvUploadProps {
  onImport: (users: CsvUser[]) => Promise<void>
  onCancel: () => void
}

export function CsvUpload({ onImport, onCancel }: CsvUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedUsers, setParsedUsers] = useState<CsvUser[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Handle file selection
  const handleFileChange = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return

    setFile(selectedFile)
    setErrors([])

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const rows = parseCSV(content)

      // Skip header row
      const dataRows = rows.slice(1)

      const validationErrors: string[] = []
      const users: CsvUser[] = []

      dataRows.forEach((row, index) => {
        const lineNum = index + 2 // Account for header and 0-index

        if (row.length < 3) {
          validationErrors.push(`行${lineNum}: カラム数が不足しています`)
          return
        }

        const [groupName, userName, email] = row

        if (!userName?.trim()) {
          validationErrors.push(`行${lineNum}: ユーザー名が空です`)
          return
        }

        if (!email?.trim()) {
          validationErrors.push(`行${lineNum}: メールアドレスが空です`)
          return
        }

        if (!isValidEmail(email.trim())) {
          validationErrors.push(`行${lineNum}: メールアドレスの形式が不正です`)
          return
        }

        users.push({
          groupName: groupName?.trim() || '',
          userName: userName.trim(),
          email: email.trim(),
        })
      })

      setErrors(validationErrors)
      setParsedUsers(users)
    }

    reader.readAsText(selectedFile)
  }, [])

  // Handle drag events
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

  // Handle import
  const handleImport = async () => {
    if (parsedUsers.length === 0) return

    setIsLoading(true)
    try {
      await onImport(parsedUsers)
    } finally {
      setIsLoading(false)
    }
  }

  // Clear file
  const handleClear = () => {
    setFile(null)
    setParsedUsers([])
    setErrors([])
  }

  return (
    <div className="space-y-4">
      {/* CSV format info */}
      <div className="bg-primary-light rounded-lg p-4">
        <h4 className="font-medium text-primary mb-2">CSVフォーマット</h4>
        <p className="text-sm text-text-light mb-2">
          以下の形式でCSVファイルを作成してください：
        </p>
        <code className="block bg-white rounded px-3 py-2 text-sm font-mono">
          グループ名,ユーザー名,メールアドレス
          <br />
          株式会社サンプル,山田太郎,taro@example.com
          <br />
          株式会社サンプル,鈴木花子,hanako@example.com
        </code>
      </div>

      {/* File upload area */}
      {!file ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-xl p-8
            flex flex-col items-center justify-center
            transition-colors cursor-pointer
            ${
              isDragging
                ? 'border-primary bg-primary-light'
                : 'border-border hover:border-primary'
            }
          `}
        >
          <ArrowUpTrayIcon className="w-12 h-12 text-text-light mb-4" />
          <p className="text-text font-medium mb-2">
            CSVファイルをドラッグ&ドロップ
          </p>
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
                  {parsedUsers.length}件のユーザーを検出
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

      {/* Validation errors */}
      {errors.length > 0 && (
        <Alert variant="error">
          <p className="font-medium mb-2">以下のエラーがあります：</p>
          <ul className="list-disc list-inside space-y-1">
            {errors.slice(0, 5).map((error, index) => (
              <li key={index}>{error}</li>
            ))}
            {errors.length > 5 && (
              <li>...他 {errors.length - 5} 件のエラー</li>
            )}
          </ul>
        </Alert>
      )}

      {/* Preview */}
      {parsedUsers.length > 0 && errors.length === 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-border">
            <p className="font-medium text-text">プレビュー（先頭5件）</p>
          </div>
          <div className="divide-y divide-border">
            {parsedUsers.slice(0, 5).map((user, index) => (
              <div key={index} className="px-4 py-3 flex items-center gap-4">
                <span className="w-8 h-8 rounded-full bg-primary-light text-primary font-medium flex items-center justify-center text-sm">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text truncate">{user.userName}</p>
                  <p className="text-sm text-text-light truncate">{user.email}</p>
                </div>
                {user.groupName && (
                  <span className="px-2 py-1 bg-gray-100 rounded text-sm text-text-light">
                    {user.groupName}
                  </span>
                )}
              </div>
            ))}
            {parsedUsers.length > 5 && (
              <div className="px-4 py-3 text-center text-text-light">
                ...他 {parsedUsers.length - 5} 件
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
          disabled={parsedUsers.length === 0 || errors.length > 0}
        >
          {parsedUsers.length}人を登録
        </Button>
      </ModalFooter>
    </div>
  )
}
