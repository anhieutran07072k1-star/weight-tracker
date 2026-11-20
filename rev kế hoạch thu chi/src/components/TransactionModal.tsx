import React, { useEffect, useState } from 'react';
import { Camera, Clock, Eraser, Image as ImageIcon, Trash2, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SpendingSession, TransactionType } from '../types/finance';
import {
  compressImageFile,
  formatDateTimeReadable,
  getCurrentTimeVN,
  getTodayVN,
  inferSessionFromTime,
} from '../utils/format';
import { SmartAmountInput } from './SmartAmountInput';

export const TransactionModal: React.FC = () => {
  const open = useAppStore((s) => s.txModalOpen);
  const initialType = useAppStore((s) => s.txModalInitialType);
  const editing = useAppStore((s) => s.editingTransaction);
  const closeTxModal = useAppStore((s) => s.closeTxModal);

  const categories = useAppStore((s) => s.categories);
  const accounts = useAppStore((s) => s.accounts);
  const attachments = useAppStore((s) => s.attachments);
  const addTransaction = useAppStore((s) => s.addTransaction);
  const updateTransaction = useAppStore((s) => s.updateTransaction);
  const deleteTransaction = useAppStore((s) => s.deleteTransaction);

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayVN());
  const [time, setTime] = useState<string>(getCurrentTimeVN());
  const [session, setSession] = useState<SpendingSession>('');
  const [sourceOrRecipient, setSourceOrRecipient] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [existingAttachmentIds, setExistingAttachmentIds] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<
    Array<{ dataUrl: string; fileName: string; mimeType: string; sizeBytes: number }>
  >([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const activeAccounts = accounts.filter((a) => a.isActive);
  const visibleCategories = categories.filter((c) => c.type === type && !c.isHidden);

  useEffect(() => {
    if (!open) return;
    setError('');
    setPendingImages([]);
    if (editing) {
      setType(editing.type);
      setAmount(editing.amount);
      setCategoryId(editing.categoryId);
      setAccountId(editing.accountId);
      setDate(editing.date);
      setTime(editing.time);
      setSession(editing.session);
      setSourceOrRecipient(editing.sourceOrRecipient || '');
      setNote(editing.note);
      setExistingAttachmentIds(editing.attachmentIds || []);
    } else {
      const defType = initialType;
      setType(defType);
      setAmount(0);
      const firstCat = categories.find((c) => c.type === defType && !c.isHidden);
      setCategoryId(firstCat?.id || '');
      setAccountId(activeAccounts[0]?.id || '');
      const today = getTodayVN();
      const nowTime = getCurrentTimeVN();
      setDate(today);
      setTime(nowTime);
      setSession(inferSessionFromTime(nowTime));
      setSourceOrRecipient('');
      setNote('');
      setExistingAttachmentIds([]);
    }
  }, [open, editing, initialType]);

  // Keep category synced if switching between Thu and Chi
  const handleSwitchType = (nextType: TransactionType) => {
    setType(nextType);
    const matching = categories.find((c) => c.id === categoryId && c.type === nextType);
    if (!matching) {
      const first = categories.find((c) => c.type === nextType && !c.isHidden);
      setCategoryId(first?.id || '');
    }
  };

  const handleTimeChange = (nextTime: string) => {
    setTime(nextTime);
    if (nextTime && !session) {
      setSession(inferSessionFromTime(nextTime));
    }
  };

  const handleClearDateTime = () => {
    setDate('');
    setTime('');
    setSession('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const compressed: Array<{ dataUrl: string; fileName: string; mimeType: string; sizeBytes: number }> = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const res = await compressImageFile(f);
      compressed.push({
        dataUrl: res.dataUrl,
        fileName: f.name,
        mimeType: res.mimeType,
        sizeBytes: res.sizeBytes,
      });
    }
    setPendingImages((prev) => [...prev, ...compressed]);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (amount <= 0) {
      setError('Vui lòng nhập số tiền lớn hơn 0.');
      return;
    }
    if (!categoryId) {
      setError('Vui lòng chọn danh mục.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateTransaction(
          editing.id,
          {
            type,
            amount,
            categoryId,
            accountId,
            date,
            time,
            session,
            sourceOrRecipient: sourceOrRecipient.trim(),
            note: note.trim(),
            attachmentIds: existingAttachmentIds,
          },
          pendingImages
        );
      } else {
        await addTransaction(
          {
            type,
            amount,
            categoryId,
            accountId,
            date,
            time,
            session,
            sourceOrRecipient: sourceOrRecipient.trim(),
            note: note.trim(),
            attachmentIds: [],
            status: 'completed',
          },
          pendingImages
        );
      }
      closeTxModal();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    await deleteTransaction(editing.id);
    closeTxModal();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/60 shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white/95 dark:bg-[#13221C]/95 backdrop-blur-md border-b border-slate-100 dark:border-emerald-900/40">
          <h2 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
            {editing ? 'Chỉnh sửa giao dịch' : 'Thêm giao dịch mới'}
          </h2>
          <button
            type="button"
            onClick={closeTxModal}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Thu / Chi Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713]">
            <button
              type="button"
              onClick={() => handleSwitchType('expense')}
              className={`py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                type === 'expense'
                  ? 'bg-[#E45F63] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Khoản CHI (-)
            </button>
            <button
              type="button"
              onClick={() => handleSwitchType('income')}
              className={`py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                type === 'income'
                  ? 'bg-[#20B889] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Khoản THU (+)
            </button>
          </div>

          {/* Smart Amount */}
          <SmartAmountInput
            value={amount}
            onChange={setAmount}
            autoFocus={!editing}
            accentTone={type}
          />

          {/* Category grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              Danh mục {type === 'income' ? 'thu' : 'chi'}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
              {visibleCategories.map((cat) => {
                const selected = cat.id === categoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                      selected
                        ? 'border-[#20B889] bg-[#E9F7EF] dark:bg-emerald-950/70 text-[#294D3E] dark:text-emerald-100 ring-1 ring-[#20B889]'
                        : 'border-slate-200 dark:border-emerald-900/40 bg-white dark:bg-[#0D1713] text-slate-600 dark:text-slate-300 hover:border-emerald-300'
                    }`}
                  >
                    <span className="text-base shrink-0">{cat.sticker}</span>
                    <span className="truncate">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Account */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              {type === 'income' ? 'Tài khoản nhận tiền' : 'Tài khoản thanh toán'}
            </label>
            <div className="flex flex-wrap gap-2">
              {activeAccounts.map((acc) => {
                const selected = acc.id === accountId;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setAccountId(acc.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'border-[#20B889] bg-[#E9F7EF] dark:bg-emerald-950 text-[#294D3E] dark:text-emerald-100'
                        : 'border-slate-200 dark:border-emerald-900/40 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span>{acc.sticker}</span>
                    <span>{acc.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setAccountId('')}
                className={`px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer ${
                  accountId === ''
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                    : 'border-slate-200 dark:border-emerald-900/40 text-slate-500'
                }`}
              >
                Chưa chọn tài khoản
              </button>
            </div>
          </div>

          {/* Date & Time + Clear button */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Thời điểm thực hiện giao dịch</span>
              </label>
              <button
                type="button"
                onClick={handleClearDateTime}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#E45F63] cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Xóa ngày giờ</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm outline-none focus:border-[#20B889]"
              />
              <input
                type="time"
                value={time}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm outline-none focus:border-[#20B889]"
              />
            </div>
          </div>

          {/* Spending Session (for Expense or optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Buổi (tùy chọn)
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { key: '' as SpendingSession, label: 'Không chọn' },
                { key: 'morning' as SpendingSession, label: 'Sáng' },
                { key: 'noon' as SpendingSession, label: 'Trưa' },
                { key: 'afternoon' as SpendingSession, label: 'Chiều' },
                { key: 'evening' as SpendingSession, label: 'Tối' },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setSession(opt.key)}
                  className={`py-2 px-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    session === opt.key
                      ? 'border-[#20B889] bg-[#E9F7EF] dark:bg-emerald-950 text-[#294D3E] dark:text-emerald-200'
                      : 'border-slate-200 dark:border-emerald-900/40 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source/Recipient for Income */}
          {type === 'income' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Người gửi / Nguồn tiền (không bắt buộc)
              </label>
              <input
                type="text"
                value={sourceOrRecipient}
                onChange={(e) => setSourceOrRecipient(e.target.value)}
                placeholder="Ví dụ: Công ty A, Khách hàng, Người thân..."
                className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
              />
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Ghi chú
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={type === 'income' ? 'Ví dụ: Nhận lương tháng 9' : 'Ví dụ: Ăn sáng bánh cuốn, mua rau...'}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
            />
          </div>

          {/* Attachments (Camera / Gallery) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              Hình ảnh hóa đơn / sản phẩm
            </label>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-emerald-400 bg-[#E9F7EF]/60 dark:bg-emerald-950/30 text-xs font-semibold text-[#294D3E] dark:text-emerald-200 cursor-pointer hover:bg-[#E9F7EF]">
                <Camera className="w-4 h-4" />
                <span>Chụp ảnh</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-emerald-900/50 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <ImageIcon className="w-4 h-4" />
                <span>Chọn từ thư viện</span>
                <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {(existingAttachmentIds.length > 0 || pendingImages.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {existingAttachmentIds.map((attId) => {
                  const att = attachments.find((a) => a.id === attId);
                  if (!att) return null;
                  return (
                    <div key={attId} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200">
                      <img src={att.dataUrl} alt={att.fileName} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setExistingAttachmentIds((prev) => prev.filter((x) => x !== attId))}
                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-emerald-300">
                    <img src={img.dataUrl} alt={img.fileName} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editing && (
            <div className="text-xs text-slate-400 pt-1 border-t border-slate-100 dark:border-emerald-900/40">
              Thời điểm ghi nhận: {formatDateTimeReadable(editing.createdAt)} · Cập nhật:{' '}
              {formatDateTimeReadable(editing.updatedAt)}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2 text-xs font-medium text-[#E45F63]">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            {editing && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/60 px-4 py-3 text-sm font-semibold text-[#E45F63] hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xóa</span>
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white font-bold py-3 px-4 text-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Lưu giao dịch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
