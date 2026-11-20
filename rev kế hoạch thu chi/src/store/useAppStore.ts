import { create } from 'zustand';
import {
  calculateAccountBalance,
  db,
  DEFAULT_SETTINGS,
  ensureSeedDefaults,
  getOrCreateDeviceId,
  getOrInitSyncMeta,
  queueDeleteChanges,
  queueUpsertChanges,
  seedStarterAccounts,
} from '../db/database';
import {
  AppSection,
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
  SyncConnectionStatus,
  SyncEntityType,
  SyncMetaRecord,
  Transaction,
  Transfer,
  UserProfile,
  UserSettings,
} from '../types/finance';
import { generateSalt, hashSecret, verifySecret } from '../utils/crypto';
import { createGoogleDriveAppDataTransport } from '../utils/driveAppData';
import { getCurrentMonthKeyVN, getTodayVN, uid } from '../utils/format';
import {
  clearCachedGoogleAccessToken,
  getCachedGoogleAccessToken,
  initGoogleAuthListener,
  signInWithGoogleDrive,
  signOutGoogleDrive,
} from '../utils/googleAuth';
import {
  clearLocalFinancialDataForAccountSwitch,
  resolveStoredSyncConflict,
  runFullTwoWaySync,
  setMemorySyncPassphrase,
  SyncRunResult,
} from '../utils/syncOrchestrator';

const SESSION_KEY = 'khtc_active_profile_id';
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let googleAuthUnsubscribe: (() => void) | null = null;

function stampSyncMeta<T extends { version?: number }>(existing?: T) {
  return {
    version: (existing?.version ?? 0) + 1,
    deviceId: getOrCreateDeviceId(),
    syncStatus: 'pending' as const,
  };
}

function computeSyncStatus(params: {
  profile: UserProfile | null;
  isSyncing: boolean;
  conflictsCount: number;
  hasToken: boolean;
  meta: SyncMetaRecord | null;
}): SyncConnectionStatus {
  if (!params.profile?.googleUid) return 'local_only';
  if (params.isSyncing) return 'syncing';
  if (params.conflictsCount > 0) return 'conflict';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (!params.hasToken) return 'auth_expired';
  if (params.meta?.lastSyncError) return 'error';
  return 'connected';
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'error' | 'info';
  mascot?: 'happy' | 'celebrating' | 'worried';
}

interface AppState {
  isInitialized: boolean;
  isLoading: boolean;
  activeProfile: UserProfile | null;
  isLocked: boolean;
  activeSection: AppSection;
  previousSection: AppSection;
  selectedMonthKey: string;
  toasts: ToastMessage[];

  // Modals / Global quick actions
  txModalOpen: boolean;
  txModalInitialType: 'income' | 'expense';
  editingTransaction: Transaction | null;
  transferModalOpen: boolean;
  voiceModalOpen: boolean;
  ocrModalOpen: boolean;

  // Data slices
  settings: UserSettings;
  accounts: FinancialAccount[];
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
  budgets: Budget[];
  budgetCategories: BudgetCategory[];
  savings: SavingBook[];
  loansGiven: LoanGiven[];
  loansTaken: LoanTaken[];
  loanRepayments: LoanRepayment[];
  specialItems: SpecialTrackedItem[];
  financialEvents: FinancialEvent[];
  customLedgers: CustomLedger[];
  ledgerTransactions: LedgerTransaction[];
  diaryEntries: DiaryEntry[];
  attachments: Attachment[];
  aliases: QuickInputAlias[];
  balanceAdjustments: BalanceAdjustment[];
  backupHistory: BackupHistory[];

  // Sync State
  syncMeta: SyncMetaRecord | null;
  syncQueueCount: number;
  syncPendingAttachmentCount: number;
  syncConflicts: SyncConflict[];
  syncStatus: SyncConnectionStatus;
  isSyncing: boolean;
  googleTokenActive: boolean;
  conflictModalOpen: boolean;

  // Actions
  initApp: () => Promise<void>;
  refreshAllData: () => Promise<void>;
  refreshSyncStatus: () => Promise<void>;
  setActiveSection: (section: AppSection) => void;
  goBackSection: () => void;
  setSelectedMonthKey: (monthKey: string) => void;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;

  // Modal controls
  openTxModal: (type?: 'income' | 'expense', editing?: Transaction | null) => void;
  closeTxModal: () => void;
  setTransferModalOpen: (open: boolean) => void;
  setVoiceModalOpen: (open: boolean) => void;
  setOcrModalOpen: (open: boolean) => void;
  setConflictModalOpen: (open: boolean) => void;

  // Auth, Google Linking & Lock
  registerProfile: (params: {
    identifier: string;
    displayName: string;
    password: string;
    pin?: string;
    remember: boolean;
    starterBalances?: Partial<Record<string, number>>;
  }) => Promise<{ ok: boolean; error?: string }>;
  loginProfile: (params: {
    identifier: string;
    secret: string;
    mode: 'password' | 'pin';
    remember: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  loginWithGoogle: (params?: { remember?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  linkGoogleAccount: () => Promise<{ ok: boolean; error?: string }>;
  reauthorizeGoogle: () => Promise<{ ok: boolean; error?: string }>;
  disconnectGoogleAccount: () => Promise<void>;
  syncNow: (options?: { silent?: boolean; passphrase?: string }) => Promise<SyncRunResult>;
  resolveSyncConflict: (conflictId: string, choice: 'local' | 'remote' | 'latest') => Promise<void>;
  setSyncPassphrase: (passphrase?: string) => Promise<void>;
  unlockWithSecret: (secret: string, mode: 'password' | 'pin') => Promise<boolean>;
  lockApp: () => void;
  logout: () => void;
  updatePasswordOrPin: (params: { newPassword?: string; newPin?: string; clearPin?: boolean }) => Promise<void>;

  // Settings
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;

  // Accounts & Adjustments & Transfers
  saveAccount: (acc: Omit<FinancialAccount, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  adjustAccountBalance: (accountId: string, newBalance: number, reason: string) => Promise<void>;
  deleteOrDeactivateAccount: (accountId: string, mode: 'deactivate' | 'delete') => Promise<{ ok: boolean; error?: string }>;
  addTransfer: (payload: Omit<Transfer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  deleteTransfer: (id: string) => Promise<void>;

  // Transactions
  addTransaction: (
    payload: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
    newAttachments?: Array<{ dataUrl: string; fileName: string; mimeType: string; sizeBytes: number }>
  ) => Promise<Transaction>;
  updateTransaction: (
    id: string,
    patch: Partial<Transaction>,
    newAttachments?: Array<{ dataUrl: string; fileName: string; mimeType: string; sizeBytes: number }>
  ) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  // Categories & Aliases
  saveCategory: (cat: Omit<Category, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteCategoryWithReassign: (categoryId: string, reassignToId?: string) => Promise<{ ok: boolean; error?: string }>;
  saveAlias: (alias: string, targetType: 'account' | 'category', targetId: string) => Promise<void>;
  deleteAlias: (id: string) => Promise<void>;

  // Budgets
  upsertMonthlyBudget: (monthKey: string, totalLimit: number, note?: string) => Promise<void>;
  upsertCategoryBudget: (monthKey: string, categoryId: string, limitAmount: number) => Promise<void>;
  deleteCategoryBudget: (id: string) => Promise<void>;

  // Savings, Loans, Special Items
  saveSavingBook: (item: Omit<SavingBook, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, attachmentFile?: { dataUrl: string; fileName: string; mimeType: string; sizeBytes: number }) => Promise<void>;
  deleteSavingBook: (id: string) => Promise<void>;

  saveLoanGiven: (item: Omit<LoanGiven, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteLoanGiven: (id: string) => Promise<void>;
  saveLoanTaken: (item: Omit<LoanTaken, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteLoanTaken: (id: string) => Promise<void>;
  recordLoanRepayment: (params: {
    loanId: string;
    loanKind: 'given' | 'taken';
    amountPrincipal: number;
    amountInterest: number;
    date: string;
    note: string;
    reflectToAccountId?: string;
  }) => Promise<void>;

  saveSpecialItem: (item: Omit<SpecialTrackedItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteSpecialItem: (id: string) => Promise<void>;

  // Events
  saveEvent: (ev: Omit<FinancialEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  // Custom Ledgers & Diary
  saveCustomLedger: (ledger: Omit<CustomLedger, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<string>;
  deleteCustomLedger: (id: string) => Promise<void>;
  addLedgerTransaction: (
    tx: Omit<LedgerTransaction, 'id' | 'createdAt' | 'updatedAt'>,
    attachmentFile?: { dataUrl: string; fileName: string; mimeType: string; sizeBytes: number }
  ) => Promise<void>;
  deleteLedgerTransaction: (id: string) => Promise<void>;
  reflectLedgerTxToMainAccount: (ledgerTxId: string, accountId: string, categoryId: string) => Promise<void>;

  saveDiaryEntry: (
    entry: Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    newAttachments?: Array<{ dataUrl: string; fileName: string; mimeType: string; sizeBytes: number }>
  ) => Promise<void>;
  deleteDiaryEntry: (id: string) => Promise<void>;

  // Data Management & Backups
  logBackupEvent: (fileName: string, recordCount: number, sizeBytes: number, backupType: 'export' | 'import') => Promise<void>;
  deleteTransactionsInRange: (fromDate: string, toDate: string) => Promise<number>;
  clearAllTransactionsOnly: () => Promise<void>;
  wipeAllLocalData: () => Promise<void>;

  // Computed helpers
  getAccountBalance: (accountId: string) => number;
  getTotalActiveBalance: () => number;
}

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  isLoading: true,
  activeProfile: null,
  isLocked: false,
  activeSection: 'overview',
  previousSection: 'overview',
  selectedMonthKey: getCurrentMonthKeyVN(),
  toasts: [],

  txModalOpen: false,
  txModalInitialType: 'expense',
  editingTransaction: null,
  transferModalOpen: false,
  voiceModalOpen: false,
  ocrModalOpen: false,

  settings: DEFAULT_SETTINGS,
  accounts: [],
  categories: [],
  transactions: [],
  transfers: [],
  budgets: [],
  budgetCategories: [],
  savings: [],
  loansGiven: [],
  loansTaken: [],
  loanRepayments: [],
  specialItems: [],
  financialEvents: [],
  customLedgers: [],
  ledgerTransactions: [],
  diaryEntries: [],
  attachments: [],
  aliases: [],
  balanceAdjustments: [],
  backupHistory: [],

  syncMeta: null,
  syncQueueCount: 0,
  syncPendingAttachmentCount: 0,
  syncConflicts: [],
  syncStatus: 'local_only',
  isSyncing: false,
  googleTokenActive: false,
  conflictModalOpen: false,

  initApp: async () => {
    set({ isLoading: true });
    await ensureSeedDefaults();
    await getOrInitSyncMeta();
    await get().refreshAllData();

    const profiles = await db.userProfiles.toArray();
    const savedId = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    const settings = get().settings;

    let activeProfile: UserProfile | null = null;
    if (savedId) {
      activeProfile = profiles.find((p) => p.id === savedId) ?? null;
    } else if (profiles.length === 1 && settings.rememberSession) {
      activeProfile = profiles[0];
    }

    const isLocked = Boolean(activeProfile && settings.appLockEnabled);
    set({
      activeProfile,
      isLocked,
      isInitialized: true,
      isLoading: false,
    });

    await get().refreshSyncStatus();

    if (!googleAuthUnsubscribe) {
      googleAuthUnsubscribe = initGoogleAuthListener((_gUser, hasToken) => {
        set({ googleTokenActive: hasToken });
        void get().refreshSyncStatus();
      });
    }
  },

  refreshAllData: async () => {
    const [
      settingsRow,
      accounts,
      categories,
      transactions,
      transfers,
      budgets,
      budgetCategories,
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
      aliases,
      balanceAdjustments,
      backupHistory,
    ] = await Promise.all([
      db.userSettings.get('default'),
      db.financialAccounts.orderBy('sortOrder').toArray(),
      db.categories.orderBy('sortOrder').toArray(),
      db.transactions.toArray(),
      db.transfers.toArray(),
      db.budgets.toArray(),
      db.budgetCategories.toArray(),
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
      db.quickInputAliases.toArray(),
      db.balanceAdjustments.toArray(),
      db.backupHistory.orderBy('createdAt').reverse().toArray(),
    ]);

    set({
      settings: settingsRow ?? DEFAULT_SETTINGS,
      accounts,
      categories,
      transactions: transactions.sort((a, b) => {
        const cmp = (b.date || '').localeCompare(a.date || '');
        if (cmp !== 0) return cmp;
        const tCmp = (b.time || '').localeCompare(a.time || '');
        if (tCmp !== 0) return tCmp;
        return b.createdAt.localeCompare(a.createdAt);
      }),
      transfers: transfers.sort((a, b) => b.date.localeCompare(a.date)),
      budgets,
      budgetCategories,
      savings,
      loansGiven,
      loansTaken,
      loanRepayments,
      specialItems,
      financialEvents,
      customLedgers,
      ledgerTransactions,
      diaryEntries: diaryEntries.sort((a, b) => b.date.localeCompare(a.date)),
      attachments,
      aliases,
      balanceAdjustments: balanceAdjustments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      backupHistory,
    });
    await get().refreshSyncStatus();
  },

  refreshSyncStatus: async () => {
    const [meta, queueItems, conflicts] = await Promise.all([
      getOrInitSyncMeta(),
      db.syncQueue.toArray(),
      db.syncConflicts.toArray(),
    ]);
    const hasToken = Boolean(getCachedGoogleAccessToken());
    const pendingAttCount = queueItems.filter((q) => q.entityType === 'attachments').length;
    const status = computeSyncStatus({
      profile: get().activeProfile,
      isSyncing: get().isSyncing,
      conflictsCount: conflicts.length,
      hasToken,
      meta,
    });
    set({
      syncMeta: meta,
      syncQueueCount: queueItems.length,
      syncPendingAttachmentCount: pendingAttCount,
      syncConflicts: conflicts,
      syncStatus: status,
      googleTokenActive: hasToken,
    });
  },

  setActiveSection: (section) => {
    const curr = get().activeSection;
    if (curr !== section) {
      set({ previousSection: curr, activeSection: section });
    }
  },

  goBackSection: () => {
    const prev = get().previousSection;
    const curr = get().activeSection;
    set({ activeSection: prev, previousSection: curr });
  },

  setSelectedMonthKey: (monthKey) => set({ selectedMonthKey: monthKey }),

  pushToast: (toast) => {
    const id = uid('toast');
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 4500);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  openTxModal: (type = 'expense', editing = null) =>
    set({ txModalOpen: true, txModalInitialType: type, editingTransaction: editing }),

  closeTxModal: () => set({ txModalOpen: false, editingTransaction: null }),
  setTransferModalOpen: (open) => set({ transferModalOpen: open }),
  setVoiceModalOpen: (open) => set({ voiceModalOpen: open }),
  setOcrModalOpen: (open) => set({ ocrModalOpen: open }),
  setConflictModalOpen: (open) => set({ conflictModalOpen: open }),

  registerProfile: async ({ identifier, displayName, password, pin, remember, starterBalances }) => {
    const cleanId = identifier.trim();
    if (!cleanId) return { ok: false, error: 'Vui lòng nhập email hoặc số điện thoại định danh cục bộ.' };
    if (password.length < 4) return { ok: false, error: 'Mật khẩu cần tối thiểu 4 ký tự.' };
    if (pin && !/^\d{4,6}$/.test(pin)) return { ok: false, error: 'Mã PIN gồm 4 đến 6 chữ số.' };

    const existing = await db.userProfiles.where('identifier').equalsIgnoreCase(cleanId).first();
    if (existing) {
      return { ok: false, error: 'Hồ sơ với email/số điện thoại này đã tồn tại trên thiết bị.' };
    }

    const salt = generateSalt();
    const passwordHash = await hashSecret(password, salt);
    const pinHash = pin ? await hashSecret(pin, salt) : undefined;
    const now = new Date().toISOString();

    const profile: UserProfile = {
      id: uid('user'),
      identifier: cleanId,
      displayName: displayName.trim() || cleanId,
      passwordHash,
      pinHash,
      salt,
      createdAt: now,
      updatedAt: now,
    };

    await db.userProfiles.put({ ...profile, authProvider: 'local' });
    await seedStarterAccounts(starterBalances);
    await get().updateSettings({ rememberSession: remember });

    if (remember) {
      localStorage.setItem(SESSION_KEY, profile.id);
    } else {
      sessionStorage.setItem(SESSION_KEY, profile.id);
    }

    await get().refreshAllData();
    set({ activeProfile: { ...profile, authProvider: 'local' }, isLocked: false });
    get().pushToast({
      title: `Chào mừng ${profile.displayName}!`,
      description: 'Hồ sơ cục bộ đã sẵn sàng. Liên kết Google trong Cài đặt để đồng bộ đa thiết bị.',
      tone: 'success',
      mascot: 'celebrating',
    });
    return { ok: true };
  },

  loginProfile: async ({ identifier, secret, mode, remember }) => {
    const profiles = await db.userProfiles.toArray();
    const target = profiles.find((p) => p.identifier.toLowerCase() === identifier.trim().toLowerCase());
    if (!target) {
      return { ok: false, error: 'Không tìm thấy hồ sơ trên thiết bị này.' };
    }

    const expected = mode === 'pin' ? target.pinHash : target.passwordHash;
    if (!expected) {
      return { ok: false, error: 'Hồ sơ này chưa thiết lập mã PIN.' };
    }

    const valid = await verifySecret(secret, target.salt, expected);
    if (!valid) {
      return { ok: false, error: mode === 'pin' ? 'Mã PIN không đúng.' : 'Mật khẩu không đúng.' };
    }

    await get().updateSettings({ rememberSession: remember });
    if (remember) {
      localStorage.setItem(SESSION_KEY, target.id);
    } else {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.setItem(SESSION_KEY, target.id);
    }

    await get().refreshAllData();
    set({ activeProfile: target, isLocked: false });
    if (!target.googleUid) {
      get().pushToast({
        title: 'Đang dùng chế độ lưu cục bộ',
        description: 'Dữ liệu hiện chỉ lưu trên thiết bị này. Bạn có thể liên kết Google trong Cài đặt.',
        tone: 'info',
      });
    }
    return { ok: true };
  },

  loginWithGoogle: async ({ remember = true } = {}) => {
    try {
      const { user } = await signInWithGoogleDrive({ forceConsent: false });
      const profiles = await db.userProfiles.toArray();
      const meta = await getOrInitSyncMeta();

      // Strict identity check: only match profile explicitly linked by googleUid (never auto-merge unverified email!)
      let target = profiles.find((p) => p.googleUid === user.uid);

      // If this browser currently stores data synced to a DIFFERENT Google UID, isolate cleanly before restoring!
      if (meta.ownerGoogleUid && meta.ownerGoogleUid !== user.uid) {
        await clearLocalFinancialDataForAccountSwitch();
        await ensureSeedDefaults();
        await getOrInitSyncMeta();
      } else if (!meta.ownerGoogleUid && !target) {
        // Check if existing local unlinked profile has data (e.g. from another local user)
        const existingTxCount = await db.transactions.count();
        if (existingTxCount > 0 && profiles.some((p) => !p.googleUid)) {
          // Do not mix an unlinked local profile's transactions into a Google account without explicit linking
          await clearLocalFinancialDataForAccountSwitch();
          await ensureSeedDefaults();
          await getOrInitSyncMeta();
        }
      }

      const now = new Date().toISOString();
      if (!target) {
        const salt = generateSalt();
        target = {
          id: `user_google_${user.uid}`,
          identifier: user.email,
          displayName: user.displayName,
          passwordHash: await hashSecret(uid('gpw'), salt),
          salt,
          authProvider: 'google',
          googleUid: user.uid,
          googleEmail: user.email,
          googlePhotoUrl: user.photoURL,
          googleLinkedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        await db.userProfiles.put(target);
      } else {
        target = {
          ...target,
          displayName: user.displayName || target.displayName,
          googleEmail: user.email,
          googlePhotoUrl: user.photoURL,
          updatedAt: now,
        };
        await db.userProfiles.put(target);
      }

      if (remember) {
        localStorage.setItem(SESSION_KEY, target.id);
      } else {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.setItem(SESSION_KEY, target.id);
      }

      set({ activeProfile: target, isLocked: false, googleTokenActive: true });

      // Pull from Google Drive appDataFolder (and create starter wallets only if both remote & local are empty)
      const syncResult = await get().syncNow({ silent: true });
      const accCount = await db.financialAccounts.count();
      if (accCount === 0) {
        await seedStarterAccounts();
        await get().refreshAllData();
        // Push initial starter accounts to Drive if connected
        await get().syncNow({ silent: true });
      } else {
        await get().refreshAllData();
      }

      if (syncResult.ok && syncResult.pulledFromDrive) {
        get().pushToast({
          title: `Đã đăng nhập & đồng bộ (${user.email})`,
          description: 'Dữ liệu tài chính từ Google Drive đã được khôi phục đầy đủ.',
          tone: 'success',
          mascot: 'celebrating',
        });
      } else if (syncResult.ok) {
        get().pushToast({
          title: `Chào mừng ${user.displayName}!`,
          description: 'Tài khoản Google đã liên kết không gian đồng bộ riêng trên Drive.',
          tone: 'success',
          mascot: 'celebrating',
        });
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Đăng nhập Google thất bại.' };
    }
  },

  linkGoogleAccount: async () => {
    const profile = get().activeProfile;
    if (!profile) return { ok: false, error: 'Chưa đăng nhập hồ sơ.' };
    try {
      const { user } = await signInWithGoogleDrive({ forceConsent: true });
      const meta = await getOrInitSyncMeta();
      if (meta.ownerGoogleUid && meta.ownerGoogleUid !== user.uid) {
        return {
          ok: false,
          error: `Thiết bị này đang gắn với tài khoản Google ${meta.ownerGoogleEmail}. Vui lòng ngắt kết nối hoặc đăng xuất trước khi liên kết tài khoản khác.`,
        };
      }

      const now = new Date().toISOString();
      const updated: UserProfile = {
        ...profile,
        googleUid: user.uid,
        googleEmail: user.email,
        googlePhotoUrl: user.photoURL,
        googleLinkedAt: now,
        updatedAt: now,
      };
      await db.userProfiles.put(updated);
      set({ activeProfile: updated, googleTokenActive: true });

      // Queue any existing attachments so they upload cleanly during first sync
      const existingAtts = await db.attachments.toArray();
      await queueUpsertChanges(
        existingAtts.map((a) => ({ entityType: 'attachments' as const, recordId: a.id }))
      );

      const res = await get().syncNow({ silent: false });
      if (res.ok) {
        get().pushToast({
          title: 'Đã liên kết Google thành công!',
          description: `Toàn bộ dữ liệu được mã hóa và đồng bộ với ${user.email}.`,
          tone: 'success',
          mascot: 'celebrating',
        });
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Không thể liên kết tài khoản Google.' };
    }
  },

  reauthorizeGoogle: async () => {
    const profile = get().activeProfile;
    try {
      const { user } = await signInWithGoogleDrive({
        forceConsent: false,
        loginHint: profile?.googleEmail,
      });
      if (profile?.googleUid && profile.googleUid !== user.uid) {
        await clearCachedGoogleAccessToken();
        return {
          ok: false,
          error: `Bạn đã chọn nhầm tài khoản (${user.email}). Vui lòng chọn đúng tài khoản ${profile.googleEmail} hoặc đăng xuất để đổi tài khoản.`,
        };
      }
      set({ googleTokenActive: true });
      await get().syncNow({ silent: false });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Xác thực lại Google thất bại.' };
    }
  },

  disconnectGoogleAccount: async () => {
    const profile = get().activeProfile;
    await signOutGoogleDrive();
    if (profile) {
      const updated: UserProfile = {
        ...profile,
        googleUid: undefined,
        googleEmail: undefined,
        googlePhotoUrl: undefined,
        googleLinkedAt: undefined,
        authProvider: 'local',
        updatedAt: new Date().toISOString(),
      };
      await db.userProfiles.put(updated);
      const meta = await getOrInitSyncMeta();
      await db.syncMeta.put({
        ...meta,
        ownerGoogleUid: undefined,
        ownerGoogleEmail: undefined,
        lastSyncError: undefined,
        lastSyncErrorAction: undefined,
        updatedAt: new Date().toISOString(),
      });
      set({ activeProfile: updated, googleTokenActive: false });
    }
    await get().refreshSyncStatus();
    get().pushToast({
      title: 'Đã ngắt kết nối Google Drive',
      description: 'Dữ liệu hiện có vẫn được giữ nguyên cục bộ trên thiết bị này.',
      tone: 'info',
    });
  },

  syncNow: async (options = {}) => {
    const profile = get().activeProfile;
    if (!profile?.googleUid || !profile.googleEmail) {
      return {
        ok: false,
        pulledFromDrive: false,
        pushedToDrive: false,
        attachmentsUploaded: 0,
        attachmentsDownloaded: 0,
        attachmentFailures: 0,
        conflictsDetected: [],
        errorCode: 'not_linked',
        errorMessage: 'Tài khoản chưa liên kết Google Drive.',
        actionHint: 'Hãy liên kết tài khoản Google trong Cài đặt để bật đồng bộ.',
      };
    }

    if (get().isSyncing) {
      return {
        ok: false,
        pulledFromDrive: false,
        pushedToDrive: false,
        attachmentsUploaded: 0,
        attachmentsDownloaded: 0,
        attachmentFailures: 0,
        conflictsDetected: [],
        errorCode: 'busy',
        errorMessage: 'Đang thực hiện đồng bộ...',
      };
    }

    set({ isSyncing: true, syncStatus: 'syncing' });
    const transport = createGoogleDriveAppDataTransport(async () => getCachedGoogleAccessToken());
    const result = await runFullTwoWaySync({
      googleUid: profile.googleUid,
      googleEmail: profile.googleEmail,
      transport,
      passphrase: options.passphrase,
    });

    set({ isSyncing: false });
    await get().refreshAllData();

    if (result.conflictsDetected.length > 0) {
      set({ conflictModalOpen: true });
      get().pushToast({
        title: `Phát hiện ${result.conflictsDetected.length} xung đột dữ liệu`,
        description: 'Vui lòng chọn phiên bản cần giữ trong hộp thoại xử lý xung đột.',
        tone: 'warning',
        mascot: 'worried',
      });
    } else if (!options.silent) {
      if (result.ok) {
        get().pushToast({
          title: 'Đồng bộ Google Drive thành công',
          description:
            result.attachmentsUploaded + result.attachmentsDownloaded > 0
              ? `Đã đồng bộ dữ liệu và ${result.attachmentsUploaded + result.attachmentsDownloaded} hình ảnh.`
              : 'Dữ liệu trên thiết bị và đám mây đã khớp hoàn toàn.',
          tone: 'success',
          mascot: 'celebrating',
        });
      } else {
        get().pushToast({
          title: result.errorMessage || 'Đồng bộ chưa thành công',
          description: result.actionHint,
          tone: 'warning',
          mascot: 'worried',
        });
      }
    }

    return result;
  },

  resolveSyncConflict: async (conflictId, choice) => {
    await resolveStoredSyncConflict({ conflictId, choice });
    await get().refreshAllData();
    const remaining = get().syncConflicts.length;
    if (remaining === 0) {
      set({ conflictModalOpen: false });
      await get().syncNow({ silent: false });
    }
  },

  setSyncPassphrase: async (passphrase) => {
    setMemorySyncPassphrase(passphrase);
    const meta = await getOrInitSyncMeta();
    await db.syncMeta.put({
      ...meta,
      hasCustomPassphrase: Boolean(passphrase && passphrase.trim().length > 0),
      updatedAt: new Date().toISOString(),
    });
    await get().refreshSyncStatus();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      await get().syncNow({ silent: false, passphrase });
    }
  },

  unlockWithSecret: async (secret, mode) => {
    const profile = get().activeProfile;
    if (!profile) return false;
    const expected = mode === 'pin' ? profile.pinHash : profile.passwordHash;
    if (!expected) return false;
    const ok = await verifySecret(secret, profile.salt, expected);
    if (ok) {
      set({ isLocked: false });
    }
    return ok;
  },

  lockApp: () => {
    if (get().activeProfile) {
      set({ isLocked: true });
    }
  },

  logout: () => {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setMemorySyncPassphrase(undefined);
    void signOutGoogleDrive();
    set({ activeProfile: null, isLocked: false, googleTokenActive: false, syncStatus: 'local_only' });
  },

  updatePasswordOrPin: async ({ newPassword, newPin, clearPin }) => {
    const profile = get().activeProfile;
    if (!profile) return;
    const updated: UserProfile = {
      ...profile,
      passwordHash: newPassword ? await hashSecret(newPassword, profile.salt) : profile.passwordHash,
      pinHash: clearPin ? undefined : newPin ? await hashSecret(newPin, profile.salt) : profile.pinHash,
      updatedAt: new Date().toISOString(),
    };
    await db.userProfiles.put(updated);
    set({ activeProfile: updated });
    get().pushToast({ title: 'Đã cập nhật bảo mật cục bộ', tone: 'success' });
  },

  updateSettings: async (patch) => {
    const prev = get().settings;
    const next: UserSettings = {
      ...prev,
      ...patch,
      ...stampSyncMeta(prev),
      id: 'default',
      updatedAt: new Date().toISOString(),
    };
    await db.userSettings.put(next);
    await queueUpsertChanges([{ entityType: 'userSettings', recordId: 'default' }]);
    set({ settings: next });
    await get().refreshSyncStatus();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => {
        void get().syncNow({ silent: true });
      }, 1500);
    }
  },

  saveAccount: async (acc) => {
    const now = new Date().toISOString();
    const existing = acc.id ? get().accounts.find((a) => a.id === acc.id) : undefined;
    const item: FinancialAccount = {
      id: acc.id || uid('acc'),
      name: acc.name.trim(),
      type: acc.type,
      sticker: acc.sticker,
      color: acc.color,
      initialBalance: Math.round(acc.initialBalance || 0),
      isActive: acc.isActive,
      isHidden: acc.isHidden,
      sortOrder: acc.sortOrder,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    };
    await db.financialAccounts.put(item);
    await queueUpsertChanges([{ entityType: 'financialAccounts', recordId: item.id }]);
    await get().refreshAllData();
    get().pushToast({ title: `Đã lưu tài khoản "${item.name}"`, tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  adjustAccountBalance: async (accountId, newBalance, reason) => {
    const current = get().getAccountBalance(accountId);
    const target = Math.round(newBalance);
    const delta = target - current;
    if (delta === 0) return;

    const now = new Date().toISOString();
    const adj: BalanceAdjustment = {
      id: uid('adj'),
      accountId,
      previousBalance: current,
      newBalance: target,
      delta,
      reason: reason.trim() || 'Điều chỉnh số dư thủ công',
      date: getTodayVN(),
      createdAt: now,
      updatedAt: now,
      ...stampSyncMeta(),
    };
    await db.balanceAdjustments.put(adj);
    await queueUpsertChanges([{ entityType: 'balanceAdjustments', recordId: adj.id }]);
    await get().refreshAllData();
    get().pushToast({
      title: 'Đã điều chỉnh số dư tài khoản',
      description: 'Thay đổi đã được ghi nhận vào lịch sử điều chỉnh.',
      tone: 'success',
    });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteOrDeactivateAccount: async (accountId, mode) => {
    const acc = get().accounts.find((a) => a.id === accountId);
    if (!acc) return { ok: false, error: 'Không tìm thấy tài khoản.' };

    if (mode === 'deactivate') {
      await db.financialAccounts.update(accountId, {
        isActive: !acc.isActive,
        updatedAt: new Date().toISOString(),
        ...stampSyncMeta(acc),
      });
      await queueUpsertChanges([{ entityType: 'financialAccounts', recordId: accountId }]);
      await get().refreshAllData();
      if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
      }
      return { ok: true };
    }

    const usedInTx = get().transactions.some((t) => t.accountId === accountId);
    const usedInTransfer = get().transfers.some((t) => t.fromAccountId === accountId || t.toAccountId === accountId);
    if (usedInTx || usedInTransfer) {
      return {
        ok: false,
        error: 'Tài khoản đã phát sinh giao dịch. Hãy chọn "Ngừng sử dụng" để bảo toàn lịch sử tài chính.',
      };
    }
    await db.financialAccounts.delete(accountId);
    await queueDeleteChanges([{ entityType: 'financialAccounts', recordId: accountId, version: acc.version }]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
    return { ok: true };
  },

  addTransfer: async (payload) => {
    const now = new Date().toISOString();
    const item: Transfer = {
      ...payload,
      id: uid('trf'),
      amount: Math.round(payload.amount),
      createdAt: now,
      updatedAt: now,
      ...stampSyncMeta(),
    };
    await db.transfers.put(item);
    await queueUpsertChanges([{ entityType: 'transfers', recordId: item.id }]);
    await get().refreshAllData();
    get().pushToast({
      title: 'Đã chuyển tiền giữa tài khoản',
      description: 'Tổng số tiền thực tế và ngân sách tháng không bị thay đổi.',
      tone: 'success',
    });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteTransfer: async (id) => {
    const existing = get().transfers.find((t) => t.id === id);
    await db.transfers.delete(id);
    await queueDeleteChanges([{ entityType: 'transfers', recordId: id, version: existing?.version }]);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã xóa lệnh chuyển tiền', tone: 'info' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  addTransaction: async (payload, newAttachments = []) => {
    const now = new Date().toISOString();
    const attachmentIds: string[] = [...(payload.attachmentIds || [])];
    const queueList: Array<{ entityType: SyncEntityType; recordId: string }> = [];

    const tx: Transaction = {
      ...payload,
      id: uid('tx'),
      amount: Math.round(payload.amount),
      attachmentIds,
      createdAt: now,
      updatedAt: now,
      ...stampSyncMeta(),
    };

    await db.transaction('rw', [db.transactions, db.attachments], async () => {
      for (const file of newAttachments) {
        const attId = uid('att');
        await db.attachments.put({
          id: attId,
          dataUrl: file.dataUrl,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          createdAt: now,
          updatedAt: now,
          ...stampSyncMeta(),
        });
        tx.attachmentIds.push(attId);
        queueList.push({ entityType: 'attachments', recordId: attId });
      }
      await db.transactions.put(tx);
      queueList.push({ entityType: 'transactions', recordId: tx.id });
    });

    await queueUpsertChanges(queueList);
    await get().refreshAllData();

    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }

    // Check monthly budget warning if expense
    if (tx.type === 'expense' && tx.date) {
      const mKey = tx.date.slice(0, 7);
      const budget = get().budgets.find((b) => b.monthKey === mKey);
      if (budget && budget.totalLimit > 0) {
        const monthSpent = get()
          .transactions.filter((t) => t.type === 'expense' && t.date.startsWith(mKey))
          .reduce((s, t) => s + t.amount, 0);
        if (monthSpent > budget.totalLimit) {
          get().pushToast({
            title: 'Cảnh báo vượt ngân sách tháng!',
            description: `Bạn đã chi vượt ngân sách tháng ${mKey.slice(5)}/${mKey.slice(0, 4)}.`,
            tone: 'warning',
            mascot: 'worried',
          });
          return tx;
        }
      }
    }

    get().pushToast({
      title: tx.type === 'income' ? 'Đã lưu khoản thu' : 'Đã lưu khoản chi',
      tone: 'success',
      mascot: 'happy',
    });
    return tx;
  },

  updateTransaction: async (id, patch, newAttachments = []) => {
    const existing = get().transactions.find((t) => t.id === id);
    if (!existing) return;
    const now = new Date().toISOString();
    const attachmentIds = [...(patch.attachmentIds ?? existing.attachmentIds)];
    const queueList: Array<{ entityType: SyncEntityType; recordId: string }> = [
      { entityType: 'transactions', recordId: id },
    ];

    await db.transaction('rw', [db.transactions, db.attachments], async () => {
      for (const file of newAttachments) {
        const attId = uid('att');
        await db.attachments.put({
          id: attId,
          dataUrl: file.dataUrl,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          createdAt: now,
          updatedAt: now,
          ...stampSyncMeta(),
        });
        attachmentIds.push(attId);
        queueList.push({ entityType: 'attachments', recordId: attId });
      }
      const updated: Transaction = {
        ...existing,
        ...patch,
        amount: patch.amount !== undefined ? Math.round(patch.amount) : existing.amount,
        attachmentIds,
        updatedAt: now,
        ...stampSyncMeta(existing),
      };
      await db.transactions.put(updated);
    });

    await queueUpsertChanges(queueList);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã cập nhật giao dịch', tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteTransaction: async (id) => {
    const existing = get().transactions.find((t) => t.id === id);
    if (!existing) return;
    const deletes: Array<{ entityType: SyncEntityType; recordId: string; version?: number }> = [
      { entityType: 'transactions', recordId: id, version: existing.version },
    ];
    await db.transaction('rw', [db.transactions, db.attachments], async () => {
      for (const attId of existing.attachmentIds) {
        await db.attachments.delete(attId);
        deletes.push({ entityType: 'attachments', recordId: attId });
      }
      await db.transactions.delete(id);
    });
    await queueDeleteChanges(deletes);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã xóa giao dịch & cập nhật số dư', tone: 'info' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  saveCategory: async (cat) => {
    const now = new Date().toISOString();
    const existing = cat.id ? get().categories.find((c) => c.id === cat.id) : undefined;
    const item: Category = {
      id: cat.id || uid('cat'),
      name: cat.name.trim(),
      type: cat.type,
      sticker: cat.sticker,
      color: cat.color,
      description: cat.description || '',
      isHidden: cat.isHidden,
      sortOrder: cat.sortOrder,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    };
    await db.categories.put(item);
    await queueUpsertChanges([{ entityType: 'categories', recordId: item.id }]);
    await get().refreshAllData();
    get().pushToast({ title: `Đã lưu danh mục "${item.name}"`, tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteCategoryWithReassign: async (categoryId, reassignToId) => {
    const txs = get().transactions.filter((t) => t.categoryId === categoryId);
    if (txs.length > 0 && !reassignToId) {
      return {
        ok: false,
        error: `Danh mục này có ${txs.length} giao dịch. Vui lòng chọn danh mục thay thế để chuyển giao dịch trước khi xóa.`,
      };
    }
    const existingCat = get().categories.find((c) => c.id === categoryId);
    const upserts: Array<{ entityType: SyncEntityType; recordId: string }> = [];
    const deletes: Array<{ entityType: SyncEntityType; recordId: string; version?: number }> = [
      { entityType: 'categories', recordId: categoryId, version: existingCat?.version },
    ];
    await db.transaction('rw', [db.transactions, db.categories, db.budgetCategories], async () => {
      if (txs.length > 0 && reassignToId) {
        for (const t of txs) {
          await db.transactions.update(t.id, {
            categoryId: reassignToId,
            updatedAt: new Date().toISOString(),
            ...stampSyncMeta(t),
          });
          upserts.push({ entityType: 'transactions', recordId: t.id });
        }
      }
      const bCats = await db.budgetCategories.where('categoryId').equals(categoryId).toArray();
      for (const bc of bCats) {
        await db.budgetCategories.delete(bc.id);
        deletes.push({ entityType: 'budgetCategories', recordId: bc.id, version: bc.version });
      }
      await db.categories.delete(categoryId);
    });
    await queueUpsertChanges(upserts);
    await queueDeleteChanges(deletes);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã xóa danh mục an toàn', tone: 'info' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
    return { ok: true };
  },

  saveAlias: async (alias, targetType, targetId) => {
    const now = new Date().toISOString();
    const clean = alias.trim();
    if (!clean) return;
    const existing = get().aliases.find((a) => a.alias.toLowerCase() === clean.toLowerCase());
    const id = existing?.id || uid('alias');
    await db.quickInputAliases.put({
      id,
      alias: clean,
      targetType,
      targetId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    });
    await queueUpsertChanges([{ entityType: 'quickInputAliases', recordId: id }]);
    await get().refreshAllData();
    get().pushToast({ title: `Đã lưu từ viết tắt "${clean}"`, tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteAlias: async (id) => {
    const existing = get().aliases.find((a) => a.id === id);
    await db.quickInputAliases.delete(id);
    await queueDeleteChanges([{ entityType: 'quickInputAliases', recordId: id, version: existing?.version }]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  upsertMonthlyBudget: async (monthKey, totalLimit, note) => {
    const now = new Date().toISOString();
    const existing = get().budgets.find((b) => b.monthKey === monthKey);
    const id = existing?.id || uid('bgt');
    await db.budgets.put({
      id,
      monthKey,
      totalLimit: Math.round(totalLimit),
      note: note ?? existing?.note ?? '',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    });
    await queueUpsertChanges([{ entityType: 'budgets', recordId: id }]);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã cập nhật ngân sách tháng', tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  upsertCategoryBudget: async (monthKey, categoryId, limitAmount) => {
    const now = new Date().toISOString();
    const existing = get().budgetCategories.find(
      (b) => b.monthKey === monthKey && b.categoryId === categoryId
    );
    const id = existing?.id || uid('bcat');
    await db.budgetCategories.put({
      id,
      monthKey,
      categoryId,
      limitAmount: Math.round(limitAmount),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    });
    await queueUpsertChanges([{ entityType: 'budgetCategories', recordId: id }]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteCategoryBudget: async (id) => {
    const existing = get().budgetCategories.find((b) => b.id === id);
    await db.budgetCategories.delete(id);
    await queueDeleteChanges([{ entityType: 'budgetCategories', recordId: id, version: existing?.version }]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  saveSavingBook: async (item, attachmentFile) => {
    const now = new Date().toISOString();
    const existing = item.id ? get().savings.find((s) => s.id === item.id) : undefined;
    let attachmentId = item.attachmentId ?? existing?.attachmentId;
    const id = item.id || uid('sav');
    const upserts: Array<{ entityType: SyncEntityType; recordId: string }> = [
      { entityType: 'savings', recordId: id },
    ];

    await db.transaction('rw', [db.savings, db.attachments], async () => {
      if (attachmentFile) {
        attachmentId = uid('att');
        await db.attachments.put({
          id: attachmentId,
          ...attachmentFile,
          createdAt: now,
          updatedAt: now,
          ...stampSyncMeta(),
        });
        upserts.push({ entityType: 'attachments', recordId: attachmentId });
      }
      await db.savings.put({
        ...item,
        id,
        principalAmount: Math.round(item.principalAmount),
        attachmentId,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        ...stampSyncMeta(existing),
      });
    });

    await queueUpsertChanges(upserts);
    await get().refreshAllData();
    get().pushToast({
      title: 'Đã lưu sổ tiết kiệm',
      description: item.status === 'matured' ? 'Chúc mừng khoản tiết kiệm đáo hạn!' : undefined,
      tone: 'success',
      mascot: item.status === 'matured' ? 'celebrating' : 'happy',
    });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteSavingBook: async (id) => {
    const existing = get().savings.find((s) => s.id === id);
    await db.savings.delete(id);
    await queueDeleteChanges([{ entityType: 'savings', recordId: id, version: existing?.version }]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  saveLoanGiven: async (item) => {
    const now = new Date().toISOString();
    const existing = item.id ? get().loansGiven.find((l) => l.id === item.id) : undefined;
    const id = item.id || uid('lg');
    await db.loansGiven.put({
      ...item,
      id,
      principalAmount: Math.round(item.principalAmount),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    });
    await queueUpsertChanges([{ entityType: 'loansGiven', recordId: id }]);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã lưu sổ cho vay', tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteLoanGiven: async (id) => {
    const existing = get().loansGiven.find((l) => l.id === id);
    const reps = await db.loanRepayments.where('loanId').equals(id).toArray();
    await db.transaction('rw', [db.loansGiven, db.loanRepayments], async () => {
      await db.loanRepayments.where('loanId').equals(id).delete();
      await db.loansGiven.delete(id);
    });
    await queueDeleteChanges([
      { entityType: 'loansGiven', recordId: id, version: existing?.version },
      ...reps.map((r) => ({ entityType: 'loanRepayments' as const, recordId: r.id, version: r.version })),
    ]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  saveLoanTaken: async (item) => {
    const now = new Date().toISOString();
    const existing = item.id ? get().loansTaken.find((l) => l.id === item.id) : undefined;
    const id = item.id || uid('lt');
    await db.loansTaken.put({
      ...item,
      id,
      principalAmount: Math.round(item.principalAmount),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    });
    await queueUpsertChanges([{ entityType: 'loansTaken', recordId: id }]);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã lưu sổ đi vay', tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteLoanTaken: async (id) => {
    const existing = get().loansTaken.find((l) => l.id === id);
    const reps = await db.loanRepayments.where('loanId').equals(id).toArray();
    await db.transaction('rw', [db.loansTaken, db.loanRepayments], async () => {
      await db.loanRepayments.where('loanId').equals(id).delete();
      await db.loansTaken.delete(id);
    });
    await queueDeleteChanges([
      { entityType: 'loansTaken', recordId: id, version: existing?.version },
      ...reps.map((r) => ({ entityType: 'loanRepayments' as const, recordId: r.id, version: r.version })),
    ]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  recordLoanRepayment: async ({
    loanId,
    loanKind,
    amountPrincipal,
    amountInterest,
    date,
    note,
    reflectToAccountId,
  }) => {
    const now = new Date().toISOString();
    const pInt = Math.round(amountPrincipal);
    const iInt = Math.round(amountInterest);
    let linkedTxId: string | undefined;
    const repId = uid('rep');
    const upserts: Array<{ entityType: SyncEntityType; recordId: string }> = [
      { entityType: 'loanRepayments', recordId: repId },
    ];

    await db.transaction(
      'rw',
      [db.loanRepayments, db.loansGiven, db.loansTaken, db.transactions],
      async () => {
        if (reflectToAccountId && pInt + iInt > 0) {
          linkedTxId = uid('tx');
          const catId =
            loanKind === 'given'
              ? get().categories.find((c) => c.type === 'income' && c.name === 'Thu hồi nợ')?.id ||
                get().categories.find((c) => c.type === 'income')?.id ||
                ''
              : get().categories.find((c) => c.type === 'expense' && c.name === 'Khác')?.id ||
                get().categories.find((c) => c.type === 'expense')?.id ||
                '';

          await db.transactions.put({
            id: linkedTxId,
            type: loanKind === 'given' ? 'income' : 'expense',
            amount: pInt + iInt,
            categoryId: catId,
            accountId: reflectToAccountId,
            date,
            time: '',
            session: '',
            note: note || (loanKind === 'given' ? 'Thu hồi khoản cho vay' : 'Thanh toán khoản vay'),
            attachmentIds: [],
            status: 'completed',
            createdAt: now,
            updatedAt: now,
            ...stampSyncMeta(),
          });
          upserts.push({ entityType: 'transactions', recordId: linkedTxId });
        }

        await db.loanRepayments.put({
          id: repId,
          loanId,
          loanKind,
          amountPrincipal: pInt,
          amountInterest: iInt,
          date,
          note,
          linkedAccountId: reflectToAccountId,
          linkedTransactionId: linkedTxId,
          createdAt: now,
          updatedAt: now,
          ...stampSyncMeta(),
        });

        const allRep = await db.loanRepayments.where('loanId').equals(loanId).toArray();
        const totalPrincipalPaid = allRep.reduce((s, r) => s + r.amountPrincipal, 0);

        if (loanKind === 'given') {
          const loan = await db.loansGiven.get(loanId);
          if (loan) {
            const status =
              totalPrincipalPaid >= loan.principalAmount
                ? 'settled'
                : totalPrincipalPaid > 0
                ? 'partial'
                : 'ongoing';
            await db.loansGiven.update(loanId, { status, updatedAt: now, ...stampSyncMeta(loan) });
            upserts.push({ entityType: 'loansGiven', recordId: loanId });
          }
        } else {
          const loan = await db.loansTaken.get(loanId);
          if (loan) {
            const status =
              totalPrincipalPaid >= loan.principalAmount
                ? 'settled'
                : totalPrincipalPaid > 0
                ? 'partial'
                : 'ongoing';
            await db.loansTaken.update(loanId, { status, updatedAt: now, ...stampSyncMeta(loan) });
            upserts.push({ entityType: 'loansTaken', recordId: loanId });
          }
        }
      }
    );

    await queueUpsertChanges(upserts);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã ghi nhận thanh toán công nợ', tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  saveSpecialItem: async (item) => {
    const now = new Date().toISOString();
    const existing = item.id ? get().specialItems.find((x) => x.id === item.id) : undefined;
    const id = item.id || uid('spec');
    await db.specialItems.put({
      ...item,
      id,
      amount: Math.round(item.amount),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    });
    await queueUpsertChanges([{ entityType: 'specialItems', recordId: id }]);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã lưu khoản theo dõi riêng', tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteSpecialItem: async (id) => {
    const existing = get().specialItems.find((x) => x.id === id);
    await db.specialItems.delete(id);
    await queueDeleteChanges([{ entityType: 'specialItems', recordId: id, version: existing?.version }]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  saveEvent: async (ev) => {
    const now = new Date().toISOString();
    const existing = ev.id ? get().financialEvents.find((e) => e.id === ev.id) : undefined;
    const id = ev.id || uid('evt');
    await db.financialEvents.put({
      ...ev,
      id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    });
    await queueUpsertChanges([{ entityType: 'financialEvents', recordId: id }]);
    await get().refreshAllData();
    get().pushToast({ title: `Đã lưu sự kiện "${ev.title}"`, tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteEvent: async (id) => {
    const existing = get().financialEvents.find((e) => e.id === id);
    await db.financialEvents.delete(id);
    await queueDeleteChanges([{ entityType: 'financialEvents', recordId: id, version: existing?.version }]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  saveCustomLedger: async (ledger) => {
    const now = new Date().toISOString();
    const id = ledger.id || uid('ldg');
    const existing = ledger.id ? get().customLedgers.find((l) => l.id === ledger.id) : undefined;
    await db.customLedgers.put({
      ...ledger,
      id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...stampSyncMeta(existing),
    });
    await queueUpsertChanges([{ entityType: 'customLedgers', recordId: id }]);
    await get().refreshAllData();
    get().pushToast({ title: `Đã lưu sổ "${ledger.name}"`, tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
    return id;
  },

  deleteCustomLedger: async (id) => {
    const existing = get().customLedgers.find((l) => l.id === id);
    const ltxs = await db.ledgerTransactions.where('ledgerId').equals(id).toArray();
    await db.transaction('rw', [db.customLedgers, db.ledgerTransactions], async () => {
      await db.ledgerTransactions.where('ledgerId').equals(id).delete();
      await db.customLedgers.delete(id);
    });
    await queueDeleteChanges([
      { entityType: 'customLedgers', recordId: id, version: existing?.version },
      ...ltxs.map((x) => ({ entityType: 'ledgerTransactions' as const, recordId: x.id, version: x.version })),
    ]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  addLedgerTransaction: async (tx, attachmentFile) => {
    const now = new Date().toISOString();
    let attachmentId = tx.attachmentId;
    const ltxId = uid('ltx');
    const upserts: Array<{ entityType: SyncEntityType; recordId: string }> = [
      { entityType: 'ledgerTransactions', recordId: ltxId },
    ];
    await db.transaction('rw', [db.ledgerTransactions, db.attachments], async () => {
      if (attachmentFile) {
        attachmentId = uid('att');
        await db.attachments.put({
          id: attachmentId,
          ...attachmentFile,
          createdAt: now,
          updatedAt: now,
          ...stampSyncMeta(),
        });
        upserts.push({ entityType: 'attachments', recordId: attachmentId });
      }
      await db.ledgerTransactions.put({
        ...tx,
        id: ltxId,
        amount: Math.round(tx.amount),
        attachmentId,
        createdAt: now,
        updatedAt: now,
        ...stampSyncMeta(),
      });
    });
    await queueUpsertChanges(upserts);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã ghi vào sổ riêng (độc lập với sổ chính)', tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteLedgerTransaction: async (id) => {
    const existing = get().ledgerTransactions.find((x) => x.id === id);
    await db.ledgerTransactions.delete(id);
    await queueDeleteChanges([{ entityType: 'ledgerTransactions', recordId: id, version: existing?.version }]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  reflectLedgerTxToMainAccount: async (ledgerTxId, accountId, categoryId) => {
    const ltx = get().ledgerTransactions.find((x) => x.id === ledgerTxId);
    if (!ltx || ltx.reflectedMainTxId) return;
    const ledger = get().customLedgers.find((l) => l.id === ltx.ledgerId);
    const createdTx = await get().addTransaction({
      type: ltx.type === 'contribution' ? 'income' : 'expense',
      amount: ltx.amount,
      categoryId,
      accountId,
      date: ltx.date,
      time: ltx.time,
      session: '',
      note: `[Từ sổ: ${ledger?.name || 'Riêng'}] ${ltx.note || ltx.personOrCategory}`,
      attachmentIds: ltx.attachmentId ? [ltx.attachmentId] : [],
      status: 'completed',
    });
    await db.ledgerTransactions.update(ledgerTxId, {
      reflectedMainTxId: createdTx.id,
      updatedAt: new Date().toISOString(),
      ...stampSyncMeta(ltx),
    });
    await queueUpsertChanges([{ entityType: 'ledgerTransactions', recordId: ledgerTxId }]);
    await get().refreshAllData();
  },

  saveDiaryEntry: async (entry, newAttachments = []) => {
    const now = new Date().toISOString();
    const existing = entry.id ? get().diaryEntries.find((d) => d.id === entry.id) : undefined;
    const attachmentIds = [...(entry.attachmentIds || [])];
    const id = entry.id || uid('dry');
    const upserts: Array<{ entityType: SyncEntityType; recordId: string }> = [
      { entityType: 'diaryEntries', recordId: id },
    ];

    await db.transaction('rw', [db.diaryEntries, db.attachments], async () => {
      for (const file of newAttachments) {
        const attId = uid('att');
        await db.attachments.put({
          id: attId,
          ...file,
          createdAt: now,
          updatedAt: now,
          ...stampSyncMeta(),
        });
        attachmentIds.push(attId);
        upserts.push({ entityType: 'attachments', recordId: attId });
      }
      await db.diaryEntries.put({
        ...entry,
        id,
        attachmentIds,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        ...stampSyncMeta(existing),
      });
    });
    await queueUpsertChanges(upserts);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã lưu nhật ký', tone: 'success' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  deleteDiaryEntry: async (id) => {
    const existing = get().diaryEntries.find((d) => d.id === id);
    await db.diaryEntries.delete(id);
    await queueDeleteChanges([{ entityType: 'diaryEntries', recordId: id, version: existing?.version }]);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  logBackupEvent: async (fileName, recordCount, sizeBytes, backupType) => {
    const now = new Date().toISOString();
    await db.backupHistory.put({
      id: uid('bkp'),
      fileName,
      recordCount,
      sizeBytes,
      backupType,
      createdAt: now,
      updatedAt: now,
    });
    await get().refreshAllData();
  },

  deleteTransactionsInRange: async (fromDate, toDate) => {
    const targets = get().transactions.filter((t) => t.date >= fromDate && t.date <= toDate);
    const deletes: Array<{ entityType: SyncEntityType; recordId: string; version?: number }> = [];
    await db.transaction('rw', [db.transactions, db.attachments], async () => {
      for (const t of targets) {
        deletes.push({ entityType: 'transactions', recordId: t.id, version: t.version });
        for (const attId of t.attachmentIds) {
          await db.attachments.delete(attId);
          deletes.push({ entityType: 'attachments', recordId: attId });
        }
        await db.transactions.delete(t.id);
      }
    });
    await queueDeleteChanges(deletes);
    await get().refreshAllData();
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
    return targets.length;
  },

  clearAllTransactionsOnly: async () => {
    const txs = await db.transactions.toArray();
    const trfs = await db.transfers.toArray();
    const adjs = await db.balanceAdjustments.toArray();
    await db.transaction('rw', [db.transactions, db.transfers, db.balanceAdjustments], async () => {
      await db.transactions.clear();
      await db.transfers.clear();
      await db.balanceAdjustments.clear();
    });
    await queueDeleteChanges([
      ...txs.map((t) => ({ entityType: 'transactions' as const, recordId: t.id, version: t.version })),
      ...trfs.map((t) => ({ entityType: 'transfers' as const, recordId: t.id, version: t.version })),
      ...adjs.map((a) => ({ entityType: 'balanceAdjustments' as const, recordId: a.id, version: a.version })),
    ]);
    await get().refreshAllData();
    get().pushToast({ title: 'Đã xóa toàn bộ lịch sử giao dịch', tone: 'info' });
    if (get().activeProfile?.googleUid && getCachedGoogleAccessToken()) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => void get().syncNow({ silent: true }), 1200);
    }
  },

  wipeAllLocalData: async () => {
    await signOutGoogleDrive();
    setMemorySyncPassphrase(undefined);
    await db.delete();
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    await db.open();
    await ensureSeedDefaults();
    await getOrInitSyncMeta();
    await get().refreshAllData();
    set({ activeProfile: null, isLocked: false, googleTokenActive: false, syncStatus: 'local_only' });
  },

  getAccountBalance: (accountId) => {
    const acc = get().accounts.find((a) => a.id === accountId);
    if (!acc) return 0;
    return calculateAccountBalance(acc, get().transactions, get().transfers, get().balanceAdjustments);
  },

  getTotalActiveBalance: () => {
    const state = get();
    return state.accounts
      .filter((a) => a.isActive && !a.isHidden)
      .reduce(
        (sum, acc) => sum + calculateAccountBalance(acc, state.transactions, state.transfers, state.balanceAdjustments),
        0
      );
  },
}));
