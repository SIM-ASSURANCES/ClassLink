// ─── Rôles utilisateurs ──────────────────────────────────────────────────────
export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CENSOR'
  | 'ACCOUNTANT'
  | 'TEACHER'
  | 'PARENT'
  | 'STUDENT'
  | 'STAFF'
  | 'DRIVER'

// ─── Statuts école ────────────────────────────────────────────────────────────
export type SchoolStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'

// ─── Statuts paiement ─────────────────────────────────────────────────────────
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED'

// ─── Types d'évaluation ───────────────────────────────────────────────────────
export type EvaluationType = 'DEVOIR' | 'INTERROGATION' | 'COMPOSITION' | 'EXAM'

// ─── Statuts de présence ──────────────────────────────────────────────────────
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

// ─── Statut d'inscription ─────────────────────────────────────────────────────
export type EnrollmentStatus = 'ACTIVE' | 'TRANSFERRED' | 'EXPELLED' | 'GRADUATED'

// ─── Niveau de risque décrochage ──────────────────────────────────────────────
export type DropoutRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

// ─── Session utilisateur étendue ─────────────────────────────────────────────
export interface SessionUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  schemaName: string
  avatarUrl?: string
  twoFactorEnabled?: boolean
}

// ─── Réponse générique des Server Actions ────────────────────────────────────
export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string; code?: string }

// ─── Pagination ───────────────────────────────────────────────────────────────
export interface PaginationParams {
  page?: number
  perPage?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

// ─── Notifications ────────────────────────────────────────────────────────────
export type NotificationType =
  | 'GRADE_PUBLISHED'
  | 'ABSENCE_RECORDED'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_DUE'
  | 'REPORT_CARD_AVAILABLE'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_DUE'
  | 'NEW_MESSAGE'
  | 'ANNOUNCEMENT'
  | 'APPOINTMENT_CONFIRMED'

export type NotificationChannel = 'email' | 'sms' | 'push'

// ─── Fichier uploadé ──────────────────────────────────────────────────────────
export interface UploadedFile {
  name: string
  url: string
  size: number
  type: string
}

// ─── Appréciation bulletins ───────────────────────────────────────────────────
export type Appreciation =
  | 'Très Bien'
  | 'Bien'
  | 'Assez Bien'
  | 'Passable'
  | 'Insuffisant'
  | 'Très Insuffisant'
