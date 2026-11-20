import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AccountType, FinancialAccount } from '../types/finance';
import { formatVND } from '../utils/format';
import { SmartAmountInput } from './SmartAmountInput';

const ACC_STICKERS = ['💵', '👛', '🏦', '💳', '🪙', '💎', '📱', '🧧'];
const ACC_COLORS = ['#20B889', '#D82D8B', '#1D6FD8', '#E45F63', '#F2B85B', '#8B7AE8', '#294D3E'];

interface AccountModalProps {
  open: boolean;
  editing: FinancialAccount | null;
  mode: 'edit' | 'adjust';
  onClose: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({ open, editing, mode, onClose }) => {
  const accounts = useAppStore((s) => s.accounts);
  const getAccountBalance = useAppStore((s) => s.getAccountBalance);
  const saveAccount = useAppStore((s) => s.saveAccount);
  const adjustAccountBalance = useAppStore((s) => s.adjustAccountBalance);
  const symbol = useAppStore((s) => s.settings.currencySymbol);

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [sticker, setSticker] = useState('🏦');
  const [color, setColor] = useState('#20B889');
  const [balanceVal, setBalanceVal] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setSticker(editing.sticker);
      setColor(editing.color);
      setBalanceVal(mode === 'adjust' ? getAccountBalance(editing.id) : editing.initialBalance);
      setAdjustReason('');
    } else {
      setName('');
      setType('bank');
      setSticker('🏦');
      setColor('#20B889');
      setBalanceVal(0);
      setAdjustReason('');
    }
  }, [open, editing, mode]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'adjust' && editing) {
      await adjustAccountBalance(editing.id, balanceVal, adjustReason);
      onClose();
      return;
    }

    await saveAccount({
      id: editing?.id,
      name: name.trim(),
      type,
      sticker,
      color,
      initialBalance: balanceVal,
      isActive: editing?.isActive ?? true,
      isHidden: editing?.isHidden ?? false,
      sortOrder: editing?.sortOrder ?? accounts.length,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/60 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-emerald-900/40">
          <h2 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
            {mode === 'adjust'
              ? `Điều chỉnh số dư: ${editing?.name}`
              : editing
              ? `Sửa tài khoản: ${editing.name}`
              : 'Thêm tài khoản tài chính'}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {mode === 'adjust' && editing ? (
            <>
              <div className="rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3 text-xs text-slate-600 dark:text-slate-300">
                Số dư hệ thống hiện tại:{' '}
                <strong className="font-money text-[#294D3E] dark:text-emerald-200">
                  {formatVND(getAccountBalance(editing.id), symbol)}
                </strong>
              </div>
              <SmartAmountInput
                value={balanceVal}
                onChange={setBalanceVal}
                label="Số dư thực tế mới"
                showQuickChips={false}
              />
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Lý do điều chỉnh (được ghi vào lịch sử)
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ví dụ: Kiểm kê lại tiền mặt trong ví"
                  className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Tên tài khoản
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Tiền mặt, MoMo, Sacombank..."
                  className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'cash' as AccountType, label: 'Tiền mặt' },
                  { key: 'ewallet' as AccountType, label: 'Ví điện tử' },
                  { key: 'bank' as AccountType, label: 'Ngân hàng' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setType(t.key)}
                    className={`py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                      type === t.key
                        ? 'border-[#20B889] bg-[#E9F7EF] dark:bg-emerald-950 text-[#294D3E] dark:text-emerald-200'
                        : 'border-slate-200 dark:border-emerald-900/40 text-slate-500'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  {ACC_STICKERS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSticker(st)}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center cursor-pointer ${
                        sticker === st ? 'bg-[#20B889]/20 ring-2 ring-[#20B889]' : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {ACC_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full cursor-pointer ${color === c ? 'ring-2 ring-offset-2 ring-[#294D3E]' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <SmartAmountInput
                value={balanceVal}
                onChange={setBalanceVal}
                label="Số dư ban đầu"
                showQuickChips={false}
              />
            </>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white font-bold py-3 text-sm cursor-pointer"
          >
            {mode === 'adjust' ? 'Xác nhận điều chỉnh' : 'Lưu tài khoản'}
          </button>
        </form>
      </div>
    </div>
  );
};
