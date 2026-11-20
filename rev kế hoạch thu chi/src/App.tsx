import React, { useEffect } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  BarChart3,
  BookMarked,
  CalendarDays,
  Camera,
  Cloud,
  CloudOff,
  Eye,
  EyeOff,
  LayoutDashboard,
  ListOrdered,
  Lock,
  Mic,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { LockScreen } from './components/LockScreen';
import {
  OfflineIndicator,
  PWAInstallButton,
  PWAUpdateManager,
  SplashScreen,
} from './components/PWAComponents';
import { RadishMascot } from './components/RadishMascot';
import { ReceiptOcrModal } from './components/ReceiptOcrModal';
import { SyncConflictModal } from './components/SyncConflictModal';
import { TransactionModal } from './components/TransactionModal';
import { TransferModal } from './components/TransferModal';
import { VoiceInputModal } from './components/VoiceInputModal';
import { CalendarPage } from './pages/CalendarPage';
import { DashboardPage } from './pages/DashboardPage';
import { OtherLedgersPage } from './pages/OtherLedgersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { useAppStore } from './store/useAppStore';
import { AppSection } from './types/finance';

const NAV_ITEMS: Array<{ key: AppSection; label: string; shortLabel: string; icon: React.FC<{ className?: string }> }> = [
  { key: 'overview', label: 'Tổng quan', shortLabel: 'Tổng quan', icon: LayoutDashboard },
  { key: 'transactions', label: 'Chi tiết thu chi', shortLabel: 'Thu chi', icon: ListOrdered },
  { key: 'calendar', label: 'Lịch tài chính', shortLabel: 'Lịch', icon: CalendarDays },
  { key: 'reports', label: 'Báo cáo chi tiết', shortLabel: 'Báo cáo', icon: BarChart3 },
  { key: 'ledgers', label: 'Khác (Sổ & Nhật ký)', shortLabel: 'Khác', icon: BookMarked },
  { key: 'settings', label: 'Cài đặt', shortLabel: 'Cài đặt', icon: Settings },
];

export function App() {
  const isInitialized = useAppStore((s) => s.isInitialized);
  const isLoading = useAppStore((s) => s.isLoading);
  const activeProfile = useAppStore((s) => s.activeProfile);
  const isLocked = useAppStore((s) => s.isLocked);
  const activeSection = useAppStore((s) => s.activeSection);
  const previousSection = useAppStore((s) => s.previousSection);
  const settings = useAppStore((s) => s.settings);
  const toasts = useAppStore((s) => s.toasts);

  const initApp = useAppStore((s) => s.initApp);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const goBackSection = useAppStore((s) => s.goBackSection);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const lockApp = useAppStore((s) => s.lockApp);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const openTxModal = useAppStore((s) => s.openTxModal);
  const setTransferModalOpen = useAppStore((s) => s.setTransferModalOpen);
  const setVoiceModalOpen = useAppStore((s) => s.setVoiceModalOpen);
  const setOcrModalOpen = useAppStore((s) => s.setOcrModalOpen);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const syncConflicts = useAppStore((s) => s.syncConflicts);
  const syncQueueCount = useAppStore((s) => s.syncQueueCount);
  const googleTokenActive = useAppStore((s) => s.googleTokenActive);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const syncNow = useAppStore((s) => s.syncNow);
  const setConflictModalOpen = useAppStore((s) => s.setConflictModalOpen);
  const reauthorizeGoogle = useAppStore((s) => s.reauthorizeGoogle);
  const refreshSyncStatus = useAppStore((s) => s.refreshSyncStatus);

  useEffect(() => {
    initApp();
  }, [initApp]);

  // Apply themeMode, primaryColor, and fontSize dynamically
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.themeMode === 'dark');
    root.style.setProperty('--brand-primary', settings.primaryColor || '#20B889');
    root.style.fontSize =
      settings.fontSize === 'sm' ? '14px' : settings.fontSize === 'lg' ? '17px' : '15.5px';
  }, [settings.themeMode, settings.primaryColor, settings.fontSize]);

  // Auto-sync when Internet reconnects or Google token becomes active on unlocked profile
  useEffect(() => {
    const handleOnline = () => {
      void refreshSyncStatus();
      if (activeProfile?.googleUid && googleTokenActive && !isLocked) {
        void syncNow({ silent: true });
      }
    };
    const handleOffline = () => {
      void refreshSyncStatus();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [activeProfile?.googleUid, googleTokenActive, isLocked, syncNow, refreshSyncStatus]);

  // Auto-lock timer on inactivity
  useEffect(() => {
    if (!activeProfile || isLocked || settings.autoLockMinutes <= 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        lockApp();
      }, settings.autoLockMinutes * 60 * 1000);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [activeProfile, isLocked, settings.autoLockMinutes, lockApp]);

  if (!isInitialized || isLoading) {
    return <SplashScreen subtitle="Đang mở sổ tài chính cục bộ..." />;
  }

  if (!activeProfile) {
    return (
      <>
        <AuthScreen />
        <PWAUpdateManager />
        <OfflineIndicator />
      </>
    );
  }

  const currentNav = NAV_ITEMS.find((n) => n.key === activeSection) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#F5F8F6] dark:bg-[#0D1713] text-[#1A2E25] dark:text-[#EDF4F0] flex">
      {isLocked && <LockScreen />}

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-[#13221C] border-r border-emerald-100 dark:border-emerald-900/50 p-4 justify-between no-print">
        <div className="space-y-5">
          {/* Brand Header */}
          <div className="flex items-center gap-2.5 px-2 pt-1">
            <RadishMascot expression="happy" size={40} className="shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-extrabold tracking-tight text-[#294D3E] dark:text-emerald-100 truncate">
                Kế Hoạch Thu Chi
              </h1>
              <p className="text-[11px] text-slate-400 truncate">{activeProfile.displayName}</p>
            </div>
          </div>

          {/* Primary Add CTA */}
          <button
            type="button"
            onClick={() => openTxModal('expense')}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-sm font-bold text-white shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
            style={{ backgroundColor: settings.primaryColor || '#20B889' }}
          >
            <Plus className="w-5 h-5" />
            <span>Thêm giao dịch</span>
          </button>

          {/* Quick Smart Shortcuts */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setVoiceModalOpen(true)}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] hover:bg-[#E9F7EF] text-[11px] font-semibold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
            >
              <Mic className="w-4 h-4 text-[#20B889]" />
              <span>Giọng nói</span>
            </button>
            <button
              type="button"
              onClick={() => setOcrModalOpen(true)}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] hover:bg-[#E9F7EF] text-[11px] font-semibold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
            >
              <Camera className="w-4 h-4 text-[#20B889]" />
              <span>Hóa đơn</span>
            </button>
            <button
              type="button"
              onClick={() => setTransferModalOpen(true)}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] hover:bg-[#E9F7EF] text-[11px] font-semibold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4 text-[#20B889]" />
              <span>Chuyển</span>
            </button>
          </div>

          {/* 6 Main Nav Links */}
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#E9F7EF] dark:bg-emerald-950/70 text-[#294D3E] dark:text-emerald-100'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-[#F5F8F6] dark:hover:bg-[#0D1713]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${active ? 'text-[#20B889]' : 'text-slate-400'}`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-emerald-900/40">
          {/* Compact Sync Pill */}
          <button
            type="button"
            onClick={() => {
              if (syncConflicts.length > 0) {
                setConflictModalOpen(true);
              } else if (syncStatus === 'auth_expired') {
                void reauthorizeGoogle();
              } else if (activeProfile.googleUid) {
                void syncNow({ silent: false });
              } else {
                setActiveSection('settings');
              }
            }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[11px] font-bold cursor-pointer border transition-colors ${
              syncConflicts.length > 0 || syncStatus === 'error'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-[#E45F63]'
                : syncStatus === 'auth_expired' || syncStatus === 'offline'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                : syncStatus === 'local_only'
                ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                : 'bg-[#E9F7EF] dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900/60 text-[#294D3E] dark:text-emerald-200'
            }`}
          >
            <span className="flex items-center gap-1.5 min-w-0 truncate">
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-[#20B889]" />
              ) : syncConflicts.length > 0 || syncStatus === 'error' || syncStatus === 'auth_expired' ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              ) : activeProfile.googleUid ? (
                <Cloud className="w-3.5 h-3.5 shrink-0 text-[#20B889]" />
              ) : (
                <CloudOff className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">
                {isSyncing
                  ? 'Đang đồng bộ...'
                  : syncConflicts.length > 0
                  ? `${syncConflicts.length} xung đột đồng bộ`
                  : syncStatus === 'auth_expired'
                  ? 'Kết nối lại Google'
                  : syncStatus === 'offline'
                  ? 'Ngoại tuyến (chờ mạng)'
                  : syncStatus === 'error'
                  ? 'Lỗi đồng bộ Drive'
                  : activeProfile.googleUid
                  ? 'Drive đã đồng bộ'
                  : 'Chỉ lưu trên thiết bị'}
              </span>
            </span>
            {syncQueueCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-white/80 dark:bg-[#0D1713] text-[10px] font-money shrink-0">
                {syncQueueCount}
              </span>
            )}
          </button>

          <PWAInstallButton compact />
          <button
            type="button"
            onClick={lockApp}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-[#F5F8F6] dark:hover:bg-[#0D1713] cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>Khóa ứng dụng</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Compact Top Bar */}
        <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-[#13221C]/90 backdrop-blur-md border-b border-emerald-100 dark:border-emerald-900/50 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            {previousSection !== activeSection && (
              <button
                type="button"
                onClick={goBackSection}
                className="p-2 rounded-xl text-slate-500 hover:bg-[#F5F8F6] dark:hover:bg-[#0D1713] cursor-pointer"
                title="Quay lại màn hình trước"
                aria-label="Quay lại"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="lg:hidden">
              <RadishMascot expression="happy" size={30} />
            </span>
            <h2 className="text-sm sm:text-base font-bold text-[#294D3E] dark:text-emerald-100 truncate">
              {currentNav.label}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="lg:hidden">
              <PWAInstallButton compact />
            </span>
            {syncConflicts.length > 0 && (
              <button
                type="button"
                onClick={() => setConflictModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{syncConflicts.length} xung đột</span>
              </button>
            )}
            {activeProfile.googleUid && syncStatus === 'auth_expired' && (
              <button
                type="button"
                onClick={() => void reauthorizeGoogle()}
                className="inline-flex items-center gap-1 rounded-xl bg-amber-500 text-white px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
                title="Phiên Google Drive đã hết hạn, bấm để cấp quyền lại"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kết nối lại Google</span>
              </button>
            )}
            {!activeProfile.googleUid && (
              <button
                type="button"
                onClick={() => setActiveSection('settings')}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer"
                title="Dữ liệu hiện chỉ lưu trên thiết bị. Bấm để liên kết Google Drive."
              >
                <CloudOff className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Chỉ lưu cục bộ</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => updateSettings({ hideBalances: !settings.hideBalances })}
              className="p-2 rounded-xl text-slate-500 hover:bg-[#F5F8F6] dark:hover:bg-[#0D1713] cursor-pointer"
              title={settings.hideBalances ? 'Hiện số dư' : 'Ẩn số dư'}
              aria-label="Ẩn/hiện số dư"
            >
              {settings.hideBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() =>
                updateSettings({ themeMode: settings.themeMode === 'dark' ? 'light' : 'dark' })
              }
              className="p-2 rounded-xl text-slate-500 hover:bg-[#F5F8F6] dark:hover:bg-[#0D1713] cursor-pointer"
              title="Đổi giao diện Sáng/Tối"
              aria-label="Đổi Sáng/Tối"
            >
              {settings.themeMode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={lockApp}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-[#F5F8F6] dark:hover:bg-[#0D1713] cursor-pointer"
              aria-label="Khóa ứng dụng"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Workspace */}
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
          {activeSection === 'overview' && <DashboardPage />}
          {activeSection === 'transactions' && <TransactionsPage />}
          {activeSection === 'calendar' && <CalendarPage />}
          {activeSection === 'reports' && <ReportsPage />}
          {activeSection === 'ledgers' && <OtherLedgersPage />}
          {activeSection === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Mobile Floating Add Button + Bottom Navigation Bar */}
      <div className="lg:hidden fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 no-print">
        <button
          type="button"
          onClick={() => openTxModal('expense')}
          className="w-13 h-13 rounded-full text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          style={{ backgroundColor: settings.primaryColor || '#20B889' }}
          aria-label="Thêm giao dịch nhanh"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#13221C]/95 backdrop-blur-md border-t border-emerald-100 dark:border-emerald-900/50 grid grid-cols-6 h-16 pb-safe no-print">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveSection(item.key)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer ${
                active ? 'text-[#20B889]' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-tight truncate max-w-full px-0.5">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Global Modals */}
      <TransactionModal />
      <TransferModal />
      <VoiceInputModal />
      <ReceiptOcrModal />
      <SyncConflictModal />
      <PWAUpdateManager />
      <OfflineIndicator />

      {/* Friendly Toast Stack */}
      <div className="fixed top-16 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none px-4 sm:px-0 no-print">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-2xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/60 shadow-lg p-3.5 flex items-center gap-3"
          >
            {toast.mascot && <RadishMascot expression={toast.mascot} size={42} className="shrink-0" />}
            <div className="flex-1 min-w-0">
              <p
                className={`text-xs font-bold ${
                  toast.tone === 'warning' || toast.tone === 'error'
                    ? 'text-[#E45F63]'
                    : 'text-[#294D3E] dark:text-emerald-100'
                }`}
              >
                {toast.title}
              </p>
              {toast.description && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
