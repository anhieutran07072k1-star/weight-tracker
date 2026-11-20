export type TransactionType = 'income' | 'expense';
export type SpendingSession = 'morning' | 'noon' | 'afternoon' | 'evening' | '';
export type AccountType = 'cash' | 'bank' | 'ewallet';
export type ThemeMode = 'light' | 'dark';
export type FontSizeScale = 'sm' | 'md' | 'lg';
export type TxViewStyle = 'compact' | 'detailed';

export type SyncStatusValue = 'synced' | 'pending' | 'conflict';

export interface SyncableMeta {
  version?: number;
  deviceId?: string;
  syncStatus?: SyncStatusValue;
}

export interface UserProfile {
  id: string;
  identifier: string; // Local email or phone number
  displayName: string;
  passwordHash: string;
  pinHash?: string;
  salt: string;
  authProvider?: 'local' | 'google';
  googleUid?: string;
  googleEmail?: string;
  googlePhotoUrl?: string;
  googleLinkedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialAccount extends SyncableMeta {
  id: string;
  name: string;
  type: AccountType;
  sticker: string;
  color: string;
  initialBalance: number; // integer VND
  isActive: boolean;
  isHidden: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category extends SyncableMeta {
  id: string;
  name: string;
  type: TransactionType;
  sticker: string;
  color: string;
  description?: string;
  isHidden: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction extends SyncableMeta {
  id: string;
  type: TransactionType;
  amount: number; // integer VND >= 0
  categoryId: string;
  accountId: string; // '' if unspecified yet
  date: string; // 'YYYY-MM-DD' or ''
  time: string; // 'HH:mm' or ''
  session: SpendingSession;
  sourceOrRecipient?: string;
  note: string;
  attachmentIds: string[];
  status: 'completed' | 'pending';
  createdAt: string; // ISO timestamp when user recorded it
  updatedAt: string;
}

export interface Transfer extends SyncableMeta {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number; // integer VND
  date: string;
  time: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Budget extends SyncableMeta {
  id: string;
  monthKey: string; // 'YYYY-MM'
  totalLimit: number; // integer VND
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCategory extends SyncableMeta {
  id: string;
  monthKey: string; // 'YYYY-MM'
  categoryId: string;
  limitAmount: number; // integer VND
  createdAt: string;
  updatedAt: string;
}

export interface SavingBook extends SyncableMeta {
  id: string;
  name: string;
  bankName: string;
  principalAmount: number;
  startDate: string;
  maturityDate: string;
  interestRate: number; // %/year
  termMonths: number;
  note: string;
  attachmentId?: string;
  status: 'active' | 'matured' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface LoanGiven extends SyncableMeta {
  id: string;
  borrowerName: string;
  principalAmount: number;
  startDate: string;
  expectedReturnDate: string;
  status: 'ongoing' | 'partial' | 'settled';
  hasInterest: boolean;
  interestType: 'percent_year' | 'percent_month' | 'fixed_monthly';
  interestValue: number;
  interestStartDate: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanTaken extends SyncableMeta {
  id: string;
  lenderName: string;
  principalAmount: number;
  startDate: string;
  dueDate: string;
  hasInterest: boolean;
  interestRate: number; // %/year
  status: 'ongoing' | 'partial' | 'settled';
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanRepayment extends SyncableMeta {
  id: string;
  loanId: string;
  loanKind: 'given' | 'taken';
  amountPrincipal: number;
  amountInterest: number;
  date: string;
  note: string;
  linkedAccountId?: string;
  linkedTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpecialTrackedItem extends SyncableMeta {
  id: string;
  name: string;
  categoryLabel: string;
  amount: number;
  color: string;
  sticker: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialEvent extends SyncableMeta {
  id: string;
  title: string;
  date: string; // 'YYYY-MM-DD'
  color: string;
  sticker: string;
  note: string;
  repeatAnnually: boolean;
  eventType: 'birthday' | 'anniversary' | 'travel' | 'bill' | 'holiday' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface CustomLedger extends SyncableMeta {
  id: string;
  name: string;
  sticker: string;
  color: string;
  description: string;
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerTransaction extends SyncableMeta {
  id: string;
  ledgerId: string;
  type: 'contribution' | 'expense';
  amount: number;
  personOrCategory: string;
  date: string;
  time: string;
  note: string;
  attachmentId?: string;
  reflectedMainTxId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiaryEntry extends SyncableMeta {
  id: string;
  title: string;
  date: string; // 'YYYY-MM-DD'
  content: string;
  moodSticker: string;
  attachmentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Attachment extends SyncableMeta {
  id: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings extends SyncableMeta {
  id: string; // 'default'
  primaryColor: string;
  themeMode: ThemeMode;
  fontSize: FontSizeScale;
  txViewStyle: TxViewStyle;
  hideBalances: boolean;
  enableAnimations: boolean;
  quickMultiply1000: boolean;
  appLockEnabled: boolean;
  autoLockMinutes: number; // 0 = disabled
  rememberSession: boolean;
  backupReminderDays: number;
  currency: string;
  currencySymbol: string;
  timezone: string;
  language: string;
  updatedAt: string;
}

export interface QuickInputAlias extends SyncableMeta {
  id: string;
  alias: string; // e.g. 'TM', 'MM', 'BIDV'
  targetType: 'account' | 'category';
  targetId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BalanceAdjustment extends SyncableMeta {
  id: string;
  accountId: string;
  previousBalance: number;
  newBalance: number;
  delta: number;
  reason: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupHistory {
  id: string;
  fileName: string;
  recordCount: number;
  sizeBytes: number;
  backupType: 'export' | 'import';
  createdAt: string;
  updatedAt: string;
}

export type SyncEntityType =
  | 'financialAccounts'
  | 'transactions'
  | 'categories'
  | 'budgets'
  | 'budgetCategories'
  | 'transfers'
  | 'savings'
  | 'loansGiven'
  | 'loansTaken'
  | 'loanRepayments'
  | 'specialItems'
  | 'financialEvents'
  | 'customLedgers'
  | 'ledgerTransactions'
  | 'diaryEntries'
  | 'attachments'
  | 'userSettings'
  | 'quickInputAliases'
  | 'balanceAdjustments';

export interface SyncTombstone {
  id: string; // `${entityType}:${recordId}`
  entityType: SyncEntityType;
  recordId: string;
  deletedAt: string;
  deletedByDeviceId: string;
  version: number;
}

export interface SyncQueueItem {
  id: string; // `${entityType}:${recordId}`
  entityType: SyncEntityType;
  recordId: string;
  operation: 'upsert' | 'delete';
  queuedAt: string;
  retryCount: number;
  lastError?: string;
}

export interface SyncConflict {
  id: string; // `${entityType}:${recordId}`
  entityType: SyncEntityType;
  recordId: string;
  conflictKind: 'edit_edit' | 'edit_delete' | 'delete_edit';
  localRecord: Record<string, any> | null;
  remoteRecord: Record<string, any> | null;
  remoteTombstone?: SyncTombstone | null;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  localDeviceId: string;
  remoteDeviceId: string;
  detectedAt: string;
}

export interface SyncMetaRecord {
  id: string; // 'sync_state'
  deviceId: string;
  deviceLabel: string;
  ownerGoogleUid?: string;
  ownerGoogleEmail?: string;
  lastSyncAt?: string;
  lastSyncError?: string;
  lastSyncErrorAction?: string;
  driveStateFileId?: string;
  hasCustomPassphrase?: boolean;
  /** Map of `${entityType}:${recordId}` -> { version, updatedAt, hash } at last successful sync */
  baseManifest: Record<string, { version: number; updatedAt: string; hash: string }>;
  /** Attachment IDs already known to be uploaded on Drive */
  syncedAttachmentIds: string[];
  updatedAt: string;
}

export type SyncConnectionStatus =
  | 'local_only'
  | 'connected'
  | 'offline'
  | 'auth_expired'
  | 'syncing'
  | 'conflict'
  | 'error';

export type AppSection =
  | 'overview'
  | 'transactions'
  | 'calendar'
  | 'reports'
  | 'ledgers'
  | 'settings';
