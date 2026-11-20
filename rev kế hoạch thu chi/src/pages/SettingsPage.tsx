import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  Download,
  Edit2,
  FolderCog,
  Image as ImageIcon,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  Unlink,
  Upload,
  Wallet,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AccountModal } from '../components/AccountModal';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import { PWAInstallButton, PWAInstallGuideCard } from '../components/PWAComponents';
import {
  BackupInspection,
  estimateStorageUsage,
  exportFullBackupJSON,
  inspectBackupFile,
  restoreBackupData,
} from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { FinancialAccount, FontSizeScale, TxViewStyle } from '../types/finance';
import { formatDateTimeReadable, formatVND, getTodayVN } from '../utils/format';

const COLOR_THEMES = [
  { name: 'Mint Tươi (Mặc định)', primary: '#20B889' },
  { name: 'Xanh Biển Dịu', primary: '#3B82F6' },
  { name: 'Hồng Đào Pastel', primary: '#EC6B87' },
  { name: 'Tím Oải Hương', primary: '#8B7AE8' },
  { name: 'Cam Mật Ong', primary: '#F59E0B' },
];

export const SettingsPage: React.FC = () => {
  const activeProfile = useAppStore((s) => s.activeProfile);
  const settings = useAppStore((s) => s.settings);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const aliases = useAppStore((s) => s.aliases);
  const backupHistory = useAppStore((s) => s.backupHistory);

  const updateSettings = useAppStore((s) => s.updateSettings);
  const updatePasswordOrPin = useAppStore((s) => s.updatePasswordOrPin);
  const lockApp = useAppStore((s) => s.lockApp);
  const logout = useAppStore((s) => s.logout);
  const saveAlias = useAppStore((s) => s.saveAlias);
  const deleteAlias = useAppStore((s) => s.deleteAlias);
  const logBackupEvent = useAppStore((s) => s.logBackupEvent);
  const refreshAllData = useAppStore((s) => s.refreshAllData);
  const deleteTransactionsInRange = useAppStore((s) => s.deleteTransactionsInRange);
  const clearAllTransactionsOnly = useAppStore((s) => s.clearAllTransactionsOnly);
  const wipeAllLocalData = useAppStore((s) => s.wipeAllLocalData);
  const getAccountBalance = useAppStore((s) => s.getAccountBalance);
  const saveAccount = useAppStore((s) => s.saveAccount);
  const deleteOrDeactivateAccount = useAppStore((s) => s.deleteOrDeactivateAccount);
  const pushToast = useAppStore((s) => s.pushToast);

  // Sync selectors & actions
  const syncMeta = useAppStore((s) => s.syncMeta);
  const syncQueueCount = useAppStore((s) => s.syncQueueCount);
  const syncPendingAttachmentCount = useAppStore((s) => s.syncPendingAttachmentCount);
  const syncConflicts = useAppStore((s) => s.syncConflicts);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const googleTokenActive = useAppStore((s) => s.googleTokenActive);
  const linkGoogleAccount = useAppStore((s) => s.linkGoogleAccount);
  const reauthorizeGoogle = useAppStore((s) => s.reauthorizeGoogle);
  const disconnectGoogleAccount = useAppStore((s) => s.disconnectGoogleAccount);
  const syncNow = useAppStore((s) => s.syncNow);
  const setConflictModalOpen = useAppStore((s) => s.setConflictModalOpen);
  const setSyncPassphrase = useAppStore((s) => s.setSyncPassphrase);

  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [accModalOpen, setAccModalOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<FinancialAccount | null>(null);
  const [accModalMode, setAccModalMode] = useState<'edit' | 'adjust'>('edit');

  // Alias form
  const [newAlias, setNewAlias] = useState('');
  const [aliasTargetType, setAliasTargetType] = useState<'account' | 'category'>('account');
  const [aliasTargetId, setAliasTargetId] = useState('');

  // Security form
  const [newPassword, setNewPassword] = useState('');
  const [newPin, setNewPin] = useState('');

  // Sync UI state
  const [confirmDisconnectGoogle, setConfirmDisconnectGoogle] = useState(false);
  const [showPassphraseBox, setShowPassphraseBox] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  // Backup inspection modal
  const [restorePreview, setRestorePreview] = useState<BackupInspection | null>(null);

  // Storage & destructive ops
  const [storageInfo, setStorageInfo] = useState({
    usedBytes: 0,
    quotaBytes: 0,
    totalRecords: 0,
    dataBytes: 0,
    attachmentBytes: 0,
    attachmentCount: 0,
  });
  const [delFrom, setDelFrom] = useState(getTodayVN().slice(0, 7) + '-01');
  const [delTo, setDelTo] = useState(getTodayVN());
  const [wipeStep, setWipeStep] = useState<0 | 1 | 2>(0);
  const [wipeConfirmText, setWipeConfirmText] = useState('');

  useEffect(() => {
    estimateStorageUsage().then(setStorageInfo);
    if (!aliasTargetId && accounts.length > 0) {
      setAliasTargetId(accounts[0].id);
    }
  }, [accounts, syncMeta?.lastSyncAt, syncQueueCount]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const formatBytesReadable = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleExportBackup = async () => {
    const { json, recordCount } = await exportFullBackupJSON();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const fileName = `KeHoachThuChi_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await logBackupEvent(fileName, recordCount, blob.size, 'export');
    pushToast({
      title: 'Đã xuất bản sao lưu đầy đủ',
      description: `Bao gồm ${recordCount} bản ghi (tài khoản, giao dịch, ảnh, sổ riêng, cài đặt).`,
      tone: 'success',
      mascot: 'celebrating',
    });
  };

  const handlePickRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const inspection = await inspectBackupFile(text);
    setRestorePreview(inspection);
    e.target.value = '';
  };

  const executeRestore = async (mode: 'overwrite' | 'merge_skip_duplicates') => {
    if (!restorePreview?.parsedData) return;
    const count = await restoreBackupData(restorePreview.parsedData, mode);
    await logBackupEvent(`Restore_${mode}.json`, count, 0, 'import');
    await refreshAllData();
    setRestorePreview(null);
    pushToast({
      title: 'Khôi phục dữ liệu thành công',
      description: `Đã nạp ${count} bản ghi vào cơ sở dữ liệu cục bộ.`,
      tone: 'success',
      mascot: 'celebrating',
    });
  };

  const lastExport = backupHistory.find((b) => b.backupType === 'export');

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-[#294D3E] dark:text-emerald-100">Cài đặt chung</h2>
          <p className="text-xs text-slate-500">Tùy chỉnh giao diện, bảo mật cục bộ, danh mục viết tắt và sao lưu</p>
        </div>
        <PWAInstallButton />
      </div>

      {/* 1. Giao diện */}
      <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[#294D3E] dark:text-emerald-100">
          <Palette className="w-4 h-4 text-[#20B889]" />
          <span>1. Giao diện &amp; Hiển thị</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Màu chủ đạo</span>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_THEMES.map((t) => (
                <button
                  key={t.primary}
                  type="button"
                  onClick={() => updateSettings({ primaryColor: t.primary })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
                    settings.primaryColor === t.primary
                      ? 'border-[#294D3E] dark:border-emerald-300 bg-[#F5F8F6] dark:bg-[#0D1713]'
                      : 'border-slate-200 dark:border-emerald-900/40'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.primary }} />
                  <span>{t.name}</span>
                </button>
              ))}
              <input
                type="color"
                value={settings.primaryColor}
                onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                title="Chọn màu tùy ý"
                className="w-8 h-8 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Chế độ Sáng / Tối</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateSettings({ themeMode: 'light' })}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                  settings.themeMode === 'light'
                    ? 'border-[#20B889] bg-[#E9F7EF] text-[#294D3E]'
                    : 'border-slate-200 dark:border-emerald-900/40 text-slate-500'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Sáng</span>
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ themeMode: 'dark' })}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                  settings.themeMode === 'dark'
                    ? 'border-[#20B889] bg-emerald-950 text-emerald-100'
                    : 'border-slate-200 dark:border-emerald-900/40 text-slate-500'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Tối</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Kích thước chữ</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'sm' as FontSizeScale, label: 'Nhỏ' },
                { key: 'md' as FontSizeScale, label: 'Vừa' },
                { key: 'lg' as FontSizeScale, label: 'Lớn' },
              ].map((sz) => (
                <button
                  key={sz.key}
                  type="button"
                  onClick={() => updateSettings({ fontSize: sz.key })}
                  className={`py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                    settings.fontSize === sz.key
                      ? 'border-[#20B889] bg-[#E9F7EF] dark:bg-emerald-950 text-[#294D3E] dark:text-emerald-100'
                      : 'border-slate-200 dark:border-emerald-900/40 text-slate-500'
                  }`}
                >
                  {sz.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Hiển thị danh sách giao dịch</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'detailed' as TxViewStyle, label: 'Đầy đủ chi tiết' },
                { key: 'compact' as TxViewStyle, label: 'Gọn nhẹ' },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => updateSettings({ txViewStyle: st.key })}
                  className={`py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                    settings.txViewStyle === st.key
                      ? 'border-[#20B889] bg-[#E9F7EF] dark:bg-emerald-950 text-[#294D3E] dark:text-emerald-100'
                      : 'border-slate-200 dark:border-emerald-900/40 text-slate-500'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.hideBalances}
              onChange={(e) => updateSettings({ hideBalances: e.target.checked })}
            />
            <span>Ẩn toàn bộ số dư tiền tệ</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enableAnimations}
              onChange={(e) => updateSettings({ enableAnimations: e.target.checked })}
            />
            <span>Bật hiệu ứng chuyển động nhẹ nhàng</span>
          </label>
        </div>
      </section>

      {/* 2. Tài khoản & Bảo mật cục bộ */}
      <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-[#294D3E] dark:text-emerald-100">
            <KeyRound className="w-4 h-4 text-[#20B889]" />
            <span>2. Tài khoản &amp; Bảo mật cục bộ</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={lockApp}
              className="inline-flex items-center gap-1 rounded-xl bg-[#E9F7EF] dark:bg-emerald-950 px-3 py-1.5 text-xs font-bold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Khóa ngay</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-xl border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-xs font-bold text-[#E45F63] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Định danh hồ sơ cục bộ: <strong className="text-[#294D3E] dark:text-emerald-200">{activeProfile?.identifier}</strong> ({activeProfile?.displayName})
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Mật khẩu mới (tối thiểu 4 ký tự)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={async () => {
                if (newPassword.length < 4) return;
                await updatePasswordOrPin({ newPassword });
                setNewPassword('');
              }}
              className="rounded-xl bg-[#20B889] text-white px-3 py-2 text-xs font-bold cursor-pointer"
            >
              Đổi MK
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="Mã PIN mới (4-6 số)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              className="flex-1 rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={async () => {
                if (!/^\d{4,6}$/.test(newPin)) return;
                await updatePasswordOrPin({ newPin });
                setNewPin('');
              }}
              className="rounded-xl bg-[#294D3E] text-white px-3 py-2 text-xs font-bold cursor-pointer"
            >
              Đặt PIN
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.appLockEnabled}
              onChange={(e) => updateSettings({ appLockEnabled: e.target.checked })}
            />
            <span>Yêu cầu mở khóa khi khởi động lại</span>
          </label>
          <div className="flex items-center gap-2">
            <span>Tự động khóa sau không hoạt động:</span>
            <select
              value={settings.autoLockMinutes}
              onChange={(e) => updateSettings({ autoLockMinutes: parseInt(e.target.value, 10) })}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-2.5 py-1 text-xs"
            >
              <option value={0}>Tắt</option>
              <option value={1}>1 phút</option>
              <option value={5}>5 phút</option>
              <option value={15}>15 phút</option>
              <option value={30}>30 phút</option>
            </select>
          </div>
        </div>
      </section>

      {/* ĐỒNG BỘ DỮ LIỆU ĐA THIẾT BỊ */}
      <section className="rounded-3xl bg-white dark:bg-[#13221C] border-2 border-[#20B889]/30 dark:border-emerald-800/60 p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#294D3E] dark:text-emerald-100">
            <Cloud className="w-4 h-4 text-[#20B889]" />
            <span>ĐỒNG BỘ DỮ LIỆU ĐA THIẾT BỊ</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}</span>
            </span>

            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                syncStatus === 'connected'
                  ? 'bg-[#E9F7EF] text-[#20B889] dark:bg-emerald-950/80'
                  : syncStatus === 'syncing'
                  ? 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300'
                  : syncStatus === 'conflict' || syncStatus === 'error'
                  ? 'bg-red-50 text-[#E45F63] dark:bg-red-950/60'
                  : syncStatus === 'auth_expired' || syncStatus === 'offline'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {syncStatus === 'connected' && <CheckCircle2 className="w-3 h-3" />}
              {syncStatus === 'syncing' && <RefreshCw className="w-3 h-3 animate-spin" />}
              {(syncStatus === 'conflict' || syncStatus === 'error' || syncStatus === 'auth_expired') && (
                <AlertTriangle className="w-3 h-3" />
              )}
              {syncStatus === 'local_only' && <CloudOff className="w-3 h-3" />}
              <span>
                {syncStatus === 'connected'
                  ? 'Đã đồng bộ'
                  : syncStatus === 'syncing'
                  ? 'Đang đồng bộ...'
                  : syncStatus === 'conflict'
                  ? `Có ${syncConflicts.length} xung đột`
                  : syncStatus === 'auth_expired'
                  ? 'Cần xác thực lại Google'
                  : syncStatus === 'offline'
                  ? 'Đang lưu cục bộ (chờ mạng)'
                  : syncStatus === 'error'
                  ? 'Lỗi đồng bộ'
                  : 'Chưa liên kết Google'}
              </span>
            </span>
          </div>
        </div>

        {/* Linked Google Account Banner */}
        {activeProfile?.googleUid ? (
          <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] border border-emerald-200/70 dark:border-emerald-900/50 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {activeProfile.googlePhotoUrl ? (
                <img
                  src={activeProfile.googlePhotoUrl}
                  alt={activeProfile.googleEmail || 'Google'}
                  className="w-10 h-10 rounded-full object-cover border border-emerald-200 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#20B889]/15 text-[#20B889] flex items-center justify-center font-bold text-sm shrink-0">
                  G
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#294D3E] dark:text-emerald-100 truncate">
                  Tài khoản Google đang liên kết: {activeProfile.googleEmail}
                </p>
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#20B889] shrink-0" />
                  <span>Mã hóa AES-GCM 256-bit · Lưu riêng tư trong Google Drive AppData</span>
                </p>
              </div>
            </div>

            {!googleTokenActive && (
              <button
                type="button"
                onClick={reauthorizeGoogle}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 text-xs font-bold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Kết nối lại Google</span>
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-100">
              <CloudOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Dữ liệu hiện chỉ được lưu trên thiết bị này</p>
                <p className="text-[11px] opacity-85 mt-0.5">
                  Tài khoản đăng nhập bằng Email/SĐT chưa liên kết Google. Hãy liên kết tài khoản Google để sao lưu tự động lên Drive AppData và dùng chung trên điện thoại, máy tính, tablet.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={linkGoogleAccount}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white px-3.5 py-2 text-xs font-bold cursor-pointer shrink-0"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Liên kết tài khoản Google</span>
            </button>
          </div>
        )}

        {/* Sync Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3 border border-slate-200/70 dark:border-emerald-900/40">
            <span className="text-[11px] text-slate-400">Đồng bộ gần nhất</span>
            <p className="font-bold text-[#294D3E] dark:text-emerald-100 mt-0.5">
              {syncMeta?.lastSyncAt ? formatDateTimeReadable(syncMeta.lastSyncAt) : 'Chưa đồng bộ'}
            </p>
          </div>

          <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3 border border-slate-200/70 dark:border-emerald-900/40">
            <span className="text-[11px] text-slate-400">Thay đổi chờ đồng bộ</span>
            <p className="font-money font-bold text-[#294D3E] dark:text-emerald-100 mt-0.5">
              {syncQueueCount} bản ghi
              {syncPendingAttachmentCount > 0 ? ` (${syncPendingAttachmentCount} ảnh)` : ''}
            </p>
          </div>

          <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3 border border-slate-200/70 dark:border-emerald-900/40">
            <span className="text-[11px] text-slate-400">Dung lượng dữ liệu</span>
            <p className="font-money font-bold text-[#294D3E] dark:text-emerald-100 mt-0.5">
              {formatBytesReadable(storageInfo.dataBytes)}
            </p>
          </div>

          <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3 border border-slate-200/70 dark:border-emerald-900/40">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              <span>Dung lượng hình ảnh</span>
            </span>
            <p className="font-money font-bold text-[#294D3E] dark:text-emerald-100 mt-0.5">
              {formatBytesReadable(storageInfo.attachmentBytes)} ({storageInfo.attachmentCount} ảnh)
            </p>
          </div>
        </div>

        {/* Actionable Sync Error Explanation */}
        {syncMeta?.lastSyncError && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 p-3.5 text-xs space-y-1">
            <div className="flex items-start gap-2 text-[#E45F63] font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Nguyên nhân lỗi: {syncMeta.lastSyncError}</span>
            </div>
            {syncMeta.lastSyncErrorAction && (
              <p className="text-slate-700 dark:text-slate-200 pl-6">
                <strong>Hướng xử lý:</strong> {syncMeta.lastSyncErrorAction}
              </p>
            )}
          </div>
        )}

        {/* Sync Conflict Banner */}
        {syncConflicts.length > 0 && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100 font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Phát hiện {syncConflicts.length} bản ghi có xung đột do chỉnh sửa đồng thời trên nhiều thiết bị.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setConflictModalOpen(true)}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 font-bold cursor-pointer"
            >
              Xem &amp; chọn phiên bản
            </button>
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isSyncing || !activeProfile?.googleUid}
            onClick={() => syncNow({ silent: false })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] hover:bg-[#199e74] disabled:opacity-50 text-white px-4 py-2 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#E9F7EF] dark:bg-emerald-950 text-[#294D3E] dark:text-emerald-200 px-3.5 py-2 text-xs font-bold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Sao lưu dữ liệu</span>
          </button>

          <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-[#F5F8F6] dark:bg-[#0D1713] px-3.5 py-2 text-xs font-bold text-[#294D3E] dark:text-emerald-200 cursor-pointer hover:border-[#20B889]">
            <Upload className="w-3.5 h-3.5" />
            <span>Khôi phục dữ liệu</span>
            <input type="file" accept=".json,application/json" onChange={handlePickRestoreFile} className="hidden" />
          </label>

          {activeProfile?.googleUid && (
            <button
              type="button"
              onClick={() => setConfirmDisconnectGoogle(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/50 px-3.5 py-2 text-xs font-bold text-[#E45F63] hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
            >
              <Unlink className="w-3.5 h-3.5" />
              <span>Ngắt kết nối Google</span>
            </button>
          )}
        </div>

        {/* Disconnect Confirmation Box (Never silent) */}
        {confirmDisconnectGoogle && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3.5 space-y-2.5 text-xs">
            <p className="font-bold text-red-900 dark:text-red-200">
              Xác nhận ngắt kết nối tài khoản Google ({activeProfile?.googleEmail})?
            </p>
            <p className="text-red-800 dark:text-red-300">
              Dữ liệu tài chính hiện tại trên thiết bị vẫn được giữ nguyên 100%, nhưng các thay đổi mới sẽ không tự động đồng bộ lên Google Drive cho đến khi bạn liên kết lại.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await disconnectGoogleAccount();
                  setConfirmDisconnectGoogle(false);
                }}
                className="rounded-xl bg-[#E45F63] text-white px-3.5 py-1.5 font-bold cursor-pointer"
              >
                Xác nhận ngắt kết nối
              </button>
              <button
                type="button"
                onClick={() => setConfirmDisconnectGoogle(false)}
                className="rounded-xl bg-white dark:bg-slate-800 px-3.5 py-1.5 font-semibold cursor-pointer"
              >
                Giữ nguyên kết nối
              </button>
            </div>
          </div>
        )}

        {/* Optional Extra Encryption Passphrase */}
        <div className="pt-1 border-t border-slate-100 dark:border-emerald-900/40">
          <button
            type="button"
            onClick={() => setShowPassphraseBox((v) => !v)}
            className="text-[11px] font-semibold text-[#20B889] hover:underline cursor-pointer"
          >
            {showPassphraseBox ? '▾ Ẩn thiết lập khẩu lệnh mã hóa đồng bộ' : '▸ Thiết lập khẩu lệnh mã hóa AES-GCM riêng (tùy chọn)'}
          </button>
          {showPassphraseBox && (
            <div className="mt-2.5 rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3 space-y-2 text-xs">
              <p className="text-[11px] text-slate-500">
                Mặc định ứng dụng dẫn xuất khóa AES-GCM-256 theo định danh Google và không lưu khóa gốc trong tệp Drive. Bạn có thể đặt thêm khẩu lệnh riêng (nhớ nhập giống nhau trên các thiết bị).
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  placeholder="Nhập khẩu lệnh mã hóa đồng bộ..."
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  className="flex-1 min-w-[200px] rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-3 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await setSyncPassphrase(passphraseInput.trim() || undefined);
                    setPassphraseInput('');
                  }}
                  className="rounded-xl bg-[#294D3E] text-white px-3.5 py-1.5 text-xs font-bold cursor-pointer"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CÀI ĐẶT ỨNG DỤNG PWA & CẬP NHẬT */}
      <PWAInstallGuideCard />

      {/* 3. Quản lý tài khoản tài chính */}
      <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-[#294D3E] dark:text-emerald-100">
            <Wallet className="w-4 h-4 text-[#20B889]" />
            <span>3. Quản lý tài khoản tài chính ({accounts.length})</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingAcc(null);
              setAccModalMode('edit');
              setAccModalOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-xl bg-[#20B889] text-white px-3.5 py-2 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm tài khoản</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {accounts.map((acc) => {
            const bal = getAccountBalance(acc.id);
            return (
              <div
                key={acc.id}
                className={`rounded-2xl border px-3.5 py-3 flex items-center justify-between gap-2 ${
                  acc.isActive
                    ? 'bg-[#F5F8F6] dark:bg-[#0D1713] border-slate-200/70 dark:border-emerald-900/40'
                    : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/50 opacity-65'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#294D3E] dark:text-emerald-100">
                    <span>{acc.sticker}</span>
                    <span className="truncate">{acc.name}</span>
                    {!acc.isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Ngưng dùng
                      </span>
                    )}
                  </div>
                  <p className="font-money text-xs font-bold mt-0.5 text-slate-600 dark:text-slate-300">
                    {formatVND(bal, settings.currencySymbol, settings.hideBalances)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAcc(acc);
                      setAccModalMode('adjust');
                      setAccModalOpen(true);
                    }}
                    className="rounded-lg bg-white dark:bg-[#13221C] border border-slate-200 dark:border-emerald-900/50 px-2 py-1 text-[11px] font-semibold cursor-pointer"
                  >
                    Điều chỉnh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAcc(acc);
                      setAccModalMode('edit');
                      setAccModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-[#13221C] text-slate-500 cursor-pointer"
                    aria-label="Sửa tài khoản"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!acc.isActive) {
                        await saveAccount({ ...acc, isActive: true });
                      } else {
                        await deleteOrDeactivateAccount(acc.id, 'deactivate');
                      }
                    }}
                    className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-[#294D3E] cursor-pointer"
                  >
                    {acc.isActive ? 'Ẩn' : 'Bật'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Danh mục & Bảng từ viết tắt nhập nhanh */}
      <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-[#294D3E] dark:text-emerald-100">
            <FolderCog className="w-4 h-4 text-[#20B889]" />
            <span>4. Danh mục thu chi &amp; Từ viết tắt nhập nhanh</span>
          </div>
          <button
            type="button"
            onClick={() => setCatManagerOpen(true)}
            className="rounded-xl bg-[#E9F7EF] dark:bg-emerald-950 px-3.5 py-2 text-xs font-bold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
          >
            Mở trình quản lý danh mục ({categories.length})
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Thiết lập bảng từ viết tắt riêng (ví dụ: <strong>TM</strong> → Tiền mặt, <strong>MM</strong> → MoMo, <strong>Sacom</strong> → Sacombank) để hệ thống nhận diện chính xác khi nhập nhanh bằng văn bản.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Từ viết tắt (vd: TCB)"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              className="w-36 rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            />
            <select
              value={aliasTargetType}
              onChange={(e) => {
                const t = e.target.value as 'account' | 'category';
                setAliasTargetType(t);
                setAliasTargetId(t === 'account' ? accounts[0]?.id || '' : categories[0]?.id || '');
              }}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            >
              <option value="account">Tài khoản</option>
              <option value="category">Danh mục</option>
            </select>
            <select
              value={aliasTargetId}
              onChange={(e) => setAliasTargetId(e.target.value)}
              className="flex-1 min-w-[160px] rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            >
              {(aliasTargetType === 'account' ? accounts : categories).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sticker} {item.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                if (!newAlias.trim() || !aliasTargetId) return;
                await saveAlias(newAlias, aliasTargetType, aliasTargetId);
                setNewAlias('');
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-[#20B889] text-white px-3.5 py-2 text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {aliases.map((al) => {
              const target =
                al.targetType === 'account'
                  ? accounts.find((a) => a.id === al.targetId)
                  : categories.find((c) => c.id === al.targetId);
              return (
                <div
                  key={al.id}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] border border-slate-200/70 dark:border-emerald-900/40 px-3 py-1.5 text-xs"
                >
                  <span className="font-bold text-[#294D3E] dark:text-emerald-200">{al.alias}</span>
                  <span className="text-slate-400">→</span>
                  <span>{target ? `${target.sticker} ${target.name}` : 'Không rõ'}</span>
                  <button type="button" onClick={() => deleteAlias(al.id)} className="text-slate-400 hover:text-[#E45F63] cursor-pointer">
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. Tiền tệ & Múi giờ */}
      <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-2">
        <h3 className="text-sm font-bold text-[#294D3E] dark:text-emerald-100">5. Thiết lập tiền tệ &amp; Khu vực</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
          <div className="rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3">
            <span className="text-slate-400">Tiền tệ</span>
            <p className="font-bold mt-0.5">{settings.currency} ({settings.currencySymbol})</p>
          </div>
          <div className="rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3">
            <span className="text-slate-400">Múi giờ</span>
            <p className="font-bold mt-0.5">{settings.timezone}</p>
          </div>
          <div className="rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3">
            <span className="text-slate-400">Ngôn ngữ</span>
            <p className="font-bold mt-0.5">Tiếng Việt</p>
          </div>
          <div className="rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3">
            <span className="text-slate-400">Lưu trữ số tiền</span>
            <p className="font-bold mt-0.5">Số nguyên VND</p>
          </div>
        </div>
      </section>

      {/* 6. Sao lưu & Khôi phục */}
      <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#294D3E] dark:text-emerald-100">6. Sao lưu &amp; Khôi phục dữ liệu</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sao lưu lần gần nhất:{' '}
              <strong>{lastExport ? formatDateTimeReadable(lastExport.createdAt) : 'Chưa sao lưu lần nào'}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span>Nhắc mỗi:</span>
            <select
              value={settings.backupReminderDays}
              onChange={(e) => updateSettings({ backupReminderDays: parseInt(e.target.value, 10) })}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-2.5 py-1.5"
            >
              <option value={3}>3 ngày</option>
              <option value={7}>7 ngày</option>
              <option value={14}>14 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={0}>Tắt nhắc</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-2 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white px-4 py-2.5 text-xs font-bold cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Xuất bản sao lưu toàn bộ (.json)</span>
          </button>
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-[#F5F8F6] dark:bg-[#0D1713] px-4 py-2.5 text-xs font-bold text-[#294D3E] dark:text-emerald-200 cursor-pointer hover:border-[#20B889]">
            <Upload className="w-4 h-4" />
            <span>Nhập bản sao lưu (.json)</span>
            <input type="file" accept=".json,application/json" onChange={handlePickRestoreFile} className="hidden" />
          </label>
        </div>
      </section>

      {/* 7. Quản lý dữ liệu cục bộ */}
      <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[#294D3E] dark:text-emerald-100">
          <Database className="w-4 h-4 text-[#20B889]" />
          <span>7. Quản lý dung lượng &amp; Dữ liệu cục bộ</span>
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Tổng bản ghi trong IndexedDB: <strong className="font-money">{storageInfo.totalRecords}</strong>
          </span>
          <span>
            Dữ liệu cấu trúc: <strong>{formatBytesReadable(storageInfo.dataBytes)}</strong>
          </span>
          <span>
            Hình ảnh đính kèm: <strong>{formatBytesReadable(storageInfo.attachmentBytes)}</strong> ({storageInfo.attachmentCount} ảnh)
          </span>
          {storageInfo.usedBytes > 0 && (
            <span>
              Tổng bộ nhớ trình duyệt: <strong>{(storageInfo.usedBytes / (1024 * 1024)).toFixed(2)} MB</strong>
            </span>
          )}
        </div>

        <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-4 space-y-3">
          <p className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">Xóa giao dịch theo khoảng thời gian</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={delFrom} onChange={(e) => setDelFrom(e.target.value)} className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-3 py-2 text-xs" />
            <span className="text-xs">đến</span>
            <input type="date" value={delTo} onChange={(e) => setDelTo(e.target.value)} className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-3 py-2 text-xs" />
            <button
              type="button"
              onClick={async () => {
                const n = await deleteTransactionsInRange(delFrom, delTo);
                pushToast({ title: `Đã xóa ${n} giao dịch trong khoảng thời gian đã chọn`, tone: 'info' });
              }}
              className="rounded-xl bg-amber-500 text-white px-3.5 py-2 text-xs font-bold cursor-pointer"
            >
              Xóa theo khoảng ngày
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              if (wipeStep === 0) setWipeStep(1);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/50 px-4 py-2 text-xs font-bold text-[#E45F63] hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Xóa toàn bộ dữ liệu trên thiết bị</span>
          </button>
        </div>

        {wipeStep >= 1 && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-4 space-y-3">
            <div className="flex items-start gap-2 text-xs text-red-900 dark:text-red-200">
              <AlertTriangle className="w-4 h-4 text-[#E45F63] shrink-0 mt-0.5" />
              <span>
                <strong>Xác nhận xóa vĩnh viễn:</strong> Hành động này sẽ xóa toàn bộ giao dịch, tài khoản, sổ riêng và hình ảnh trên trình duyệt này.
              </span>
            </div>
            {wipeStep === 1 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await clearAllTransactionsOnly();
                    setWipeStep(0);
                  }}
                  className="rounded-xl bg-amber-500 text-white px-3 py-2 text-xs font-bold cursor-pointer"
                >
                  Chỉ xóa lịch sử giao dịch (giữ tài khoản)
                </button>
                <button
                  type="button"
                  onClick={() => setWipeStep(2)}
                  className="rounded-xl bg-[#E45F63] text-white px-3 py-2 text-xs font-bold cursor-pointer"
                >
                  Tiếp tục xóa tất cả dữ liệu →
                </button>
                <button
                  type="button"
                  onClick={() => setWipeStep(0)}
                  className="rounded-xl bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#E45F63]">
                  Bước 2/2: Nhập chữ <strong>XOA TAT CA</strong> để xác nhận xóa toàn bộ cơ sở dữ liệu:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={wipeConfirmText}
                    onChange={(e) => setWipeConfirmText(e.target.value)}
                    placeholder="Nhập XOA TAT CA"
                    className="rounded-xl border border-red-300 bg-white dark:bg-[#13221C] px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={wipeConfirmText.trim().toUpperCase() !== 'XOA TAT CA'}
                    onClick={async () => {
                      await wipeAllLocalData();
                      setWipeStep(0);
                      setWipeConfirmText('');
                    }}
                    className="rounded-xl bg-[#E45F63] text-white px-4 py-2 text-xs font-bold cursor-pointer disabled:opacity-40"
                  >
                    Xác nhận xóa vĩnh viễn
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWipeStep(0);
                      setWipeConfirmText('');
                    }}
                    className="rounded-xl bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <CategoryManagerModal open={catManagerOpen} onClose={() => setCatManagerOpen(false)} />
      <AccountModal
        open={accModalOpen}
        editing={editingAcc}
        mode={accModalMode}
        onClose={() => setAccModalOpen(false)}
      />

      {/* Backup Restore Confirmation & Duplicate Check Modal */}
      {restorePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
              Kiểm tra bản sao lưu trước khi khôi phục
            </h3>
            {!restorePreview.valid ? (
              <>
                <p className="text-xs text-[#E45F63]">{restorePreview.error}</p>
                <button
                  type="button"
                  onClick={() => setRestorePreview(null)}
                  className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-bold cursor-pointer"
                >
                  Đóng
                </button>
              </>
            ) : (
              <>
                <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3.5 text-xs space-y-1.5">
                  <p>
                    Thời điểm xuất:{' '}
                    <strong>{restorePreview.exportedAt ? formatDateTimeReadable(restorePreview.exportedAt) : 'Không rõ'}</strong>
                    {restorePreview.version ? ` · Phiên bản v${restorePreview.version}` : ''}
                  </p>
                  <p>Tổng số bản ghi: <strong>{restorePreview.recordCount}</strong></p>
                  <p>
                    Tài khoản: {restorePreview.summary.accounts} · Giao dịch: {restorePreview.summary.transactions} · Sổ riêng: {restorePreview.summary.ledgers} · Nhật ký: {restorePreview.summary.diaryEntries} · Ảnh: {restorePreview.summary.attachments}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Trên máy hiện có: {restorePreview.currentSummary.accounts} tài khoản · {restorePreview.currentSummary.transactions} giao dịch · {restorePreview.currentSummary.attachments} ảnh
                  </p>
                  <p
                    className={`font-semibold ${
                      restorePreview.integrityStatus === 'verified'
                        ? 'text-[#20B889]'
                        : restorePreview.integrityStatus === 'mismatch'
                        ? 'text-[#E45F63]'
                        : 'text-slate-500'
                    }`}
                  >
                    {restorePreview.integrityStatus === 'verified'
                      ? '✓ Toàn vẹn SHA-256: Tệp sao lưu hợp lệ, không bị chỉnh sửa.'
                      : restorePreview.integrityStatus === 'mismatch'
                      ? '✕ Cảnh báo: Mã kiểm tra SHA-256 không khớp!'
                      : '• Bản sao lưu phiên bản cũ (chưa có mã SHA-256).'}
                  </p>
                  {restorePreview.diffWarning && (
                    <div className="mt-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2.5 text-amber-800 dark:text-amber-200 font-semibold">
                      ⚠ {restorePreview.diffWarning}
                    </div>
                  )}
                  {restorePreview.duplicateIdsCount > 0 && (
                    <p className="text-amber-600 font-semibold pt-0.5">
                      Phát hiện {restorePreview.duplicateIdsCount} bản ghi trùng ID với dữ liệu hiện có trên máy.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => executeRestore('merge_skip_duplicates')}
                    className="w-full rounded-xl bg-[#20B889] text-white font-bold py-2.5 text-xs cursor-pointer"
                  >
                    Gộp thêm dữ liệu mới (bỏ qua bản ghi trùng)
                  </button>
                  <button
                    type="button"
                    onClick={() => executeRestore('overwrite')}
                    className="w-full rounded-xl bg-[#E45F63] text-white font-bold py-2.5 text-xs cursor-pointer"
                  >
                    Ghi đè toàn bộ dữ liệu hiện tại
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestorePreview(null)}
                    className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-semibold cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
