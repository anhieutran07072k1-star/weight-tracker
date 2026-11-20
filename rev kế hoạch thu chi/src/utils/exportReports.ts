import * as XLSX from 'xlsx';
import { Category, FinancialAccount, Transaction } from '../types/finance';
import { formatDateVN, formatVND } from './format';

export interface ReportExportOptions {
  title: string;
  periodLabel: string;
  transactions: Transaction[];
  categories: Category[];
  accounts: FinancialAccount[];
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  currencySymbol?: string;
}

function buildRows(opts: ReportExportOptions) {
  const catMap = new Map(opts.categories.map((c) => [c.id, c.name]));
  const accMap = new Map(opts.accounts.map((a) => [a.id, a.name]));

  return opts.transactions.map((tx, idx) => ({
    STT: idx + 1,
    'Ngày': tx.date ? formatDateVN(tx.date) : 'Không rõ',
    'Giờ': tx.time || 'Không xác định',
    'Loại': tx.type === 'income' ? 'Thu' : 'Chi',
    'Danh mục': catMap.get(tx.categoryId) || 'Khác',
    'Nội dung': tx.note || '',
    'Tài khoản': accMap.get(tx.accountId) || 'Chưa chọn',
    'Số tiền (VND)': tx.type === 'income' ? tx.amount : -tx.amount,
  }));
}

export function exportReportToExcel(opts: ReportExportOptions): void {
  const rows = buildRows(opts);
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ['BÁO CÁO TÀI CHÍNH CÁ NHÂN - KẾ HOẠCH THU CHI'],
    ['Tiêu đề', opts.title],
    ['Khoảng thời gian', opts.periodLabel],
    ['Tổng thu', opts.totalIncome],
    ['Tổng chi', opts.totalExpense],
    ['Chênh lệch', opts.netBalance],
    ['Số giao dịch', opts.transactions.length],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'TongQuan');

  const wsTx = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsTx, 'ChiTietGiaoDich');

  const fileName = `BaoCao_ThuChi_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportReportToCSV(opts: ReportExportOptions): void {
  const rows = buildRows(opts);
  const headers = ['STT', 'Ngày', 'Giờ', 'Loại', 'Danh mục', 'Nội dung', 'Tài khoản', 'Số tiền (VND)'];

  const escapeCell = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escapeCell((r as Record<string, unknown>)[h])).join(',')),
    '',
    `Tổng thu,,,,,,,${opts.totalIncome}`,
    `Tổng chi,,,,,,,${opts.totalExpense}`,
    `Chênh lệch,,,,,,,${opts.netBalance}`,
  ];

  // UTF-8 BOM for proper Vietnamese rendering in Excel
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BaoCao_ThuChi_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReportToPDF(opts: ReportExportOptions): void {
  const catMap = new Map(opts.categories.map((c) => [c.id, c.name]));
  const accMap = new Map(opts.accounts.map((a) => [a.id, a.name]));
  const sym = opts.currencySymbol || 'đ';

  // Render clean printable HTML in hidden iframe so window.open isn't needed (iFrame-safe!)
  const rowsHtml = opts.transactions
    .map(
      (tx, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${tx.date ? formatDateVN(tx.date) : 'Chưa rõ'} ${tx.time || ''}</td>
        <td>${tx.type === 'income' ? 'Thu' : 'Chi'}</td>
        <td>${catMap.get(tx.categoryId) || 'Khác'}</td>
        <td>${(tx.note || '').replace(/</g, '&lt;')}</td>
        <td>${accMap.get(tx.accountId) || 'Chưa chọn'}</td>
        <td style="text-align:right;font-weight:600;color:${tx.type === 'income' ? '#16A34A' : '#E45F63'};">
          ${tx.type === 'income' ? '+' : '-'}${formatVND(tx.amount, sym)}
        </td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
  <html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${opts.title}</title>
    <style>
      body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 24px; color: #1A2E25; font-size: 12px; }
      h1 { font-size: 20px; color: #294D3E; margin: 0 0 4px 0; }
      .sub { color: #52796F; margin-bottom: 16px; }
      .kpis { display: flex; gap: 16px; margin-bottom: 20px; }
      .kpi { border: 1px solid #D1E7DD; border-radius: 10px; padding: 10px 14px; flex: 1; background: #F5F8F6; }
      .kpi-label { font-size: 11px; color: #52796F; }
      .kpi-val { font-size: 16px; font-weight: 700; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #E2E8F0; padding: 7px 8px; text-align: left; }
      th { background: #E9F7EF; color: #294D3E; font-weight: 600; }
    </style>
  </head>
  <body>
    <h1>${opts.title}</h1>
    <div class="sub">Kỳ báo cáo: ${opts.periodLabel} · Xuất ngày ${formatDateVN(new Date().toISOString().slice(0, 10))}</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Tổng thu</div><div class="kpi-val" style="color:#20B889;">${formatVND(opts.totalIncome, sym)}</div></div>
      <div class="kpi"><div class="kpi-label">Tổng chi</div><div class="kpi-val" style="color:#E45F63;">${formatVND(opts.totalExpense, sym)}</div></div>
      <div class="kpi"><div class="kpi-label">Chênh lệch</div><div class="kpi-val" style="color:#294D3E;">${formatVND(opts.netBalance, sym)}</div></div>
      <div class="kpi"><div class="kpi-label">Số giao dịch</div><div class="kpi-val">${opts.transactions.length}</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:36px;text-align:center;">STT</th>
          <th>Thời gian</th>
          <th>Loại</th>
          <th>Danh mục</th>
          <th>Nội dung</th>
          <th>Tài khoản</th>
          <th style="text-align:right;">Số tiền</th>
        </tr>
      </thead>
      <tbody>${rowsHtml || '<tr><td colspan="7" style="text-align:center;">Không có giao dịch nào.</td></tr>'}</tbody>
    </table>
  </body>
  </html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 250);
  }
}
