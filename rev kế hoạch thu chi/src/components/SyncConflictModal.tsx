import React from 'react';
import { AlertTriangle, Check, Cloud, Smartphone, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SyncConflict, SyncEntityType } from '../types/finance';
import { formatDateTimeReadable, formatVND } from '../utils/format';

const ENTITY_LABELS: Record<SyncEntityType, string> = {
  financialAccounts: 'Tài khoản tài chính',
  transactions: 'Giao dịch thu chi',
  categories: 'Danh mục',
  budgets: 'Ngân sách tháng',
  budgetCategories: 'Ngân sách danh mục',
  transfers: 'Chuyển khoản nội bộ',
  savings: 'Sổ tiết kiệm',
  loansGiven: 'Sổ cho vay',
  loansTaken: 'Sổ đi vay',
  loanRepayments: 'Thanh toán công nợ',
  specialItems: 'Tài sản & Chi tiêu riêng',
  financialEvents: 'Sự kiện lịch tài chính',
  customLedgers: 'Sổ riêng',
  ledgerTransactions: 'Giao dịch sổ riêng',
  diaryEntries: 'Nhật ký',
  attachments: 'Hình ảnh đính kèm',
  userSettings: 'Cài đặt ứng dụng',
  quickInputAliases: 'Từ viết tắt nhập nhanh',
  balanceAdjustments: 'Điều chỉnh số dư',
};

function summarizeRecord(
  conflict: SyncConflict,
  record: Record<string, any> | null,
  currencySymbol: string
): Array<{ label: string; value: string }> {
  if (!record) {
    return [{ label: 'Trạng thái', value: 'Đã bị xóa trên thiết bị này' }];
  }
  const rows: Array<{ label: string; value: string }> = [];
  if (typeof record.amount === 'number') {
    rows.push({ label: 'Số tiền', value: formatVND(record.amount, currencySymbol, false) });
  }
  if (typeof record.principalAmount === 'number') {
    rows.push({ label: 'Số tiền gốc', value: formatVND(record.principalAmount, currencySymbol, false) });
  }
  if (typeof record.totalLimit === 'number') {
    rows.push({ label: 'Hạn mức', value: formatVND(record.totalLimit, currencySymbol, false) });
  }
  if (record.name) rows.push({ label: 'Tên', value: String(record.name) });
  if (record.title) rows.push({ label: 'Tiêu đề', value: String(record.title) });
  if (record.date) rows.push({ label: 'Ngày', value: String(record.date) });
  if (record.note) rows.push({ label: 'Ghi chú', value: String(record.note) });
  if (rows.length === 0) {
    rows.push({ label: 'ID bản ghi', value: conflict.recordId });
  }
  return rows;
}

export const SyncConflictModal: React.FC = () => {
  const open = useAppStore((s) => s.conflictModalOpen);
  const setOpen = useAppStore((s) => s.setConflictModalOpen);
  const conflicts = useAppStore((s) => s.syncConflicts);
  const resolveSyncConflict = useAppStore((s) => s.resolveSyncConflict);
  const sym = useAppStore((s) => s.settings.currencySymbol);

  if (!open || conflicts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl bg-white dark:bg-[#13221C] border border-amber-200 dark:border-amber-800/60 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-emerald-900/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#294D3E] dark:text-emerald-100">
                Xử lý xung đột đồng bộ ({conflicts.length})
              </h3>
              <p className="text-xs text-slate-500">
                Bản ghi đã được chỉnh sửa đồng thời trên hai thiết bị. Chọn phiên bản muốn giữ lại:
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-emerald-950 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {conflicts.map((c) => {
            const localRows = summarizeRecord(c, c.localRecord, sym);
            const remoteRows = summarizeRecord(c, c.remoteRecord, sym);
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-[#294D3E] dark:text-emerald-100">
                    {ENTITY_LABELS[c.entityType] || c.entityType}
                  </span>
                  <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                    {c.conflictKind === 'edit_edit'
                      ? 'Cả hai thiết bị cùng chỉnh sửa'
                      : 'Một thiết bị sửa, một thiết bị xóa'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-white dark:bg-[#13221C] border border-emerald-200 dark:border-emerald-800/60 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-[#20B889]">
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Trên thiết bị này</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Cập nhật: {formatDateTimeReadable(c.localUpdatedAt)}
                    </p>
                    <div className="space-y-1 pt-1">
                      {localRows.map((r) => (
                        <p key={r.label} className="truncate">
                          <span className="text-slate-400">{r.label}: </span>
                          <strong className="text-[#1A2E25] dark:text-emerald-100">{r.value}</strong>
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white dark:bg-[#13221C] border border-blue-200 dark:border-blue-900/60 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400">
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Trên Google Drive</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Cập nhật: {formatDateTimeReadable(c.remoteUpdatedAt)}
                    </p>
                    <div className="space-y-1 pt-1">
                      {remoteRows.map((r) => (
                        <p key={r.label} className="truncate">
                          <span className="text-slate-400">{r.label}: </span>
                          <strong className="text-[#1A2E25] dark:text-emerald-100">{r.value}</strong>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void resolveSyncConflict(c.id, 'local')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] text-white px-3.5 py-2 text-xs font-bold cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Giữ bản trên máy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolveSyncConflict(c.id, 'remote')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 text-white px-3.5 py-2 text-xs font-bold cursor-pointer"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Dùng bản Google Drive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolveSyncConflict(c.id, 'latest')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#13221C] px-3.5 py-2 text-xs font-semibold cursor-pointer"
                  >
                    <span>Chọn bản mới nhất</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
