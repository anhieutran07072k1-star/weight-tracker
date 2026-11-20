import { Category, FinancialAccount, QuickInputAlias, SpendingSession, TransactionType } from '../types/finance';
import { getCurrentTimeVN, getTodayVN, inferSessionFromTime } from './format';

export interface ParsedQuickTransaction {
  type: TransactionType;
  amount: number;
  categoryId: string;
  categoryName: string;
  accountId: string;
  accountName: string;
  date: string;
  time: string;
  session: SpendingSession;
  note: string;
  warnings: string[];
  ambiguousTokens: string[];
}

const EXPENSE_KEYWORDS: Array<{ keywords: string[]; categoryName: string }> = [
  { keywords: ['cá', 'rau', 'thịt', 'trứng', 'chợ', 'siêu thị', 'bách hóa', 'tôm', 'gạo', 'trái cây', 'hoa quả'], categoryName: 'Đi chợ' },
  { keywords: ['ăn sáng', 'ăn trưa', 'ăn tối', 'cơm', 'phở', 'bún', 'bánh cuốn', 'bánh mì', 'trà sữa', 'cà phê', 'cafe', 'uống', 'ăn', 'nhậu', 'lẩu', 'pizza', 'gà rán'], categoryName: 'Ăn uống' },
  { keywords: ['xăng', 'đổ xăng', 'grab', 'be', 'xanh sm', 'taxi', 'xe buýt', 'gửi xe', 'vé xe', 'tàu', 'bay'], categoryName: 'Di chuyển' },
  { keywords: ['điện', 'nước', 'internet', 'wifi', 'mạng', 'tiền điện', 'tiền nước'], categoryName: 'Điện nước' },
  { keywords: ['hóa đơn', 'cước', 'điện thoại', 'nạp thẻ'], categoryName: 'Hóa đơn' },
  { keywords: ['shopee', 'lazada', 'tiktok', 'tiki', 'mua', 'mỹ phẩm', 'quần áo', 'giày', 'dép', 'áo', 'váy'], categoryName: 'Mua sắm' },
  { keywords: ['thuốc', 'khám', 'bệnh viện', 'bác sĩ', 'vitamin', 'nha khoa'], categoryName: 'Sức khỏe' },
  { keywords: ['son', 'kem', 'tóc', 'nail', 'spa', 'gội đầu'], categoryName: 'Làm đẹp' },
  { keywords: ['phim', 'rạp', 'game', 'netflix', 'spotify', 'karaoke'], categoryName: 'Giải trí' },
  { keywords: ['tiền nhà', 'thuê nhà', 'phòng trọ', 'chung cư', 'sửa nhà'], categoryName: 'Nhà cửa' },
  { keywords: ['du lịch', 'khách sạn', 'homestay', 'vé tham quan'], categoryName: 'Du lịch' },
  { keywords: ['học', 'sách', 'khóa học', 'học phí'], categoryName: 'Giáo dục' },
  { keywords: ['chó', 'mèo', 'thú cưng', 'cát mèo', 'hạt'], categoryName: 'Thú cưng' },
];

const INCOME_KEYWORDS: Array<{ keywords: string[]; categoryName: string }> = [
  { keywords: ['lương', 'nhận lương', 'tiền lương'], categoryName: 'Lương' },
  { keywords: ['thưởng', 'hoa hồng', 'bonus'], categoryName: 'Thưởng' },
  { keywords: ['bán hàng', 'kinh doanh', 'doanh thu', 'đơn hàng'], categoryName: 'Kinh doanh' },
  { keywords: ['được tặng', 'lì xì', 'cho tiền', 'biếu'], categoryName: 'Được tặng' },
  { keywords: ['hoàn tiền', 'cashback', 'được trả', 'trả lại'], categoryName: 'Được trả tiền' },
  { keywords: ['thu hồi nợ', 'trả nợ cho mình'], categoryName: 'Thu hồi nợ' },
  { keywords: ['lãi tiết kiệm', 'lãi ngân hàng'], categoryName: 'Lãi tiết kiệm' },
  { keywords: ['tiền lãi cho vay', 'lãi cho vay'], categoryName: 'Tiền lãi cho vay' },
];

function shiftDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function parseSmartTransactionText(
  rawInput: string,
  accounts: FinancialAccount[],
  categories: Category[],
  aliases: QuickInputAlias[]
): ParsedQuickTransaction {
  let working = rawInput.trim();
  const warnings: string[] = [];
  const ambiguousTokens: string[] = [];
  const today = getTodayVN();
  const nowTime = getCurrentTimeVN();
  let date = today;
  const time = nowTime;

  // 1. Extract explicit date like 15.9, 15/9, 15/09/2026, 15-09-2026
  const fullDateMatch = working.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (fullDateMatch) {
    const dd = parseInt(fullDateMatch[1], 10);
    const mm = parseInt(fullDateMatch[2], 10);
    const yyyy = parseInt(fullDateMatch[3], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      date = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      working = working.replace(fullDateMatch[0], ' ').trim();
    }
  } else {
    const shortDateMatch = working.match(/(?:^|\s)(\d{1,2})[./-](\d{1,2})(?=\s|$)/);
    if (shortDateMatch) {
      const dd = parseInt(shortDateMatch[1], 10);
      const mm = parseInt(shortDateMatch[2], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const currentYear = today.slice(0, 4);
        date = `${currentYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        working = working.replace(shortDateMatch[0], ' ').trim();
      }
    }
  }

  // Relative date words
  const lowerAll = working.toLowerCase();
  if (lowerAll.includes('hôm kia')) {
    date = shiftDays(today, -2);
    working = working.replace(/hôm kia/gi, ' ');
  } else if (lowerAll.includes('hôm qua')) {
    date = shiftDays(today, -1);
    working = working.replace(/hôm qua/gi, ' ');
  } else if (lowerAll.includes('hôm nay')) {
    date = today;
    working = working.replace(/hôm nay/gi, ' ');
  }

  // 2. Session detection
  let session: SpendingSession = inferSessionFromTime(time);
  if (/sáng nay|buổi sáng|\bsáng\b/i.test(working)) {
    session = 'morning';
  } else if (/trưa nay|buổi trưa|\btrưa\b/i.test(working)) {
    session = 'noon';
  } else if (/chiều nay|buổi chiều|\bchiều\b/i.test(working)) {
    session = 'afternoon';
  } else if (/tối nay|buổi tối|\btối\b/i.test(working)) {
    session = 'evening';
  }

  // 3. Amount parsing (k, nghìn, ngàn, tr, triệu, đồng, vnđ, or dotted 50.000)
  let amount = 0;
  const unitRegex = /(\d+(?:[.,]\d+)?)\s*(triệu|tr|củ|nghìn|ngàn|k|lít|xị|đồng|vnd|đ)\b/i;
  const unitMatch = working.match(unitRegex);
  if (unitMatch) {
    const rawNum = unitMatch[1].replace(',', '.');
    const unit = unitMatch[2].toLowerCase();
    const numVal = parseFloat(rawNum);
    if (!Number.isNaN(numVal)) {
      if (unit === 'tr' || unit === 'triệu' || unit === 'củ') {
        amount = Math.round(numVal * 1_000_000);
      } else if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn') {
        amount = Math.round(numVal * 1_000);
      } else if (unit === 'lít' || unit === 'xị') {
        amount = Math.round(numVal * 100_000);
      } else {
        // Explicit đồng/đ
        const cleanFull = unitMatch[1].replace(/[.,]/g, '');
        amount = Math.round(parseInt(cleanFull, 10) || 0);
      }
      working = working.replace(unitMatch[0], ' ').trim();
    }
  } else {
    // Plain number like 50.000 or 50000
    const plainMatch = working.match(/\b(\d{1,3}(?:[.,]\d{3})+|\d{4,10})\b/);
    if (plainMatch) {
      const digits = plainMatch[1].replace(/[.,]/g, '');
      amount = Math.round(parseInt(digits, 10) || 0);
      working = working.replace(plainMatch[0], ' ').trim();
    }
  }

  if (amount <= 0) {
    warnings.push('Chưa nhận diện được số tiền — vui lòng nhập bổ sung.');
  }

  // 4. Account detection (strictly from configured aliases or exact account names, never guessing unknown abbreviations)
  let accountId = '';
  let accountName = '';

  const tokens = working.split(/\s+/).filter(Boolean);
  const consumedTokenIndices = new Set<number>();

  // Check user-defined aliases first (exact case-insensitive token match)
  for (let i = 0; i < tokens.length; i++) {
    const tokClean = tokens[i].replace(/[.,!?;:]+$/g, '');
    const aliasHit = aliases.find(
      (a) => a.targetType === 'account' && a.alias.toLowerCase() === tokClean.toLowerCase()
    );
    if (aliasHit) {
      const acc = accounts.find((a) => a.id === aliasHit.targetId && a.isActive);
      if (acc) {
        accountId = acc.id;
        accountName = acc.name;
        consumedTokenIndices.add(i);
        break;
      }
    }
  }

  // Check full account names inside working text (e.g. "tiền mặt", "momo", "bidv", "techcombank")
  if (!accountId) {
    const activeAccounts = accounts.filter((a) => a.isActive);
    for (const acc of activeAccounts) {
      const escaped = acc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:trả bằng|thanh toán qua|qua|bằng|từ|vào)?\\s*\\b${escaped}\\b`, 'i');
      if (regex.test(working)) {
        accountId = acc.id;
        accountName = acc.name;
        working = working.replace(regex, ' ').trim();
        break;
      }
    }
  } else {
    working = tokens.filter((_, idx) => !consumedTokenIndices.has(idx)).join(' ');
  }

  // Detect potential undefined uppercase/short abbreviations (2-4 uppercase chars not matched)
  for (const tok of working.split(/\s+/)) {
    const clean = tok.replace(/[.,!?;:]+$/g, '');
    if (/^[A-Z]{2,5}$/.test(clean) && !accountId) {
      ambiguousTokens.push(clean);
    }
  }
  if (ambiguousTokens.length > 0 && !accountId) {
    warnings.push(
      `Từ viết tắt "${ambiguousTokens.join(', ')}" chưa được thiết lập trong bảng viết tắt — hệ thống không tự suy đoán tài khoản.`
    );
  }
  if (!accountId) {
    warnings.push('Chưa xác định tài khoản thanh toán — vui lòng chọn thủ công.');
  }

  // 5. Type (income vs expense) & Category detection
  let type: TransactionType = 'expense';
  let categoryId = '';
  let categoryName = '';

  const workingLower = working.toLowerCase();

  // Check user-defined category aliases
  for (const a of aliases.filter((x) => x.targetType === 'category')) {
    const regex = new RegExp(`\\b${a.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(working)) {
      const cat = categories.find((c) => c.id === a.targetId && !c.isHidden);
      if (cat) {
        type = cat.type;
        categoryId = cat.id;
        categoryName = cat.name;
        break;
      }
    }
  }

  if (!categoryId) {
    // Check income keywords
    for (const rule of INCOME_KEYWORDS) {
      if (rule.keywords.some((kw) => workingLower.includes(kw))) {
        type = 'income';
        const matchedCat = categories.find(
          (c) => c.type === 'income' && c.name.toLowerCase() === rule.categoryName.toLowerCase() && !c.isHidden
        );
        if (matchedCat) {
          categoryId = matchedCat.id;
          categoryName = matchedCat.name;
        }
        break;
      }
    }
  }

  if (!categoryId) {
    // Check expense keywords
    for (const rule of EXPENSE_KEYWORDS) {
      if (rule.keywords.some((kw) => workingLower.includes(kw))) {
        type = 'expense';
        const matchedCat = categories.find(
          (c) => c.type === 'expense' && c.name.toLowerCase() === rule.categoryName.toLowerCase() && !c.isHidden
        );
        if (matchedCat) {
          categoryId = matchedCat.id;
          categoryName = matchedCat.name;
        }
        break;
      }
    }
  }

  if (!categoryId) {
    // Check direct match with any custom user category name
    const directCat = categories.find((c) => !c.isHidden && workingLower.includes(c.name.toLowerCase()));
    if (directCat) {
      type = directCat.type;
      categoryId = directCat.id;
      categoryName = directCat.name;
    }
  }

  // Fallback category suggestion
  if (!categoryId) {
    const fallback = categories.find((c) => c.type === type && !c.isHidden);
    if (fallback) {
      categoryId = fallback.id;
      categoryName = fallback.name;
    }
  }

  // 6. Clean note prose (capitalize nicely, strip filler connectors)
  let note = working
    .replace(/^(sáng nay|trưa nay|chiều nay|tối nay)?\s*(tôi|mình)?\s*(đã)?\s*(chi|mua|trả|ăn|hết)?\s*/i, '')
    .replace(/\b(hết|trả bằng|thanh toán bằng|bằng)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .trim();

  // If the original input started with e.g. "15k mua cá TM", note should read "Mua cá"
  if (!note && rawInput.trim()) {
    note = working.replace(/\s+/g, ' ').trim();
  }
  if (note.length > 0) {
    note = note.charAt(0).toUpperCase() + note.slice(1);
  }

  return {
    type,
    amount,
    categoryId,
    categoryName,
    accountId,
    accountName,
    date,
    time,
    session,
    note,
    warnings,
    ambiguousTokens,
  };
}
