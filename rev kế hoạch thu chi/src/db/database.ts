import Dexie, { Table } from 'dexie';
import {
  Attachment,
  BackupHistory,
  BalanceAdjustment,
  Budget,
  BudgetCategory,
  Category,
  CustomLedger,
  DiaryEntry,
  FinancialAccount,
  FinancialEvent,
  LedgerTransaction,
  LoanGiven,
  LoanRepayment,
  LoanTaken,
  QuickInputAlias,
  SavingBook,
  SpecialTrackedItem,
  SyncConflict,
  SyncEntityType,
  SyncMetaRecord,
  SyncQueueItem,
  SyncTombstone,
  Transaction,
  Transfer,
  UserProfile,
  UserSettings,
} from '../types/finance';
import { getCurrentTimeVN, getTodayVN, uid } from '../utils/format';
import { sha256Hex } from '../utils/syncCrypto';

export class KeHoachThuChiDB extends Dexie {
  userProfiles!: Table<UserProfile, string>;
  financialAccounts!: Table<FinancialAccount, string>;
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  budgets!: Table<Budget, string>;
  budgetCategories!: Table<BudgetCategory, string>;
  transfers!: Table<Transfer, string>;
  savings!: Table<SavingBook, string>;
  loansGiven!: Table<LoanGiven, string>;
  loansTaken!: Table<LoanTaken, string>;
  loanRepayments!: Table<LoanRepayment, string>;
  specialItems!: Table<SpecialTrackedItem, string>;
  financialEvents!: Table<FinancialEvent, string>;
  customLedgers!: Table<CustomLedger, string>;
  ledgerTransactions!: Table<LedgerTransaction, string>;
  diaryEntries!: Table<DiaryEntry, string>;
  attachments!: Table<Attachment, string>;
  userSettings!: Table<UserSettings, string>;
  quickInputAliases!: Table<QuickInputAlias, string>;
  balanceAdjustments!: Table<BalanceAdjustment, string>;
  backupHistory!: Table<BackupHistory, string>;
  syncTombstones!: Table<SyncTombstone, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  syncConflicts!: Table<SyncConflict, string>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor() {
    super('KeHoachThuChiDB');
    this.version(1).stores({
      userProfiles: 'id, identifier',
      financialAccounts: 'id, type, isActive, sortOrder',
      transactions: 'id, type, categoryId, accountId, date, createdAt',
      categories: 'id, type, isHidden, sortOrder',
      budgets: 'id, monthKey',
      budgetCategories: 'id, monthKey, categoryId',
      transfers: 'id, fromAccountId, toAccountId, date',
      savings: 'id, status, maturityDate',
      loansGiven: 'id, status, startDate',
      loansTaken: 'id, status, dueDate',
      loanRepayments: 'id, loanId, loanKind, date',
      specialItems: 'id, date',
      financialEvents: 'id, date, repeatAnnually',
      customLedgers: 'id, startDate',
      ledgerTransactions: 'id, ledgerId, type, date',
      diaryEntries: 'id, date',
      attachments: 'id, createdAt',
      userSettings: 'id',
      quickInputAliases: 'id, alias, targetType, targetId',
      balanceAdjustments: 'id, accountId, date',
      backupHistory: 'id, createdAt',
    });

    this.version(2).stores({
      userProfiles: 'id, identifier, googleUid',
      financialAccounts: 'id, type, isActive, sortOrder',
      transactions: 'id, type, categoryId, accountId, date, createdAt',
      categories: 'id, type, isHidden, sortOrder',
      budgets: 'id, monthKey',
      budgetCategories: 'id, monthKey, categoryId',
      transfers: 'id, fromAccountId, toAccountId, date',
      savings: 'id, status, maturityDate',
      loansGiven: 'id, status, startDate',
      loansTaken: 'id, status, dueDate',
      loanRepayments: 'id, loanId, loanKind, date',
      specialItems: 'id, date',
      financialEvents: 'id, date, repeatAnnually',
      customLedgers: 'id, startDate',
      ledgerTransactions: 'id, ledgerId, type, date',
      diaryEntries: 'id, date',
      attachments: 'id, createdAt',
      userSettings: 'id',
      quickInputAliases: 'id, alias, targetType, targetId',
      balanceAdjustments: 'id, accountId, date',
      backupHistory: 'id, createdAt',
      syncTombstones: 'id, entityType, recordId, deletedAt',
      syncQueue: 'id, entityType, recordId, operation, queuedAt',
      syncConflicts: 'id, entityType, recordId, detectedAt',
      syncMeta: 'id',
    });
  }
}

export const db = new KeHoachThuChiDB();

const DEVICE_ID_STORAGE_KEY = 'khtc_device_id';

export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'dev_runtime';
  let existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!existing) {
    existing = uid('dev');
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, existing);
  }
  return existing;
}

export function getFriendlyDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Thiết bị';
  const ua = navigator.userAgent || '';
  const os = /iPhone|iPad|iPod/i.test(ua)
    ? 'iOS'
    : /Android/i.test(ua)
    ? 'Android'
    : /Mac/i.test(ua)
    ? 'macOS'
    : /Windows/i.test(ua)
    ? 'Windows'
    : 'Linux';
  const browser = /Edg/i.test(ua)
    ? 'Edge'
    : /Chrome/i.test(ua)
    ? 'Chrome'
    : /Safari/i.test(ua)
    ? 'Safari'
    : /Firefox/i.test(ua)
    ? 'Firefox'
    : 'Trình duyệt';
  return `${browser} · ${os}`;
}

export async function getOrInitSyncMeta(): Promise<SyncMetaRecord> {
  const existing = await db.syncMeta.get('sync_state');
  if (existing) return existing;
  const fresh: SyncMetaRecord = {
    id: 'sync_state',
    deviceId: getOrCreateDeviceId(),
    deviceLabel: getFriendlyDeviceLabel(),
    baseManifest: {},
    syncedAttachmentIds: [],
    updatedAt: new Date().toISOString(),
  };
  await db.syncMeta.put(fresh);
  return fresh;
}

export async function queueUpsertChanges(
  items: Array<{ entityType: SyncEntityType; recordId: string }>
): Promise<void> {
  if (items.length === 0) return;
  const now = new Date().toISOString();
  const rows: SyncQueueItem[] = items.map((it) => ({
    id: `${it.entityType}:${it.recordId}`,
    entityType: it.entityType,
    recordId: it.recordId,
    operation: 'upsert',
    queuedAt: now,
    retryCount: 0,
  }));
  await db.syncQueue.bulkPut(rows);
  // If re-creating an ID that had a tombstone, clear tombstone
  await db.syncTombstones.bulkDelete(rows.map((r) => r.id));
}

export async function queueDeleteChanges(
  items: Array<{ entityType: SyncEntityType; recordId: string; version?: number }>
): Promise<void> {
  if (items.length === 0) return;
  const now = new Date().toISOString();
  const deviceId = getOrCreateDeviceId();
  const tombstones: SyncTombstone[] = items.map((it) => ({
    id: `${it.entityType}:${it.recordId}`,
    entityType: it.entityType,
    recordId: it.recordId,
    deletedAt: now,
    deletedByDeviceId: deviceId,
    version: (it.version ?? 1) + 1,
  }));
  const queueRows: SyncQueueItem[] = items.map((it) => ({
    id: `${it.entityType}:${it.recordId}`,
    entityType: it.entityType,
    recordId: it.recordId,
    operation: 'delete',
    queuedAt: now,
    retryCount: 0,
  }));
  await db.transaction('rw', [db.syncTombstones, db.syncQueue], async () => {
    await db.syncTombstones.bulkPut(tombstones);
    await db.syncQueue.bulkPut(queueRows);
  });
}

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'default',
  primaryColor: '#20B889',
  themeMode: 'light',
  fontSize: 'md',
  txViewStyle: 'detailed',
  hideBalances: false,
  enableAnimations: true,
  quickMultiply1000: false,
  appLockEnabled: false,
  autoLockMinutes: 0,
  rememberSession: true,
  backupReminderDays: 7,
  currency: 'VND',
  currencySymbol: 'đ',
  timezone: 'Asia/Ho_Chi_Minh',
  language: 'vi',
  updatedAt: new Date().toISOString(),
};

export const DEFAULT_EXPENSE_CATEGORIES: Array<Pick<Category, 'id' | 'name' | 'sticker' | 'color'>> = [
  { id: 'cat_exp_food', name: 'Ăn uống', sticker: '🍜', color: '#E45F63' },
  { id: 'cat_exp_market', name: 'Đi chợ', sticker: '🥬', color: '#20B889' },
  { id: 'cat_exp_shopping', name: 'Mua sắm', sticker: '🛍️', color: '#F28B82' },
  { id: 'cat_exp_transport', name: 'Di chuyển', sticker: '🛵', color: '#5B9BD5' },
  { id: 'cat_exp_bill', name: 'Hóa đơn', sticker: '🧾', color: '#F2B85B' },
  { id: 'cat_exp_utilities', name: 'Điện nước', sticker: '⚡', color: '#F6AD55' },
  { id: 'cat_exp_home', name: 'Nhà cửa', sticker: '🏠', color: '#8B7AE8' },
  { id: 'cat_exp_health', name: 'Sức khỏe', sticker: '💊', color: '#EC6B87' },
  { id: 'cat_exp_beauty', name: 'Làm đẹp', sticker: '💄', color: '#E879F9' },
  { id: 'cat_exp_entertain', name: 'Giải trí', sticker: '🎮', color: '#7C8CF8' },
  { id: 'cat_exp_travel', name: 'Du lịch', sticker: '✈️', color: '#38BDF8' },
  { id: 'cat_exp_edu', name: 'Giáo dục', sticker: '📚', color: '#4ADE80' },
  { id: 'cat_exp_family', name: 'Gia đình', sticker: '👨‍👩‍👧', color: '#FB923C' },
  { id: 'cat_exp_pet', name: 'Thú cưng', sticker: '🐾', color: '#A78BFA' },
  { id: 'cat_exp_other', name: 'Khác', sticker: '📦', color: '#94A3B8' },
];

export const DEFAULT_INCOME_CATEGORIES: Array<Pick<Category, 'id' | 'name' | 'sticker' | 'color'>> = [
  { id: 'cat_inc_salary', name: 'Lương', sticker: '💵', color: '#20B889' },
  { id: 'cat_inc_bonus', name: 'Thưởng', sticker: '🎁', color: '#10B981' },
  { id: 'cat_inc_business', name: 'Kinh doanh', sticker: '🏪', color: '#34D399' },
  { id: 'cat_inc_gift', name: 'Được tặng', sticker: '🎀', color: '#F472B6' },
  { id: 'cat_inc_refund', name: 'Được trả tiền', sticker: '🤝', color: '#38BDF8' },
  { id: 'cat_inc_debt_collect', name: 'Thu hồi nợ', sticker: '📥', color: '#60A5FA' },
  { id: 'cat_inc_saving_int', name: 'Lãi tiết kiệm', sticker: '🏦', color: '#2DD4BF' },
  { id: 'cat_inc_loan_int', name: 'Tiền lãi cho vay', sticker: '💹', color: '#A78BFA' },
  { id: 'cat_inc_other', name: 'Thu nhập khác', sticker: '✨', color: '#F2B85B' },
];

export async function ensureSeedDefaults(): Promise<void> {
  const now = new Date().toISOString();

  const existingSettings = await db.userSettings.get('default');
  if (!existingSettings) {
    await db.userSettings.put({ ...DEFAULT_SETTINGS, updatedAt: now });
  }

  const catCount = await db.categories.count();
  if (catCount === 0) {
    const allCats: Category[] = [
      ...DEFAULT_EXPENSE_CATEGORIES.map((c, idx) => ({
        ...c,
        type: 'expense' as const,
        description: '',
        isHidden: false,
        sortOrder: idx,
        createdAt: now,
        updatedAt: now,
      })),
      ...DEFAULT_INCOME_CATEGORIES.map((c, idx) => ({
        ...c,
        type: 'income' as const,
        description: '',
        isHidden: false,
        sortOrder: idx,
        createdAt: now,
        updatedAt: now,
      })),
    ];
    await db.categories.bulkPut(allCats);
  }
}

export async function seedStarterAccounts(starterBalances?: Partial<Record<string, number>>): Promise<void> {
  const count = await db.financialAccounts.count();
  if (count > 0) return;

  const now = new Date().toISOString();
  const defaults: FinancialAccount[] = [
    {
      id: 'acc_cash',
      name: 'Tiền mặt',
      type: 'cash',
      sticker: '💵',
      color: '#20B889',
      initialBalance: Math.round(starterBalances?.acc_cash ?? 0),
      isActive: true,
      isHidden: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'acc_momo',
      name: 'MoMo',
      type: 'ewallet',
      sticker: '👛',
      color: '#D82D8B',
      initialBalance: Math.round(starterBalances?.acc_momo ?? 0),
      isActive: true,
      isHidden: false,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'acc_bidv',
      name: 'BIDV',
      type: 'bank',
      sticker: '🏦',
      color: '#1D6FD8',
      initialBalance: Math.round(starterBalances?.acc_bidv ?? 0),
      isActive: true,
      isHidden: false,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'acc_tcb',
      name: 'Techcombank',
      type: 'bank',
      sticker: '💳',
      color: '#E45F63',
      initialBalance: Math.round(starterBalances?.acc_tcb ?? 0),
      isActive: true,
      isHidden: false,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
    },
  ];
  await db.financialAccounts.bulkPut(defaults);

  const aliasCount = await db.quickInputAliases.count();
  if (aliasCount === 0) {
    const aliases: QuickInputAlias[] = [
      { id: uid('alias'), alias: 'TM', targetType: 'account', targetId: 'acc_cash', createdAt: now, updatedAt: now },
      { id: uid('alias'), alias: 'MM', targetType: 'account', targetId: 'acc_momo', createdAt: now, updatedAt: now },
      { id: uid('alias'), alias: 'BIDV', targetType: 'account', targetId: 'acc_bidv', createdAt: now, updatedAt: now },
      { id: uid('alias'), alias: 'TCB', targetType: 'account', targetId: 'acc_tcb', createdAt: now, updatedAt: now },
    ];
    await db.quickInputAliases.bulkPut(aliases);
  }
}

// Strict Financial Formula:
// Balance = initialBalance + income - expense + transferIn - transferOut + adjustments
export function calculateAccountBalance(
  account: FinancialAccount,
  transactions: Transaction[],
  transfers: Transfer[],
  adjustments: BalanceAdjustment[]
): number {
  let balance = Math.round(account.initialBalance || 0);

  for (const tx of transactions) {
    if (tx.accountId !== account.id) continue;
    const amt = Math.round(tx.amount || 0);
    if (tx.type === 'income') balance += amt;
    else if (tx.type === 'expense') balance -= amt;
  }

  for (const tr of transfers) {
    const amt = Math.round(tr.amount || 0);
    if (tr.toAccountId === account.id) balance += amt;
    if (tr.fromAccountId === account.id) balance -= amt;
  }

  for (const adj of adjustments) {
    if (adj.accountId === account.id) {
      balance += Math.round(adj.delta || 0);
    }
  }

  return Math.round(balance);
}

export async function exportFullBackupJSON(): Promise<{ json: string; recordCount: number }> {
  const [
    userProfiles,
    financialAccounts,
    transactions,
    categories,
    budgets,
    budgetCategories,
    transfers,
    savings,
    loansGiven,
    loansTaken,
    loanRepayments,
    specialItems,
    financialEvents,
    customLedgers,
    ledgerTransactions,
    diaryEntries,
    attachments,
    userSettings,
    quickInputAliases,
    balanceAdjustments,
    syncTombstones,
  ] = await Promise.all([
    db.userProfiles.toArray(),
    db.financialAccounts.toArray(),
    db.transactions.toArray(),
    db.categories.toArray(),
    db.budgets.toArray(),
    db.budgetCategories.toArray(),
    db.transfers.toArray(),
    db.savings.toArray(),
    db.loansGiven.toArray(),
    db.loansTaken.toArray(),
    db.loanRepayments.toArray(),
    db.specialItems.toArray(),
    db.financialEvents.toArray(),
    db.customLedgers.toArray(),
    db.ledgerTransactions.toArray(),
    db.diaryEntries.toArray(),
    db.attachments.toArray(),
    db.userSettings.toArray(),
    db.quickInputAliases.toArray(),
    db.balanceAdjustments.toArray(),
    db.syncTombstones.toArray(),
  ]);

  const dataSection = {
    userProfiles,
    financialAccounts,
    transactions,
    categories,
    budgets,
    budgetCategories,
    transfers,
    savings,
    loansGiven,
    loansTaken,
    loanRepayments,
    specialItems,
    financialEvents,
    customLedgers,
    ledgerTransactions,
    diaryEntries,
    attachments,
    userSettings,
    quickInputAliases,
    balanceAdjustments,
    syncTombstones,
  };

  let integritySha256 = '';
  try {
    integritySha256 = await sha256Hex(JSON.stringify(dataSection));
  } catch {
    // fallback if Web Crypto subtle is unavailable on insecure origin
  }

  const payload = {
    app: 'KeHoachThuChi',
    version: 2,
    exportedAt: new Date().toISOString(),
    integritySha256,
    data: dataSection,
  };

  const recordCount = Object.values(payload.data).reduce((sum, arr) => sum + arr.length, 0);
  return { json: JSON.stringify(payload, null, 2), recordCount };
}

export interface BackupInspection {
  valid: boolean;
  version?: number;
  integrityStatus: 'verified' | 'unchecked' | 'mismatch';
  exportedAt?: string;
  recordCount: number;
  duplicateIdsCount: number;
  diffWarning?: string;
  summary: {
    accounts: number;
    transactions: number;
    categories: number;
    ledgers: number;
    diaryEntries: number;
    attachments: number;
  };
  currentSummary: {
    accounts: number;
    transactions: number;
    categories: number;
    ledgers: number;
    diaryEntries: number;
    attachments: number;
  };
  parsedData?: Record<string, unknown[]>;
  error?: string;
}

export async function inspectBackupFile(rawText: string): Promise<BackupInspection> {
  const emptySummary = { accounts: 0, transactions: 0, categories: 0, ledgers: 0, diaryEntries: 0, attachments: 0 };
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || parsed.app !== 'KeHoachThuChi' || !parsed.data) {
      return {
        valid: false,
        integrityStatus: 'unchecked',
        recordCount: 0,
        duplicateIdsCount: 0,
        summary: emptySummary,
        currentSummary: emptySummary,
        error: 'Tệp không đúng định dạng sao lưu của Kế Hoạch Thu Chi.',
      };
    }

    const version = Number(parsed.version ?? 1);
    if (version > 2) {
      return {
        valid: false,
        version,
        integrityStatus: 'unchecked',
        recordCount: 0,
        duplicateIdsCount: 0,
        summary: emptySummary,
        currentSummary: emptySummary,
        error: `Phiên bản bản sao lưu (v${version}) mới hơn phiên bản ứng dụng hiện tại.`,
      };
    }

    const d = parsed.data;
    let integrityStatus: 'verified' | 'unchecked' | 'mismatch' = 'unchecked';
    if (parsed.integritySha256) {
      try {
        const computed = await sha256Hex(JSON.stringify(d));
        integrityStatus = computed === parsed.integritySha256 ? 'verified' : 'mismatch';
      } catch {
        integrityStatus = 'unchecked';
      }
    }

    if (integrityStatus === 'mismatch') {
      return {
        valid: false,
        version,
        integrityStatus,
        recordCount: 0,
        duplicateIdsCount: 0,
        summary: emptySummary,
        currentSummary: emptySummary,
        error: 'Kiểm tra toàn vẹn SHA-256 thất bại: Tệp sao lưu đã bị sửa đổi hoặc hỏng.',
      };
    }

    const [
      existingTxIds,
      existingAccIds,
      existingCatIds,
      curAccCount,
      curTxCount,
      curCatCount,
      curLedgerCount,
      curDiaryCount,
      curAttCount,
    ] = await Promise.all([
      db.transactions.toCollection().primaryKeys() as Promise<string[]>,
      db.financialAccounts.toCollection().primaryKeys() as Promise<string[]>,
      db.categories.toCollection().primaryKeys() as Promise<string[]>,
      db.financialAccounts.count(),
      db.transactions.count(),
      db.categories.count(),
      db.customLedgers.count(),
      db.diaryEntries.count(),
      db.attachments.count(),
    ]);

    const txSet = new Set(existingTxIds);
    const accSet = new Set(existingAccIds);
    const catSet = new Set(existingCatIds);

    let dupCount = 0;
    for (const item of d.transactions || []) if (txSet.has(item.id)) dupCount++;
    for (const item of d.financialAccounts || []) if (accSet.has(item.id)) dupCount++;
    for (const item of d.categories || []) if (catSet.has(item.id)) dupCount++;

    const summary = {
      accounts: (d.financialAccounts || []).length,
      transactions: (d.transactions || []).length,
      categories: (d.categories || []).length,
      ledgers: (d.customLedgers || []).length,
      diaryEntries: (d.diaryEntries || []).length,
      attachments: (d.attachments || []).length,
    };

    const currentSummary = {
      accounts: curAccCount,
      transactions: curTxCount,
      categories: curCatCount,
      ledgers: curLedgerCount,
      diaryEntries: curDiaryCount,
      attachments: curAttCount,
    };

    const hasDifferences =
      curTxCount !== summary.transactions ||
      curAccCount !== summary.accounts ||
      curLedgerCount !== summary.ledgers ||
      curDiaryCount !== summary.diaryEntries ||
      curAttCount !== summary.attachments;

    const diffWarning =
      hasDifferences && curTxCount > 0
        ? `Dữ liệu trên thiết bị hiện có (${curTxCount} giao dịch, ${curAccCount} tài khoản, ${curAttCount} ảnh) khác với bản sao lưu (${summary.transactions} giao dịch, ${summary.accounts} tài khoản, ${summary.attachments} ảnh). Chọn "Gộp thêm" nếu muốn giữ dữ liệu hiện tại, hoặc "Ghi đè" nếu muốn thay thế toàn bộ.`
        : undefined;

    const recordCount = Object.values(d).reduce((acc: number, v: unknown) => acc + (Array.isArray(v) ? v.length : 0), 0);

    return {
      valid: true,
      version,
      integrityStatus,
      exportedAt: parsed.exportedAt,
      recordCount,
      duplicateIdsCount: dupCount,
      diffWarning,
      summary,
      currentSummary,
      parsedData: d,
    };
  } catch {
    return {
      valid: false,
      integrityStatus: 'unchecked',
      recordCount: 0,
      duplicateIdsCount: 0,
      summary: emptySummary,
      currentSummary: emptySummary,
      error: 'Không thể đọc nội dung JSON của tệp sao lưu.',
    };
  }
}

export async function restoreBackupData(
  data: Record<string, any[]>,
  mode: 'overwrite' | 'merge_skip_duplicates'
): Promise<number> {
  let restored = 0;
  await db.transaction(
    'rw',
    [
      db.financialAccounts,
      db.transactions,
      db.categories,
      db.budgets,
      db.budgetCategories,
      db.transfers,
      db.savings,
      db.loansGiven,
      db.loansTaken,
      db.loanRepayments,
      db.specialItems,
      db.financialEvents,
      db.customLedgers,
      db.ledgerTransactions,
      db.diaryEntries,
      db.attachments,
      db.userSettings,
      db.quickInputAliases,
      db.balanceAdjustments,
    ],
    async () => {
      const tableMap: Array<[string, Table<any, string>]> = [
        ['financialAccounts', db.financialAccounts],
        ['transactions', db.transactions],
        ['categories', db.categories],
        ['budgets', db.budgets],
        ['budgetCategories', db.budgetCategories],
        ['transfers', db.transfers],
        ['savings', db.savings],
        ['loansGiven', db.loansGiven],
        ['loansTaken', db.loansTaken],
        ['loanRepayments', db.loanRepayments],
        ['specialItems', db.specialItems],
        ['financialEvents', db.financialEvents],
        ['customLedgers', db.customLedgers],
        ['ledgerTransactions', db.ledgerTransactions],
        ['diaryEntries', db.diaryEntries],
        ['attachments', db.attachments],
        ['userSettings', db.userSettings],
        ['quickInputAliases', db.quickInputAliases],
        ['balanceAdjustments', db.balanceAdjustments],
      ];

      if (mode === 'overwrite') {
        for (const [key, table] of tableMap) {
          await table.clear();
          const items = Array.isArray(data[key]) ? data[key] : [];
          if (items.length > 0) {
            await table.bulkPut(items);
            restored += items.length;
          }
        }
      } else {
        for (const [key, table] of tableMap) {
          const items = Array.isArray(data[key]) ? data[key] : [];
          if (items.length === 0) continue;
          const existingKeys = new Set((await table.toCollection().primaryKeys()) as string[]);
          const newItems = items.filter((item) => item && item.id && !existingKeys.has(item.id));
          if (newItems.length > 0) {
            await table.bulkAdd(newItems);
            restored += newItems.length;
          }
        }
      }
    }
  );
  return restored;
}

export async function estimateStorageUsage(): Promise<{
  usedBytes: number;
  quotaBytes: number;
  totalRecords: number;
  dataBytes: number;
  attachmentBytes: number;
  attachmentCount: number;
}> {
  let usedBytes = 0;
  let quotaBytes = 0;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      usedBytes = est.usage ?? 0;
      quotaBytes = est.quota ?? 0;
    } catch {
      // ignore
    }
  }
  const [
    txs,
    accs,
    cats,
    atts,
    ledgers,
    lTxs,
    diaries,
    savCount,
    lgCount,
    ltCount,
  ] = await Promise.all([
    db.transactions.toArray(),
    db.financialAccounts.toArray(),
    db.categories.toArray(),
    db.attachments.toArray(),
    db.customLedgers.toArray(),
    db.ledgerTransactions.toArray(),
    db.diaryEntries.toArray(),
    db.savings.count(),
    db.loansGiven.count(),
    db.loansTaken.count(),
  ]);

  const totalRecords =
    txs.length +
    accs.length +
    cats.length +
    atts.length +
    ledgers.length +
    lTxs.length +
    diaries.length +
    savCount +
    lgCount +
    ltCount;

  const attachmentBytes = atts.reduce((sum, a) => sum + (a.sizeBytes || a.dataUrl.length), 0);
  const dataBytes = new Blob([
    JSON.stringify({ txs, accs, cats, ledgers, lTxs, diaries }),
  ]).size;

  return {
    usedBytes,
    quotaBytes,
    totalRecords,
    dataBytes,
    attachmentBytes,
    attachmentCount: atts.length,
  };
}

export function getDefaultNewAccountPayload(name: string, type: 'cash' | 'bank' | 'ewallet', initialBalance: number): FinancialAccount {
  const now = new Date().toISOString();
  return {
    id: uid('acc'),
    name,
    type,
    sticker: type === 'cash' ? '💵' : type === 'ewallet' ? '👛' : '🏦',
    color: type === 'cash' ? '#20B889' : type === 'ewallet' ? '#D82D8B' : '#1D6FD8',
    initialBalance: Math.round(initialBalance),
    isActive: true,
    isHidden: false,
    sortOrder: 99,
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyTransactionDraft(type: 'income' | 'expense' = 'expense'): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    type,
    amount: 0,
    categoryId: '',
    accountId: '',
    date: getTodayVN(),
    time: getCurrentTimeVN(),
    session: '',
    sourceOrRecipient: '',
    note: '',
    attachmentIds: [],
    status: 'completed',
  };
}
