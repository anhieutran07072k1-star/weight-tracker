import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatIntegerDots, formatVND } from '../utils/format';

interface SmartAmountInputProps {
  value: number; // stored strict integer VND
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  showQuickChips?: boolean;
  accentTone?: 'expense' | 'income' | 'neutral';
}

const MAX_VND = 999_000_000_000;

export const SmartAmountInput: React.FC<SmartAmountInputProps> = ({
  value,
  onChange,
  label = 'Số tiền',
  placeholder = 'Nhập số tiền...',
  autoFocus = false,
  showQuickChips = true,
  accentTone = 'neutral',
}) => {
  const quickMultiply = useAppStore((s) => s.settings.quickMultiply1000);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const symbol = useAppStore((s) => s.settings.currencySymbol);

  const [rawDigits, setRawDigits] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes (e.g. when editing an existing tx or smart-parser fills it)
  useEffect(() => {
    if (value <= 0) {
      setRawDigits('');
    } else if (quickMultiply && value % 1000 === 0 && value >= 1000) {
      // Only show scaled down if user didn't just type an unscaled amount
      const currentEvaluated = computeValue(rawDigits, quickMultiply);
      if (currentEvaluated !== value) {
        setRawDigits(String(Math.round(value / 1000)));
      }
    } else {
      const currentEvaluated = computeValue(rawDigits, quickMultiply);
      if (currentEvaluated !== value) {
        setRawDigits(String(Math.round(value)));
      }
    }
  }, [value]);

  function computeValue(digits: string, isMul1000: boolean): number {
    if (!digits) return 0;
    const base = parseInt(digits, 10);
    if (Number.isNaN(base) || base <= 0) return 0;
    const multiplied = isMul1000 ? base * 1000 : base;
    return Math.min(MAX_VND, Math.round(multiplied));
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Detect if user pasted/typed a formatted full value like "50.000" while in x1000 mode
    // Rule: never double-multiply if user explicitly wrote >= 4 digits with dot separators like "50.000"
    const hasThousandDotPattern = /^\d{1,3}(\.\d{3})+$/.test(raw.trim());
    const digitsOnly = raw.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');

    if (!digitsOnly) {
      setRawDigits('');
      onChange(0);
      return;
    }

    if (digitsOnly === '0') {
      setRawDigits('');
      onChange(0);
      return;
    }

    // Prevent overflow
    const clipped = digitsOnly.slice(0, 12);

    if (hasThousandDotPattern && quickMultiply) {
      // User pasted full formatted money e.g. "50.000" -> turn off auto-multiply or convert cleanly
      const exactVal = Math.min(MAX_VND, parseInt(clipped, 10));
      if (exactVal % 1000 === 0) {
        setRawDigits(String(exactVal / 1000));
      } else {
        updateSettings({ quickMultiply1000: false });
        setRawDigits(clipped);
      }
      onChange(exactVal);
      return;
    }

    setRawDigits(clipped);
    onChange(computeValue(clipped, quickMultiply));
  };

  const handleToggleQuickMultiply = () => {
    const nextMul = !quickMultiply;
    updateSettings({ quickMultiply1000: nextMul });
    // Keep actual VND value intact when toggling mode!
    if (value > 0) {
      if (nextMul && value % 1000 === 0) {
        setRawDigits(String(value / 1000));
      } else {
        setRawDigits(String(value));
      }
    }
  };

  const handleClear = () => {
    setRawDigits('');
    onChange(0);
    inputRef.current?.focus();
  };

  const handleAddChip = (deltaVnd: number) => {
    const nextVal = Math.min(MAX_VND, Math.max(0, Math.round(value + deltaVnd)));
    onChange(nextVal);
    if (quickMultiply && nextVal % 1000 === 0) {
      setRawDigits(String(nextVal / 1000));
    } else {
      setRawDigits(String(nextVal));
    }
  };

  const formattedDisplay = quickMultiply ? rawDigits : formatIntegerDots(rawDigits);

  const ringClass =
    accentTone === 'income'
      ? 'focus-within:border-[#20B889] focus-within:ring-2 focus-within:ring-[#20B889]/20'
      : accentTone === 'expense'
      ? 'focus-within:border-[#E45F63] focus-within:ring-2 focus-within:ring-[#E45F63]/20'
      : 'focus-within:border-[#20B889] focus-within:ring-2 focus-within:ring-[#20B889]/20';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>
        <button
          type="button"
          onClick={handleToggleQuickMultiply}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            quickMultiply
              ? 'bg-[#20B889] text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          title="Khi bật, nhập 50 sẽ tự tính thành 50.000đ"
        >
          <span>Nhập nhanh ×1.000:</span>
          <span>{quickMultiply ? 'BẬT' : 'TẮT'}</span>
        </button>
      </div>

      <div
        className={`relative flex items-center rounded-2xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-4 py-3 transition-all ${ringClass}`}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9.]*"
          autoFocus={autoFocus}
          value={formattedDisplay}
          onChange={handleInputChange}
          placeholder={quickMultiply ? 'Ví dụ: 50 → 50.000đ' : placeholder}
          className={`w-full bg-transparent text-2xl font-bold font-money outline-none placeholder:text-sm placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 ${
            accentTone === 'income'
              ? 'text-[#20B889]'
              : accentTone === 'expense'
              ? 'text-[#E45F63]'
              : 'text-[#1A2E25] dark:text-emerald-50'
          }`}
        />

        {quickMultiply && rawDigits && (
          <span className="ml-1 text-sm font-semibold text-slate-400 whitespace-nowrap select-none">.000</span>
        )}
        <span className="ml-1.5 text-base font-bold text-slate-500 dark:text-slate-400 select-none">{symbol}</span>

        {rawDigits && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-2 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 cursor-pointer"
            aria-label="Xóa nhanh số tiền"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-500 dark:text-slate-400">
          Giá trị thực tế:{' '}
          <strong className="font-money text-[#294D3E] dark:text-emerald-200">
            {value > 0 ? formatVND(value, symbol) : `Chưa nhập`}
          </strong>
        </span>

        {showQuickChips && (
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: '+10k', val: 10_000 },
              { label: '+20k', val: 20_000 },
              { label: '+50k', val: 50_000 },
              { label: '+100k', val: 100_000 },
              { label: '+500k', val: 500_000 },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleAddChip(chip.val)}
                className="rounded-lg bg-[#E9F7EF] dark:bg-emerald-950/70 px-2.5 py-1 text-xs font-semibold text-[#294D3E] dark:text-emerald-300 hover:bg-[#d2f0df] dark:hover:bg-emerald-900 transition-colors cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
