import { SpendingSession } from '../types/finance';

export const TZ_VN = 'Asia/Ho_Chi_Minh';

export function formatVND(amount: number, symbol = 'đ', hidden = false): string {
  if (hidden) return '••••••••' + symbol;
  const intVal = Math.round(amount || 0);
  const abs = Math.abs(intVal);
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intVal < 0 ? '-' : ''}${formatted}${symbol}`;
}

export function formatSignedVND(amount: number, type: 'income' | 'expense', symbol = 'đ', hidden = false): string {
  if (hidden) return '••••••' + symbol;
  const intVal = Math.abs(Math.round(amount || 0));
  const formatted = intVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${type === 'income' ? '+' : '-'}${formatted}${symbol}`;
}

export function formatShortVND(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  if (abs === 0) return '0';
  if (abs >= 1_000_000_000) {
    const val = (abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '');
    return `${val}tỷ`;
  }
  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${val}tr`;
  }
  if (abs >= 1_000) {
    const val = Math.round(abs / 1_000);
    return `${val}k`;
  }
  return `${abs}đ`;
}

export function formatIntegerDots(rawDigits: string): string {
  const cleaned = rawDigits.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
  if (!cleaned) return '';
  return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function getTodayVN(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_VN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function getCurrentTimeVN(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ_VN,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const min = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${min}`;
}

export function getCurrentMonthKeyVN(): string {
  return getTodayVN().slice(0, 7);
}

export function getPreviousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function getNextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function formatDateVN(dateStr: string): string {
  if (!dateStr) return 'Chưa rõ ngày';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

export function formatMonthTitleVN(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return `Tháng ${m}/${y}`;
}

export function formatDateTimeReadable(iso: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: TZ_VN,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function inferSessionFromTime(time: string): SpendingSession {
  if (!time || !time.includes(':')) return '';
  const hour = parseInt(time.split(':')[0], 10);
  if (Number.isNaN(hour)) return '';
  if (hour >= 4 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 18) return 'afternoon';
  return 'evening';
}

export function getSessionLabel(session: SpendingSession): string {
  switch (session) {
    case 'morning':
      return 'Buổi sáng';
    case 'noon':
      return 'Buổi trưa';
    case 'afternoon':
      return 'Buổi chiều';
    case 'evening':
      return 'Buổi tối';
    default:
      return '';
  }
}

export function uid(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function compressImageFile(file: File, maxDim = 1280, quality = 0.78): Promise<{ dataUrl: string; sizeBytes: number; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp ảnh không hợp lệ'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: String(reader.result), sizeBytes: file.size, mimeType: file.type });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const sizeBytes = Math.round((dataUrl.length * 3) / 4);
        resolve({ dataUrl, sizeBytes, mimeType: 'image/jpeg' });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function hexToSoftTint(hex: string, alpha = 0.14): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(32, 184, 137, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
