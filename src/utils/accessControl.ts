import type { Group, GroupTrainingDate, Profile, IndividualTrainingDate } from '@/types/database'

interface AccessCheckResult {
  allowed: boolean
  reason: 'active' | 'contract_period' | 'training_period' | 'no_group' | 'group_inactive' | 'expired' | 'individual_no_period' | 'access_expired'
  message: string
}

/**
 * Check if a user has access based on group settings
 * Admin roles always have access
 */
export function checkTraineeAccess(
  group: Group | null,
  trainingDates: GroupTrainingDate[]
): AccessCheckResult {
  // No group assigned
  if (!group) {
    return {
      allowed: false,
      reason: 'no_group',
      message: 'グループに所属していないため、アクセスできません。管理者にお問い合わせください。',
    }
  }

  // Group is inactive
  if (!group.is_active) {
    return {
      allowed: false,
      reason: 'group_inactive',
      message: 'グループが無効になっています。管理者にお問い合わせください。',
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Check contract period
  const startDate = group.start_date ? new Date(group.start_date) : null
  const endDate = group.end_date ? new Date(group.end_date) : null

  if (startDate) {
    startDate.setHours(0, 0, 0, 0)
  }
  if (endDate) {
    endDate.setHours(23, 59, 59, 999)
  }

  // If within contract period, allow access
  const withinContractPeriod =
    (!startDate || today >= startDate) && (!endDate || today <= endDate)

  if (withinContractPeriod) {
    return {
      allowed: true,
      reason: 'contract_period',
      message: '契約期間内です。',
    }
  }

  // If contract period is set and expired, check training dates with review period
  if (trainingDates.length > 0) {
    const reviewDays = group.review_period_days || 14

    for (const td of trainingDates) {
      const trainingDate = new Date(td.training_date)
      trainingDate.setHours(0, 0, 0, 0)

      const reviewEndDate = new Date(trainingDate)
      reviewEndDate.setDate(reviewEndDate.getDate() + reviewDays)
      reviewEndDate.setHours(23, 59, 59, 999)

      // Check if today is within training date to review end date
      if (today >= trainingDate && today <= reviewEndDate) {
        return {
          allowed: true,
          reason: 'training_period',
          message: `研修日から復習期間（${reviewDays}日間）内です。`,
        }
      }
    }
  }

  // Access expired
  return {
    allowed: false,
    reason: 'expired',
    message: 'アクセス期間が終了しています。継続利用をご希望の場合は管理者にお問い合わせください。',
  }
}

/**
 * Check if an individual user has access based on their profile settings
 * For is_individual = true users who don't belong to a group
 */
export function checkIndividualAccess(
  profile: Profile,
  trainingDates: IndividualTrainingDate[]
): AccessCheckResult {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Check access_expires_at first (hard expiration)
  if (profile.access_expires_at) {
    const expiresAt = new Date(profile.access_expires_at)
    if (today > expiresAt) {
      return {
        allowed: false,
        reason: 'access_expired',
        message: 'アクセス権限の有効期限が切れています。管理者にお問い合わせください。',
      }
    }
  }

  // Check contract period (start_date / end_date)
  const startDate = profile.start_date ? new Date(profile.start_date) : null
  const endDate = profile.end_date ? new Date(profile.end_date) : null

  if (startDate) {
    startDate.setHours(0, 0, 0, 0)
  }
  if (endDate) {
    endDate.setHours(23, 59, 59, 999)
  }

  // If no period is set at all, check if there are training dates
  if (!startDate && !endDate && trainingDates.length === 0) {
    return {
      allowed: false,
      reason: 'individual_no_period',
      message: '利用期間が設定されていません。管理者にお問い合わせください。',
    }
  }

  // If within contract period, allow access
  const withinContractPeriod =
    (!startDate || today >= startDate) && (!endDate || today <= endDate)

  if (withinContractPeriod) {
    return {
      allowed: true,
      reason: 'contract_period',
      message: '契約期間内です。',
    }
  }

  // If contract period is expired, check training dates with review period
  if (trainingDates.length > 0) {
    const reviewDays = profile.review_period_days || 14

    for (const td of trainingDates) {
      const trainingDate = new Date(td.training_date)
      trainingDate.setHours(0, 0, 0, 0)

      const reviewEndDate = new Date(trainingDate)
      reviewEndDate.setDate(reviewEndDate.getDate() + reviewDays)
      reviewEndDate.setHours(23, 59, 59, 999)

      // Check if today is within training date to review end date
      if (today >= trainingDate && today <= reviewEndDate) {
        return {
          allowed: true,
          reason: 'training_period',
          message: `研修日から復習期間（${reviewDays}日間）内です。`,
        }
      }
    }
  }

  // Access expired
  return {
    allowed: false,
    reason: 'expired',
    message: 'アクセス期間が終了しています。継続利用をご希望の場合は管理者にお問い合わせください。',
  }
}
