import React, { useEffect, useState } from 'react';
import { AlertTriangle, Camera, Check, Mic, Sparkles, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SpendingSession, TransactionType } from '../types/finance';
import { formatDateVN, formatVND, getSessionLabel } from '../utils/format';
import { ParsedQuickTransaction, parseSmartTransactionText } from '../utils/smartParser';

export const QuickSmartBar: React.FC = () => {
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const aliases = useAppStore((s) => s.aliases);
  const symbol = useAppStore((s) => s.settings.currencySymbol);
  const addTransaction = useAppStore((s) => s.addTransaction);
  const setVoiceModalOpen = useAppStore((s) => s.setVoiceModalOpen);
  const setOcrModalOpen = useAppStore((s) => s.setOcrModalOpen);

  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ParsedQuickTransaction | null>(null);

  // Editable overrides on preview
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState('');
  const [session, setSession] = useState<SpendingSession>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!input.trim()) {
      setPreview(null);
      return;
    }
    const parsed = parseSmartTransactionText(input, accounts, categories, aliases);
    setPreview(parsed);
    setType(parsed.type);
    setAmount(parsed.amount);
    setCategoryId(parsed.categoryId);
    setAccountId(parsed.accountId);
    setDate(parsed.date);
    setSession(parsed.session);
    setNote(parsed.note);
  }, [input, accounts, categories, aliases]);

  const handleConfirmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview || amount <= 0) return;
    await addTransaction({
      type,
      amount,
      categoryId,
      accountId,
      date,
      time: preview.time,
      session,
      note: note.trim() || input.trim(),
      attachmentIds: [],
      status: 'completed',
    });
    setInput('');
    setPreview(null);
  };

  const activeAccounts = accounts.filter((a) => a.isActive);
  const matchingCats = categories.filter((c) => c.type === type && !c.isHidden);

  return (
    <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1 flex items-center">
          <Sparkles className="w-4 h-4 text-[#20B889] absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Nhập nhanh: "15k mua cá TM", "15.9 20k rau MM", "120k đổ xăng momo"...'
            className="w-full rounded-2xl border border-slate-200 dark:border-emerald-900/60 bg-[#F5F8F6] dark:bg-[#0D1713] pl-10 pr-9 py-2.5 text-sm outline-none focus:border-[#20B889]"
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setVoiceModalOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#E9F7EF] dark:bg-emerald-950/60 hover:bg-[#d5f2e1] px-3.5 py-2.5 text-xs font-bold text-[#294D3E] dark:text-emerald-200 cursor-pointer whitespace-nowrap"
          >
            <Mic className="w-4 h-4 text-[#20B889]" />
            <span>Giọng nói</span>
          </button>
          <button
            type="button"
            onClick={() => setOcrModalOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#E9F7EF] dark:bg-emerald-950/60 hover:bg-[#d5f2e1] px-3.5 py-2.5 text-xs font-bold text-[#294D3E] dark:text-emerald-200 cursor-pointer whitespace-nowrap"
          >
            <Camera className="w-4 h-4 text-[#20B889]" />
            <span>Hóa đơn / Ảnh</span>
          </button>
        </div>
      </div>

      {/* Quick syntax examples */}
      {!preview && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span>Ví dụ nhanh:</span>
          {['15k mua cá TM', '15.9 20k rau MM', '50k ăn sáng tiền mặt', '100k tiền điện BIDV'].map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setInput(ex)}
              className="rounded-lg bg-[#F5F8F6] dark:bg-[#0D1713] px-2 py-0.5 hover:text-[#20B889] cursor-pointer"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Parsed Preview & Confirmation Card */}
      {preview && (
        <form
          onSubmit={handleConfirmSave}
          className="rounded-2xl bg-[#E9F7EF]/60 dark:bg-[#0D1713] border border-emerald-200 dark:border-emerald-900/60 p-3.5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  type === 'expense' ? 'bg-[#E45F63] text-white' : 'bg-white dark:bg-[#13221C] text-slate-500'
                }`}
              >
                Chi
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  type === 'income' ? 'bg-[#20B889] text-white' : 'bg-white dark:bg-[#13221C] text-slate-500'
                }`}
              >
                Thu
              </button>
              <span className="text-base font-bold font-money text-[#294D3E] dark:text-emerald-100">
                {amount > 0 ? formatVND(amount, symbol) : 'Chưa rõ số tiền'}
              </span>
              {session && (
                <span className="text-xs text-slate-500">· {getSessionLabel(session)}</span>
              )}
              <span className="text-xs text-slate-500">· {formatDateVN(date)}</span>
            </div>

            <button
              type="submit"
              disabled={amount <= 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white px-4 py-2 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Xác nhận &amp; Lưu</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              type="number"
              min={0}
              value={amount || ''}
              onChange={(e) => setAmount(Math.round(parseInt(e.target.value, 10) || 0))}
              placeholder="Số tiền (VND)"
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-2.5 py-1.5 text-xs font-money"
            />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-2.5 py-1.5 text-xs"
            >
              {matchingCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.sticker} {c.name}
                </option>
              ))}
            </select>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-2.5 py-1.5 text-xs"
            >
              <option value="">-- Chọn tài khoản --</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.sticker} {a.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú"
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-2.5 py-1.5 text-xs"
            />
          </div>

          {preview.warnings.length > 0 && (
            <div className="space-y-1">
              {preview.warnings.map((w, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </form>
      )}
    </div>
  );
};
