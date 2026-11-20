export type DevicePlatform = 'ios' | 'android' | 'desktop';
export type BrowserFlavor = 'safari' | 'chrome' | 'edge' | 'firefox' | 'inapp' | 'other';

export interface DeviceInstallInfo {
  platform: DevicePlatform;
  osLabel: string;
  browserFlavor: BrowserFlavor;
  isStandalone: boolean;
  guideTitle: string;
  guideSubtitle: string;
  guideSteps: string[];
  warningNote?: string;
}

export function detectIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function detectDeviceInstallInfo(options?: {
  userAgent?: string;
  maxTouchPoints?: number;
  isStandalone?: boolean;
}): DeviceInstallInfo {
  const ua =
    options?.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const lower = ua.toLowerCase();
  const maxTouchPoints =
    options?.maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0);

  const isStandalone = options?.isStandalone ?? detectIsStandalone();

  // Detect iPhone / iPad / iPadOS (desktop-mode Safari reports Macintosh with touch points > 1)
  const isIOS =
    /iphone|ipad|ipod/.test(lower) ||
    (/macintosh/.test(lower) && maxTouchPoints > 1);

  const isAndroid = !isIOS && /android/.test(lower);

  const platform: DevicePlatform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';

  let osLabel = 'Máy tính';
  if (isIOS) {
    osLabel = /ipad/.test(lower) || (/macintosh/.test(lower) && maxTouchPoints > 1)
      ? 'iPad (iPadOS)'
      : 'iPhone (iOS)';
  } else if (isAndroid) {
    osLabel = 'Điện thoại / Máy tính bảng Android';
  } else if (/windows/.test(lower)) {
    osLabel = 'Máy tính Windows';
  } else if (/mac os x|macintosh/.test(lower)) {
    osLabel = 'Máy tính macOS';
  }

  let browserFlavor: BrowserFlavor = 'other';
  if (/zalo|fbav|fban|instagram|line\//i.test(lower)) {
    browserFlavor = 'inapp';
  } else if (/edg|edgios|edga/i.test(lower)) {
    browserFlavor = 'edge';
  } else if (/crios|chrome/i.test(lower) && !/edg/i.test(lower)) {
    browserFlavor = 'chrome';
  } else if (/fxios|firefox/i.test(lower)) {
    browserFlavor = 'firefox';
  } else if (/safari/i.test(lower) && !/chrome|crios|android/i.test(lower)) {
    browserFlavor = 'safari';
  }

  if (platform === 'ios') {
    const isNonSafariOnIOS = browserFlavor !== 'safari';
    return {
      platform,
      osLabel,
      browserFlavor,
      isStandalone,
      guideTitle: 'Cài đặt KẾ HOẠCH THU CHI trên iPhone / iPad',
      guideSubtitle: 'Sử dụng trình duyệt Safari để cài đặt thành ứng dụng độc lập (Standalone).',
      guideSteps: [
        'Mở trang web KẾ HOẠCH THU CHI bằng trình duyệt Safari.',
        'Nhấn biểu tượng Chia sẻ (Share — ô vuông có mũi tên hướng lên) trên thanh công cụ Safari.',
        'Cuộn xuống và chọn "Thêm vào Màn hình chính" (Add to Home Screen).',
        'Kiểm tra tên "KẾ HOẠCH THU CHI" rồi nhấn "Thêm" (Add) ở góc trên bên phải.',
      ],
      warningNote: isNonSafariOnIOS
        ? 'Bạn đang mở trong trình duyệt khác Safari. Trên iOS, chỉ Safari hỗ trợ "Thêm vào Màn hình chính" — hãy sao chép địa chỉ trang và mở lại bằng Safari.'
        : undefined,
    };
  }

  if (platform === 'android') {
    return {
      platform,
      osLabel,
      browserFlavor,
      isStandalone,
      guideTitle: 'Cài đặt KẾ HOẠCH THU CHI trên Android',
      guideSubtitle: 'Cài trực tiếp qua trình duyệt Google Chrome (hoặc Edge) để chạy như ứng dụng riêng.',
      guideSteps: [
        'Mở website KẾ HOẠCH THU CHI bằng trình duyệt Google Chrome trên Android.',
        'Nhấn nút "Cài đặt ứng dụng" ngay trên màn hình (nếu xuất hiện), hoặc nhấn biểu tượng Menu (⋮) ở góc trên bên phải Chrome.',
        'Chọn "Cài đặt ứng dụng" (Install app) hoặc "Thêm vào màn hình chính" (Add to Home screen).',
        'Xác nhận "Cài đặt" để tạo biểu tượng KẾ HOẠCH THU CHI trên màn hình chính và dùng ngay cả khi ngoại tuyến.',
      ],
      warningNote:
        browserFlavor === 'inapp'
          ? 'Bạn đang mở trong trình duyệt tích hợp. Hãy chọn "Mở bằng Chrome" ở góc menu để cài đặt ứng dụng chuẩn xác.'
          : undefined,
    };
  }

  // Desktop (Windows / macOS)
  const isMacSafari = /macintosh|mac os x/.test(lower) && browserFlavor === 'safari';
  return {
    platform: 'desktop',
    osLabel,
    browserFlavor,
    isStandalone,
    guideTitle: `Cài đặt KẾ HOẠCH THU CHI trên ${osLabel}`,
    guideSubtitle: isMacSafari
      ? 'Cài đặt ứng dụng vào Dock trên macOS qua Safari.'
      : 'Cài đặt ứng dụng độc lập lên máy tính qua Chrome hoặc Microsoft Edge.',
    guideSteps: isMacSafari
      ? [
          'Mở KẾ HOẠCH THU CHI bằng Safari trên macOS (macOS Sonoma trở lên).',
          'Trên thanh menu phía trên, chọn Tệp (File) → Thêm vào Dock (Add to Dock).',
          'Nhấn "Thêm" để mở KẾ HOẠCH THU CHI dưới dạng cửa sổ ứng dụng độc lập.',
        ]
      : [
          'Mở KẾ HOẠCH THU CHI bằng trình duyệt Google Chrome hoặc Microsoft Edge.',
          'Nhấn nút "Cài đặt ứng dụng" ngay trong trang web, hoặc nhấn biểu tượng cài đặt (màn hình/dấu +) ở bên phải thanh địa chỉ.',
          'Chọn "Cài đặt" (Install) để ghim KẾ HOẠCH THU CHI lên Desktop / Start Menu / Dock và chạy ở chế độ cửa sổ riêng.',
        ],
    warningNote:
      browserFlavor === 'firefox'
        ? 'Trình duyệt Firefox trên máy tính không hỗ trợ cài đặt PWA trực tiếp. Vui lòng mở bằng Chrome, Edge hoặc Safari (trên macOS).'
        : undefined,
  };
}
