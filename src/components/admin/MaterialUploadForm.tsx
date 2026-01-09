import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  CloudArrowUpIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  TableCellsIcon,
  DocumentIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Button, Input, Alert } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { MaterialType } from '@/types/database'

// バリデーションスキーマ
const uploadSchema = z.object({
  name: z.string().min(1, '資料名を入力してください'),
  materialType: z.enum(['pdf', 'url', 'text', 'markdown', 'excel']),
  url: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  textContent: z.string().optional(),
  tags: z.string().optional(),
})

type UploadFormData = z.infer<typeof uploadSchema>

interface MaterialUploadFormProps {
  onSuccess: () => void
  onCancel: () => void
}

// 資料タイプの設定
const MATERIAL_TYPES: {
  value: MaterialType
  label: string
  icon: React.ComponentType<{ className?: string }>
  accept?: string
  description: string
}[] = [
  { value: 'pdf', label: 'PDF', icon: DocumentTextIcon, accept: '.pdf', description: 'PDF形式のファイル' },
  { value: 'excel', label: 'Excel', icon: TableCellsIcon, accept: '.xlsx,.xls', description: 'Excel形式のファイル' },
  { value: 'url', label: 'URL', icon: GlobeAltIcon, description: 'Webページのコンテンツを取得' },
  { value: 'text', label: 'テキスト', icon: DocumentIcon, description: '直接テキストを入力' },
  { value: 'markdown', label: 'Markdown', icon: DocumentIcon, description: 'Markdown形式で入力' },
]

export function MaterialUploadForm({ onSuccess, onCancel }: MaterialUploadFormProps) {
  const { session } = useAuth()
  const [selectedType, setSelectedType] = useState<MaterialType>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      materialType: 'pdf',
      name: '',
      url: '',
      textContent: '',
      tags: '',
    },
  })

  // ファイル選択時の処理
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      // ファイル名を資料名のデフォルト値に設定
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '')
      setValue('name', nameWithoutExt)
    }
  }, [setValue])

  // ドラッグ&ドロップ処理
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      // ファイルタイプの検証
      const ext = droppedFile.name.split('.').pop()?.toLowerCase()
      if (selectedType === 'pdf' && ext !== 'pdf') {
        setError('PDFファイルを選択してください')
        return
      }
      if (selectedType === 'excel' && !['xlsx', 'xls'].includes(ext || '')) {
        setError('Excelファイルを選択してください')
        return
      }
      setFile(droppedFile)
      const nameWithoutExt = droppedFile.name.replace(/\.[^/.]+$/, '')
      setValue('name', nameWithoutExt)
      setError(null)
    }
  }, [selectedType, setValue])

  // フォーム送信
  const onSubmit = async (data: UploadFormData) => {
    if (!session?.access_token) {
      setError('認証が必要です')
      return
    }

    setIsUploading(true)
    setError(null)
    setUploadProgress(0)

    try {
      let storagePath: string | undefined
      let fileSizeBytes: number | undefined
      let mimeType: string | undefined
      let originalFilename: string | undefined

      // ファイルアップロードの場合
      if (['pdf', 'excel'].includes(data.materialType) && file) {
        // Supabase Storageにアップロード
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const uuid = crypto.randomUUID()
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        storagePath = `${data.materialType}/${year}/${month}/${uuid}_original.${ext}`

        setUploadProgress(10)

        const { error: uploadError } = await supabase.storage
          .from('source-materials')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`ファイルのアップロードに失敗しました: ${uploadError.message}`)
        }

        setUploadProgress(50)
        fileSizeBytes = file.size
        mimeType = file.type
        originalFilename = file.name
      }

      // source_materialsレコードを作成
      const requestBody: Record<string, unknown> = {
        name: data.name,
        materialType: data.materialType,
        storagePath,
        originalFilename,
        fileSizeBytes,
        mimeType,
        originalUrl: data.materialType === 'url' ? data.url : undefined,
        textContent: ['text', 'markdown'].includes(data.materialType) ? data.textContent : undefined,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      }

      setUploadProgress(70)

      const response = await fetch('/.netlify/functions/upload-material', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '資料の登録に失敗しました')
      }

      setUploadProgress(100)

      // URLまたはファイルの場合は自動でテキスト抽出を開始
      if (['pdf', 'excel', 'url'].includes(data.materialType) && result.material?.id) {
        const extractEndpoint = data.materialType === 'url'
          ? '/.netlify/functions/fetch-url-content'
          : '/.netlify/functions/extract-text'

        // 非同期で抽出を開始（完了を待たない）
        fetch(extractEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ materialId: result.material.id }),
        }).catch(console.error)
      }

      onSuccess()
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました')
    } finally {
      setIsUploading(false)
    }
  }

  const currentTypeConfig = MATERIAL_TYPES.find(t => t.value === selectedType)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 資料タイプ選択 */}
      <div>
        <label className="block text-sm font-medium text-text mb-2">資料タイプ</label>
        <div className="grid grid-cols-5 gap-2">
          {MATERIAL_TYPES.map((type) => {
            const Icon = type.icon
            const isSelected = selectedType === type.value
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => {
                  setSelectedType(type.value)
                  setValue('materialType', type.value)
                  setFile(null)
                }}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 hover:border-gray-300 text-text-light'
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-xs font-medium">{type.label}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-sm text-text-light">{currentTypeConfig?.description}</p>
      </div>

      {/* ファイルアップロードエリア（PDF/Excel） */}
      {['pdf', 'excel'].includes(selectedType) && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            file ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <DocumentTextIcon className="h-10 w-10 text-primary" />
              <div className="text-left">
                <div className="font-medium text-text">{file.name}</div>
                <div className="text-sm text-text-light">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="ml-4 p-1 rounded-full hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5 text-text-light" />
              </button>
            </div>
          ) : (
            <div>
              <CloudArrowUpIcon className="mx-auto h-12 w-12 text-text-light" />
              <p className="mt-2 text-text">
                ファイルをドラッグ&ドロップ
              </p>
              <p className="text-sm text-text-light">または</p>
              <label className="mt-2 inline-block cursor-pointer">
                <span className="text-primary hover:text-primary-dark font-medium">
                  ファイルを選択
                </span>
                <input
                  type="file"
                  accept={currentTypeConfig?.accept}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* URL入力 */}
      {selectedType === 'url' && (
        <div>
          <label className="block text-sm font-medium text-text mb-1">URL</label>
          <Input
            type="url"
            placeholder="https://example.com/article"
            {...register('url')}
            error={errors.url?.message}
          />
        </div>
      )}

      {/* テキスト入力 */}
      {['text', 'markdown'].includes(selectedType) && (
        <div>
          <label className="block text-sm font-medium text-text mb-1">
            {selectedType === 'markdown' ? 'Markdownコンテンツ' : 'テキストコンテンツ'}
          </label>
          <textarea
            {...register('textContent')}
            rows={10}
            placeholder={selectedType === 'markdown' ? '# タイトル\n\n本文...' : '本文を入力...'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
          />
        </div>
      )}

      {/* 資料名 */}
      <div>
        <label className="block text-sm font-medium text-text mb-1">資料名</label>
        <Input
          type="text"
          placeholder="資料の名前を入力"
          {...register('name')}
          error={errors.name?.message}
        />
      </div>

      {/* タグ */}
      <div>
        <label className="block text-sm font-medium text-text mb-1">タグ（カンマ区切り）</label>
        <Input
          type="text"
          placeholder="AI, プロンプト, 基礎"
          {...register('tags')}
        />
      </div>

      {/* プログレスバー */}
      {isUploading && (
        <div className="space-y-2">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-text-light text-center">
            アップロード中... {uploadProgress}%
          </p>
        </div>
      )}

      {/* ボタン */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isUploading}>
          キャンセル
        </Button>
        <Button
          type="submit"
          disabled={isUploading || (['pdf', 'excel'].includes(selectedType) && !file)}
        >
          {isUploading ? 'アップロード中...' : 'アップロード'}
        </Button>
      </div>
    </form>
  )
}
