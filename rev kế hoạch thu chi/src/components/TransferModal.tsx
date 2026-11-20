import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Info, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatVND, getCurrentTimeVN, getTodayVN } from '../utils/format';
import { SmartAmountInput } from './SmartAmountInput';

export const TransferModal: React.FC = () => {
  const open = useAppStore((s) => s.transferModalOpen);
  const setOpen = useAppStore((s) => s.setTransferModalOpen);
  const accounts = useAppStore((s) => s.accounts);
  const getAccountBalance = useAppStore((s) => s.getAccountBalance);
  const addTransfer = useAppStore((s) => s.addTransfer);
  const symbol = useAppStore((s) => s.settings.currencySymbol);
  const hideBalances = useAppStore((s) => s.settings.hideBalances);

  const activeAccounts = accounts.filter((a) => a.isActive);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(getTodayVN());
  const [time, setTime] = useState(getCurrentTimeVN());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setAmount(0);
    setNote('');
    setDate(getTodayVN());
    setTime(getCurrentTimeVN());
    if (activeAccounts.length >= 2) {
      setFromId(activeAccounts[0].id);
      setToId(activeAccounts[1].id);
    } else if (activeAccounts.length === 1) {
      setFromId(activeAccounts[0].id);
      setToId('');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fromId || !toId) {
      setError('Vui lòng chọn cả tài khoản nguồn và tài khoản đích.');
      return;
    }
    if (fromId === toId) {
      setError('Tài khoản nguồn và tài khoản đích phải khác nhau.');
      return;
    }
    if (amount <= 0) {
      setError('Vui lòng nhập số tiền chuyển lớn hơn 0.');
      return;
    }

    await addTransfer({
      fromAccountId: fromId,
      toAccountId: toId,
      amount,
      date,
      time,
      note: note.trim() || 'Chuyển tiền nội bộ',
    });
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/60 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-emerald-900/40">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-[#20B889]" />
            <h2 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Chuyển tiền giữa các tài khoản</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-start gap-2 rounded-2xl bg-[#E9F7EF] dark:bg-emerald-950/50 p-3 text-xs text-[#294D3E] dark:text-emerald-200">
            <Info className="w-4 h-4 text-[#20B889] shrink-0 mt-0.5" />
            <span>
              Chuyển tiền nội bộ không tính là Thu hay Chi, không làm thay đổi tổng tài sản thực tế và ngân sách tháng.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Từ tài khoản
              </label>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3 py-2.5 text-sm outline-none focus:border-[#20B889]"
              >
                <option value="">-- Chọn --</option>
                {activeAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.sticker} {acc.name} ({formatVND(getAccountBalance(acc.id), symbol, hideBalances)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Đến tài khoản
              </label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3 py-2.5 text-sm outline-none focus:border-[#20B889]"
              >
                <option value="">-- Chọn --</option>
                {activeAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.sticker} {acc.name} ({formatVND(getAccountBalance(acc.id), symbol, hideBalances)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SmartAmountInput value={amount} onChange={setAmount} label="Số tiền chuyển" />

          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm outline-none focus:border-[#20B889]"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm outline-none focus:border-[#20B889]"
            />
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú chuyển tiền (vd: Nạp ví MoMo)"
            className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
          />

          {error && <p className="text-xs font-medium text-[#E45F63]">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-xl bg-[#294D3E] hover:bg-[#1f3b2f] text-white font-bold py-3 text-sm cursor-pointer"
          >
            Xác nhận chuyển tiền
          </button>
        </form>
      </div>
    </div>
  );
};
