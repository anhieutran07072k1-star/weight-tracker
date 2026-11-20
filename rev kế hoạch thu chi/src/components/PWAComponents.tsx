import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Laptop,
  RefreshCw,
  Share,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { detectDeviceInstallInfo, DeviceInstallInfo } from '../utils/pwaDevice';
import { RadishMascot } from './RadishMascot';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Shared reactive holders so multiple components (Header button, Sidebar button, Settings card) stay in sync
let sharedDeferredPrompt: BeforeInstallPromptEvent | null = null;
let sharedIsInstalled = false;
const promptSubscribers = new Set<() => void>();

let sharedSwRegistration: ServiceWorkerRegistration | null = null;
let sharedNeedRefresh = false;
let sharedUpdateFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
const swSubscribers = new Set<() => void>();

function notifyPromptSubscribers() {
  promptSubscribers.forEach((fn) => fn());
}

function notifySwSubscribers() {
  swSubscribers.forEach((fn) => fn());
}

export async function checkForPWAUpdate(): Promise<'checking' | 'update_found' | 'up_to_date' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  try {
    const reg = sharedSwRegistration || (await navigator.serviceWorker.getRegistration());
    if (!reg) return 'unsupported';
    sharedSwRegistration = reg;
    await reg.update();
    if (reg.waiting || sharedNeedRefresh) {
      sharedNeedRefresh = true;
      notifySwSubscribers();
      return 'update_found';
    }
    return 'up_to_date';
  } catch {
    return 'up_to_date';
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(sharedDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(sharedIsInstalled);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInstallInfo>(() => detectDeviceInstallInfo());

  useEffect(() => {
    const initial = detectDeviceInstallInfo();
    sharedIsInstalled = initial.isStandalone;
    setIsInstalled(initial.isStandalone);
    setDeviceInfo(initial);

    const syncState = () => {
      setDeferredPrompt(sharedDeferredPrompt);
      setIsInstalled(sharedIsInstalled);
      setDeviceInfo(detectDeviceInstallInfo({ isStandalone: sharedIsInstalled }));
    };
    promptSubscribers.add(syncState);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      sharedDeferredPrompt = e as BeforeInstallPromptEvent;
      notifyPromptSubscribers();
    };
    const onInstalled = () => {
      sharedIsInstalled = true;
      sharedDeferredPrompt = null;
      notifyPromptSubscribers();
    };

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayModeChange = () => {
      const standalone = detectDeviceInstallInfo().isStandalone;
      sharedIsInstalled = standalone;
      notifyPromptSubscribers();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    mediaQuery?.addEventListener?.('change', onDisplayModeChange);

    return () => {
      promptSubscribers.delete(syncState);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      mediaQuery?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      sharedIsInstalled = true;
      sharedDeferredPrompt = null;
      notifyPromptSubscribers();
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS: deviceInfo.platform === 'ios',
    deviceInfo,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return isOnline;
}

export const SplashScreen: React.FC<{ subtitle?: string }> = ({
  subtitle = 'Đang chuẩn bị sổ tài chính cá nhân...',
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-[#F5F8F6] dark:bg-[#0D1713] flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-24 h-24 rounded-[26px] bg-white dark:bg-[#13221C] border border-emerald-200/80 dark:border-emerald-800/60 shadow-lg flex items-center justify-center">
        <RadishMascot expression="happy" size={76} />
      </div>
      <h1 className="mt-5 text-xl font-extrabold tracking-wide text-[#294D3E] dark:text-emerald-100">
        KẾ HOẠCH THU CHI
      </h1>
      <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>
      <div className="mt-5 w-32 h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 overflow-hidden">
        <div className="h-full w-1/2 rounded-full bg-[#20B889] animate-pulse" />
      </div>
    </div>
  );
};

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, deviceInfo, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Already running as an installed standalone PWA -> hide install prompt
  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-xl bg-[#20B889] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#199e74] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>{compact ? 'Cài App' : 'Cài đặt ứng dụng'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[#D1E7DD] dark:border-emerald-900 bg-[#E9F7EF] dark:bg-emerald-950/60 px-3 py-2 text-xs font-semibold text-[#294D3E] dark:text-emerald-300 whitespace-nowrap shrink-0 cursor-pointer"
      >
        {deviceInfo.platform === 'ios' ? (
          <Share className="w-3.5 h-3.5" />
        ) : deviceInfo.platform === 'android' ? (
          <Smartphone className="w-3.5 h-3.5" />
        ) : (
          <Laptop className="w-3.5 h-3.5" />
        )}
        <span>
          {deviceInfo.platform === 'ios'
            ? 'Cài trên iOS'
            : compact
            ? 'Cài App'
            : 'Hướng dẫn cài đặt'}
        </span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-6 border border-slate-200 dark:border-emerald-900/60 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="Kế Hoạch Thu Chi"
                  className="w-11 h-11 rounded-2xl border border-emerald-100 shrink-0"
                />
                <div>
                  <h3 className="text-sm font-extrabold text-[#294D3E] dark:text-emerald-100">
                    {deviceInfo.guideTitle}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">{deviceInfo.osLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">{deviceInfo.guideSubtitle}</p>

            {deviceInfo.warningNote && (
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-100">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{deviceInfo.warningNote}</span>
              </div>
            )}

            <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-200 list-decimal pl-4 leading-relaxed">
              {deviceInfo.guideSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full rounded-xl bg-[#20B889] py-2.5 text-xs font-bold text-white hover:bg-[#199e74] cursor-pointer"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const PWAInstallGuideCard: React.FC = () => {
  const { isInstallable, isInstalled, deviceInfo, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [swActive, setSwActive] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(sharedNeedRefresh);
  const [checkMsg, setCheckMsg] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          sharedSwRegistration = reg;
          setSwActive(Boolean(reg.active || reg.installing || reg.waiting));
        }
      });
    }
    const syncSw = () => setNeedRefresh(sharedNeedRefresh);
    swSubscribers.add(syncSw);
    return () => {
      swSubscribers.delete(syncSw);
    };
  }, []);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setCheckMsg('');
    try {
      const result = await checkForPWAUpdate();
      if (result === 'update_found') {
        setCheckMsg('Đã phát hiện phiên bản mới! Nhấn "Cập nhật ngay" để áp dụng.');
      } else if (result === 'unsupported') {
        setCheckMsg('Trình duyệt hiện tại chưa kích hoạt Service Worker.');
      } else {
        setCheckMsg('Bạn đang sử dụng phiên bản mới nhất của KẾ HOẠCH THU CHI.');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-extrabold text-[#294D3E] dark:text-emerald-100">
          {deviceInfo.platform === 'desktop' ? (
            <Laptop className="w-4 h-4 text-[#20B889]" />
          ) : (
            <Smartphone className="w-4 h-4 text-[#20B889]" />
          )}
          <span>CÀI ĐẶT ỨNG DỤNG TRÊN THIẾT BỊ (PWA)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              isInstalled
                ? 'bg-[#E9F7EF] text-[#20B889] dark:bg-emerald-950/80'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {isInstalled ? <CheckCircle2 className="w-3 h-3" /> : <Download className="w-3 h-3" />}
            <span>{isInstalled ? 'Đang chạy độc lập (Standalone)' : 'Đang mở trên trình duyệt'}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              swActive
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            <span>{swActive ? 'Sẵn sàng ngoại tuyến' : 'Đang khởi tạo offline'}</span>
          </span>
        </div>
      </div>

      {/* Strictly show ONLY instructions for the user's current device */}
      {isInstalled ? (
        <div className="rounded-2xl bg-[#E9F7EF]/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-3.5 flex items-center gap-3 text-xs text-[#294D3E] dark:text-emerald-100">
          <img
            src="/pwa-192x192.png"
            alt="KẾ HOẠCH THU CHI"
            className="w-11 h-11 rounded-2xl border border-emerald-200 shrink-0"
          />
          <div>
            <p className="font-bold">KẾ HOẠCH THU CHI đã được cài đặt trên {deviceInfo.osLabel}</p>
            <p className="text-[11px] opacity-85 mt-0.5">
              Ứng dụng hoạt động độc lập (Standalone) và hỗ trợ thêm, sửa, xem lịch sử, chụp hóa đơn ngay cả khi ngoại tuyến.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] border border-emerald-200/70 dark:border-emerald-900/40 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[#294D3E] dark:text-emerald-100">
                {deviceInfo.guideTitle}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Thiết bị nhận diện: <strong>{deviceInfo.osLabel}</strong> · {deviceInfo.guideSubtitle}
              </p>
            </div>

            {isInstallable && (
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white px-4 py-2 text-xs font-bold cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Cài đặt ứng dụng ngay</span>
              </button>
            )}
          </div>

          {deviceInfo.warningNote && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2.5 flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-100">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{deviceInfo.warningNote}</span>
            </div>
          )}

          <ol className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-decimal pl-4">
            {deviceInfo.guideSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* App Version & Safe Update Check */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-emerald-900/40 text-xs">
        <div className="space-y-0.5">
          <p className="font-semibold text-[#294D3E] dark:text-emerald-200">
            Cập nhật ứng dụng an toàn (không ghi đè dữ liệu tài chính)
          </p>
          <p className="text-[11px] text-slate-500">
            {checkMsg ||
              (isOnline
                ? 'Khi có phiên bản mới, ứng dụng sẽ thông báo để bạn chọn cập nhật ngay hoặc để sau.'
                : 'Đang ngoại tuyến — ứng dụng vẫn chạy đầy đủ bằng dữ liệu cục bộ.')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {needRefresh && sharedUpdateFn && (
            <button
              type="button"
              onClick={() => sharedUpdateFn?.(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white px-3.5 py-2 text-xs font-bold cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cập nhật ngay</span>
            </button>
          )}
          <button
            type="button"
            disabled={checking || !isOnline}
            onClick={handleCheckUpdate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#E9F7EF] dark:bg-emerald-950 text-[#294D3E] dark:text-emerald-200 px-3.5 py-2 text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>Kiểm tra cập nhật</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export const PWAUpdateManager: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        sharedSwRegistration = registration;
        notifySwSubscribers();
      }
    },
  });

  useEffect(() => {
    sharedNeedRefresh = needRefresh;
    sharedUpdateFn = updateServiceWorker;
    notifySwSubscribers();
  }, [needRefresh, updateServiceWorker]);

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 5000);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 right-4 z-50 max-w-sm w-[calc(100%-2rem)] sm:w-96 space-y-2 no-print">
      {needRefresh && (
        <div className="rounded-2xl bg-white dark:bg-[#13221C] border-2 border-[#20B889] shadow-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#E9F7EF] dark:bg-emerald-950 text-[#20B889] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-[#294D3E] dark:text-emerald-100">
                  Có phiên bản mới của KẾ HOẠCH THU CHI
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Toàn bộ giao dịch, hình ảnh và cài đặt trong IndexedDB được giữ nguyên an toàn khi cập nhật.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white py-2 px-3 text-xs font-bold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Cập nhật ngay</span>
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 py-2 px-3.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#0D1713] cursor-pointer"
            >
              Để sau
            </button>
          </div>
        </div>
      )}

      {offlineReady && !needRefresh && (
        <div className="rounded-2xl bg-[#294D3E] text-white px-4 py-3 shadow-lg flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#2DD49F] shrink-0" />
            <span>Đã lưu bộ nhớ đệm ngoại tuyến — Có thể mở app ngay cả khi mất mạng.</span>
          </div>
          <button
            type="button"
            onClick={() => setOfflineReady(false)}
            className="p-0.5 text-white/70 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg no-print">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Đang ngoại tuyến — Vẫn thêm/sửa thu chi &amp; tự đồng bộ khi có mạng</span>
    </div>
  );
};
