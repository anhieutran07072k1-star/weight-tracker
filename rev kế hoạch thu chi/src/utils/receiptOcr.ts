import Tesseract from 'tesseract.js';
import { getCurrentTimeVN, getTodayVN } from './format';

export interface ReceiptLineItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ParsedReceiptData {
  rawText: string;
  storeName: string;
  date: string;
  time: string;
  items: ReceiptLineItem[];
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  warnings: string[];
}

function parseMoneyString(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return 0;
  return Math.round(parseInt(digits, 10) || 0);
}

export function parseReceiptText(rawText: string): ParsedReceiptData {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const warnings: string[] = [];
  let storeName = '';
  let date = '';
  let time = '';
  let shippingFee = 0;
  let taxAmount = 0;
  let totalAmount = 0;
  const items: ReceiptLineItem[] = [];

  // Guess store name from first non-numeric meaningful header line
  for (const line of lines.slice(0, 5)) {
    if (!/^(hóa đơn|hoa don|phiếu|phieu|ngày|ngay|mst|địa chỉ|dia chi|tel|sdt|\d)/i.test(line) && line.length >= 3) {
      storeName = line;
      break;
    }
  }

  // Extract date (dd/mm/yyyy or dd-mm-yyyy)
  const dateMatch = rawText.match(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/);
  if (dateMatch) {
    const dd = dateMatch[1].padStart(2, '0');
    const mm = dateMatch[2].padStart(2, '0');
    const yyyy = dateMatch[3];
    date = `${yyyy}-${mm}-${dd}`;
  }

  // Extract time (HH:mm)
  const timeMatch = rawText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (timeMatch) {
    time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Shipping
    if (/phí vận chuyển|phi van chuyen|giao hàng|ship/i.test(lower)) {
      const m = line.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,7})\s*(?:đ|d|vnd)?$/i);
      if (m) shippingFee = parseMoneyString(m[1]);
      continue;
    }

    // Tax / VAT
    if (/\b(vat|thuế|thue)\b/i.test(lower)) {
      const m = line.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,7})\s*(?:đ|d|vnd)?$/i);
      if (m) taxAmount = parseMoneyString(m[1]);
      continue;
    }

    // Total payment
    if (/tổng thanh toán|tong thanh toan|tổng cộng|tong cong|thành tiền|thanh tien|total|khách phải trả|phải trả/i.test(lower)) {
      const m = line.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,9})\s*(?:đ|d|vnd)?$/i);
      if (m) {
        const val = parseMoneyString(m[1]);
        if (val > totalAmount) totalAmount = val;
      }
      continue;
    }

    // Line item pattern: "<Product Name> ... <qty>? ... <price>"
    const itemMatch = line.match(/^(.{2,40}?)\s+(?:(\d+)\s*[xX*]\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{4,8})\s*(?:đ|d|vnd)?$/);
    if (itemMatch && !/tiền mặt|tiền thừa|giảm giá|chiết khấu|mã|số lượng/i.test(lower)) {
      const name = itemMatch[1].trim();
      const qty = itemMatch[2] ? Math.max(1, parseInt(itemMatch[2], 10)) : 1;
      const lineTotal = parseMoneyString(itemMatch[3]);
      if (lineTotal >= 1000 && name.length >= 2) {
        items.push({
          id: `ocr_item_${items.length + 1}`,
          name,
          quantity: qty,
          unitPrice: Math.round(lineTotal / qty),
          lineTotal,
        });
      }
    }
  }

  if (totalAmount === 0 && items.length > 0) {
    totalAmount = items.reduce((sum, it) => sum + it.lineTotal, 0) + shippingFee + taxAmount;
  }

  if (!date) {
    warnings.push('Không đọc được ngày trên hóa đơn — vui lòng kiểm tra hoặc chọn ngày.');
    date = getTodayVN();
  }
  if (!time) {
    time = getCurrentTimeVN();
  }
  if (totalAmount === 0) {
    warnings.push('Không đọc được tổng số tiền từ ảnh hóa đơn — vui lòng nhập số tiền thủ công.');
  }

  return {
    rawText,
    storeName,
    date,
    time,
    items,
    shippingFee,
    taxAmount,
    totalAmount,
    warnings,
  };
}

export async function runLocalReceiptOCR(
  imageDataUrl: string,
  onProgress?: (progress: number, statusText: string) => void
): Promise<ParsedReceiptData> {
  try {
    const result = await Tesseract.recognize(imageDataUrl, 'vie+eng', {
      logger: (m) => {
        if (onProgress && typeof m.progress === 'number') {
          onProgress(Math.round(m.progress * 100), m.status || 'Đang nhận dạng...');
        }
      },
    });
    return parseReceiptText(result.data.text || '');
  } catch {
    // Fallback to English model or empty editable result if offline without traineddata
    try {
      const fallbackResult = await Tesseract.recognize(imageDataUrl, 'eng', {
        logger: (m) => {
          if (onProgress && typeof m.progress === 'number') {
            onProgress(Math.round(m.progress * 100), m.status || 'Đang nhận dạng (chế độ cơ bản)...');
          }
        },
      });
      const parsed = parseReceiptText(fallbackResult.data.text || '');
      parsed.warnings.unshift('Đang dùng gói nhận dạng cơ bản (ngoại tuyến). Vui lòng kiểm tra kỹ dấu tiếng Việt.');
      return parsed;
    } catch {
      return {
        rawText: '',
        storeName: '',
        date: getTodayVN(),
        time: getCurrentTimeVN(),
        items: [],
        shippingFee: 0,
        taxAmount: 0,
        totalAmount: 0,
        warnings: [
          'Không thể tải bộ dữ liệu OCR ngoại tuyến lúc này. Ảnh hóa đơn đã được đính kèm — bạn hãy nhập số tiền và nội dung bên dưới.',
        ],
      };
    }
  }
}
