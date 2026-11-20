import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  HandCoins,
  Landmark,
  PiggyBank,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { LoanGiven, LoanTaken, SavingBook, SpecialTrackedItem } from '../types/finance';
import { compressImageFile, formatDateVN, formatVND, getTodayVN } from '../utils/format';
import { SmartAmountInput } from './SmartAmountInput';

function calcMonthsBetween(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 1;
  const s = new Date(startIso);
  const e = new Date(endIso);
  const diffDays = Math.max(0, (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.round(diffDays / 30));
}

function estimateLoanGivenInterest(loan: LoanGiven): number {
  if (!loan.hasInterest || loan.interestValue <= 0) return 0;
  const months = calcMonthsBetween(loan.interestStartDate || loan.startDate, loan.expectedReturnDate || getTodayVN());
  if (loan.interestType === 'fixed_monthly') {
    return Math.round(loan.interestValue * months);
  }
  if (loan.interestType === 'percent_month') {
    return Math.round((loan.principalAmount * (loan.interestValue / 100)) * months);
  }
  // percent_year
  return Math.round((loan.principalAmount * (loan.interestValue / 100) * months) / 12);
}

export const AssetsDebtsSection: React.FC = () => {
  const savings = useAppStore((s) => s.savings);
  const loansGiven = useAppStore((s) => s.loansGiven);
  const loansTaken = useAppStore((s) => s.loansTaken);
  const loanRepayments = useAppStore((s) => s.loanRepayments);
  const specialItems = useAppStore((s) => s.specialItems);
  const accounts = useAppStore((s) => s.accounts);
  const attachments = useAppStore((s) => s.attachments);
  const hideBalances = useAppStore((s) => s.settings.hideBalances);
  const symbol = useAppStore((s) => s.settings.currencySymbol);

  const saveSavingBook = useAppStore((s) => s.saveSavingBook);
  const deleteSavingBook = useAppStore((s) => s.deleteSavingBook);
  const saveLoanGiven = useAppStore((s) => s.saveLoanGiven);
  const deleteLoanGiven = useAppStore((s) => s.deleteLoanGiven);
  const saveLoanTaken = useAppStore((s) => s.saveLoanTaken);
  const deleteLoanTaken = useAppStore((s) => s.deleteLoanTaken);
  const recordLoanRepayment = useAppStore((s) => s.recordLoanRepayment);
  const saveSpecialItem = useAppStore((s) => s.saveSpecialItem);
  const deleteSpecialItem = useAppStore((s) => s.deleteSpecialItem);

  const [expanded, setExpanded] = useState(true);
  const [subTab, setSubTab] = useState<'savings' | 'given' | 'taken' | 'special'>('savings');

  // Modals
  const [savingModal, setSavingModal] = useState(false);
  const [editingSaving, setEditingSaving] = useState<SavingBook | null>(null);
  const [savName, setSavName] = useState('');
  const [savBank, setSavBank] = useState('');
  const [savPrincipal, setSavPrincipal] = useState(0);
  const [savStart, setSavStart] = useState(getTodayVN());
  const [savMaturity, setSavMaturity] = useState('');
  const [savRate, setSavRate] = useState('5.5');
  const [savTerm, setSavTerm] = useState('12');
  const [savNote, setSavNote] = useState('');
  const [savStatus, setSavStatus] = useState<'active' | 'matured' | 'closed'>('active');
  const [savFile, setSavFile] = useState<{ dataUrl: string; fileName: string; mimeType: string; sizeBytes: number } | undefined>(undefined);

  const [givenModal, setGivenModal] = useState(false);
  const [editingGiven, setEditingGiven] = useState<LoanGiven | null>(null);
  const [gName, setGName] = useState('');
  const [gPrincipal, setGPrincipal] = useState(0);
  const [gStart, setGStart] = useState(getTodayVN());
  const [gReturn, setGReturn] = useState('');
  const [gHasInt, setGHasInt] = useState(false);
  const [gIntType, setGIntType] = useState<'percent_year' | 'percent_month' | 'fixed_monthly'>('percent_year');
  const [gIntVal, setGIntVal] = useState('0');
  const [gIntStart, setGIntStart] = useState(getTodayVN());
  const [gNote, setGNote] = useState('');

  const [takenModal, setTakenModal] = useState(false);
  const [editingTaken, setEditingTaken] = useState<LoanTaken | null>(null);
  const [tName, setTName] = useState('');
  const [tPrincipal, setTPrincipal] = useState(0);
  const [tStart, setTStart] = useState(getTodayVN());
  const [tDue, setTDue] = useState('');
  const [tHasInt, setTHasInt] = useState(false);
  const [tRate, setTRate] = useState('0');
  const [tNote, setTNote] = useState('');

  const [specialModal, setSpecialModal] = useState(false);
  const [editingSpecial, setEditingSpecial] = useState<SpecialTrackedItem | null>(null);
  const [spName, setSpName] = useState('');
  const [spLabel, setSpLabel] = useState('Tài sản riêng');
  const [spAmount, setSpAmount] = useState(0);
  const [spSticker, setSpSticker] = useState('🪙');
  const [spColor, setSpColor] = useState('#F2B85B');
  const [spDate, setSpDate] = useState(getTodayVN());
  const [spNote, setSpNote] = useState('');

  const [repayModal, setRepayModal] = useState<{ kind: 'given' | 'taken'; id: string; title: string } | null>(null);
  const [repPrincipal, setRepPrincipal] = useState(0);
  const [repInterest, setRepInterest] = useState(0);
  const [repDate, setRepDate] = useState(getTodayVN());
  const [repAccountId, setRepAccountId] = useState('');
  const [repNote, setRepNote] = useState('');

  const totalSavings = savings.filter((s) => s.status !== 'closed').reduce((sum, s) => sum + s.principalAmount, 0);
  const totalGivenRemaining = loansGiven.reduce((sum, l) => {
    const paid = loanRepayments.filter((r) => r.loanId === l.id).reduce((s, r) => s + r.amountPrincipal, 0);
    return sum + Math.max(0, l.principalAmount - paid);
  }, 0);
  const totalTakenRemaining = loansTaken.reduce((sum, l) => {
    const paid = loanRepayments.filter((r) => r.loanId === l.id).reduce((s, r) => s + r.amountPrincipal, 0);
    return sum + Math.max(0, l.principalAmount - paid);
  }, 0);
  const totalSpecial = specialItems.reduce((sum, x) => sum + x.amount, 0);

  const openSavingForm = (item?: SavingBook) => {
    setEditingSaving(item || null);
    setSavName(item?.name || '');
    setSavBank(item?.bankName || '');
    setSavPrincipal(item?.principalAmount || 0);
    setSavStart(item?.startDate || getTodayVN());
    setSavMaturity(item?.maturityDate || '');
    setSavRate(String(item?.interestRate ?? 5.5));
    setSavTerm(String(item?.termMonths ?? 12));
    setSavNote(item?.note || '');
    setSavStatus(item?.status || 'active');
    setSavFile(undefined);
    setSavingModal(true);
  };

  const openGivenForm = (item?: LoanGiven) => {
    setEditingGiven(item || null);
    setGName(item?.borrowerName || '');
    setGPrincipal(item?.principalAmount || 0);
    setGStart(item?.startDate || getTodayVN());
    setGReturn(item?.expectedReturnDate || '');
    setGHasInt(item?.hasInterest ?? false);
    setGIntType(item?.interestType || 'percent_year');
    setGIntVal(String(item?.interestValue ?? 0));
    setGIntStart(item?.interestStartDate || getTodayVN());
    setGNote(item?.note || '');
    setGivenModal(true);
  };

  const openTakenForm = (item?: LoanTaken) => {
    setEditingTaken(item || null);
    setTName(item?.lenderName || '');
    setTPrincipal(item?.principalAmount || 0);
    setTStart(item?.startDate || getTodayVN());
    setTDue(item?.dueDate || '');
    setTHasInt(item?.hasInterest ?? false);
    setTRate(String(item?.interestRate ?? 0));
    setTNote(item?.note || '');
    setTakenModal(true);
  };

  const openSpecialForm = (item?: SpecialTrackedItem) => {
    setEditingSpecial(item || null);
    setSpName(item?.name || '');
    setSpLabel(item?.categoryLabel || 'Tài sản riêng');
    setSpAmount(item?.amount || 0);
    setSpSticker(item?.sticker || '🪙');
    setSpColor(item?.color || '#F2B85B');
    setSpDate(item?.date || getTodayVN());
    setSpNote(item?.note || '');
    setSpecialModal(true);
  };

  return (
    <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F5F8F6]/70 dark:hover:bg-[#172B23] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-10 h-10 rounded-2xl bg-[#E9F7EF] dark:bg-emerald-950 flex items-center justify-center text-[#20B889]">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
              Quản lý tài sản &amp; Các khoản riêng
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sổ độc lập — không tự động cộng vào số dư ví hay làm thay đổi ngân sách tháng
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-100 dark:border-emerald-900/40 pt-4">
          {/* 4 Summary Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setSubTab('savings')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                subTab === 'savings'
                  ? 'border-[#20B889] bg-[#E9F7EF]/70 dark:bg-emerald-950/50'
                  : 'border-slate-100 dark:border-emerald-900/40 bg-[#F5F8F6] dark:bg-[#0D1713]'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
                <span>Tiết kiệm</span>
                <PiggyBank className="w-4 h-4" />
              </div>
              <p className="mt-1.5 text-base font-bold font-money text-[#1A2E25] dark:text-emerald-50">
                {formatVND(totalSavings, symbol, hideBalances)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{savings.length} sổ tiết kiệm</p>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('given')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                subTab === 'given'
                  ? 'border-blue-400 bg-blue-50/70 dark:bg-blue-950/30'
                  : 'border-slate-100 dark:border-emerald-900/40 bg-[#F5F8F6] dark:bg-[#0D1713]'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
                <span>Cho vay (phải thu)</span>
                <HandCoins className="w-4 h-4" />
              </div>
              <p className="mt-1.5 text-base font-bold font-money text-blue-700 dark:text-blue-300">
                {formatVND(totalGivenRemaining, symbol, hideBalances)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{loansGiven.length} khoản cho vay</p>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('taken')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                subTab === 'taken'
                  ? 'border-purple-400 bg-purple-50/70 dark:bg-purple-950/30'
                  : 'border-slate-100 dark:border-emerald-900/40 bg-[#F5F8F6] dark:bg-[#0D1713]'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-purple-600 dark:text-purple-400">
                <span>Đi vay (còn nợ)</span>
                <Landmark className="w-4 h-4" />
              </div>
              <p className="mt-1.5 text-base font-bold font-money text-purple-700 dark:text-purple-300">
                {formatVND(totalTakenRemaining, symbol, hideBalances)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{loansTaken.length} khoản đi vay</p>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('special')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                subTab === 'special'
                  ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/30'
                  : 'border-slate-100 dark:border-emerald-900/40 bg-[#F5F8F6] dark:bg-[#0D1713]'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400">
                <span>Khoản riêng khác</span>
                <Sparkles className="w-4 h-4" />
              </div>
              <p className="mt-1.5 text-base font-bold font-money text-[#1A2E25] dark:text-emerald-50">
                {formatVND(totalSpecial, symbol, hideBalances)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{specialItems.length} mục theo dõi</p>
            </button>
          </div>

          {/* Sub-Tab Content */}
          {subTab === 'savings' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">A. Sổ tiết kiệm</span>
                <button
                  type="button"
                  onClick={() => openSavingForm()}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#20B889] text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm sổ tiết kiệm</span>
                </button>
              </div>
              {savings.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Chưa có sổ tiết kiệm nào.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {savings.map((sv) => {
                    const estInterest = Math.round(
                      sv.principalAmount * (sv.interestRate / 100) * (sv.termMonths / 12)
                    );
                    const att = sv.attachmentId ? attachments.find((a) => a.id === sv.attachmentId) : null;
                    return (
                      <div
                        key={sv.id}
                        className="rounded-2xl border border-slate-200/80 dark:border-emerald-900/40 p-3.5 flex items-start justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {att ? (
                            <img src={att.dataUrl} alt={sv.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 shrink-0">
                              <PiggyBank className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100 truncate">
                              {sv.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {sv.bankName} · {sv.interestRate}%/năm · {sv.termMonths} tháng
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Gửi {formatDateVN(sv.startDate)}
                              {sv.maturityDate ? ` → Đáo hạn ${formatDateVN(sv.maturityDate)}` : ''}
                            </p>
                            <p className="text-[11px] text-[#20B889] font-medium mt-0.5">
                              Lãi dự kiến: +{formatVND(estInterest, symbol, hideBalances)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <p className="text-sm font-bold font-money text-blue-600 dark:text-blue-300">
                            {formatVND(sv.principalAmount, symbol, hideBalances)}
                          </p>
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => openSavingForm(sv)}
                              className="text-[#20B889] font-semibold hover:underline cursor-pointer"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSavingBook(sv.id)}
                              className="text-slate-400 hover:text-[#E45F63] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {subTab === 'given' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">B. Sổ cho vay</span>
                <button
                  type="button"
                  onClick={() => openGivenForm()}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm khoản cho vay</span>
                </button>
              </div>
              {loansGiven.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Chưa có khoản cho vay nào.</p>
              ) : (
                <div className="space-y-2.5">
                  {loansGiven.map((lg) => {
                    const reps = loanRepayments.filter((r) => r.loanId === lg.id);
                    const paidPrincipal = reps.reduce((s, r) => s + r.amountPrincipal, 0);
                    const paidInterest = reps.reduce((s, r) => s + r.amountInterest, 0);
                    const remaining = Math.max(0, lg.principalAmount - paidPrincipal);
                    const estInt = estimateLoanGivenInterest(lg);

                    return (
                      <div
                        key={lg.id}
                        className="rounded-2xl border border-slate-200/80 dark:border-emerald-900/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100">
                              {lg.borrowerName}
                            </span>
                            <span className="text-xs text-slate-500">
                              · {lg.status === 'settled' ? 'Đã tất toán' : lg.status === 'partial' ? 'Trả một phần' : 'Đang cho vay'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Cho vay {formatDateVN(lg.startDate)}
                            {lg.expectedReturnDate ? ` · Dự kiến trả ${formatDateVN(lg.expectedReturnDate)}` : ''}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Đã thu gốc: <strong className="font-money">{formatVND(paidPrincipal, symbol, hideBalances)}</strong>
                            {' · '}Còn lại: <strong className="font-money text-blue-600 dark:text-blue-300">{formatVND(remaining, symbol, hideBalances)}</strong>
                          </p>
                          {lg.hasInterest && (
                            <p className="text-[11px] text-[#20B889] mt-0.5">
                              Có lãi ({lg.interestValue}
                              {lg.interestType === 'percent_year'
                                ? '%/năm'
                                : lg.interestType === 'percent_month'
                                ? '%/tháng'
                                : 'đ/tháng'}
                              ) · Dự kiến: {formatVND(estInt, symbol, hideBalances)} · Đã nhận lãi:{' '}
                              {formatVND(paidInterest, symbol, hideBalances)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setRepayModal({ kind: 'given', id: lg.id, title: `Thu hồi nợ từ ${lg.borrowerName}` });
                                setRepPrincipal(remaining);
                                setRepInterest(0);
                                setRepDate(getTodayVN());
                                setRepAccountId('');
                                setRepNote('');
                              }}
                              className="rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-3 py-1.5 text-xs font-semibold cursor-pointer"
                            >
                              Ghi nhận thu hồi
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openGivenForm(lg)}
                            className="text-xs font-semibold text-[#20B889] hover:underline cursor-pointer"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLoanGiven(lg.id)}
                            className="text-slate-400 hover:text-[#E45F63] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {subTab === 'taken' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">C. Sổ đi vay</span>
                <button
                  type="button"
                  onClick={() => openTakenForm()}
                  className="inline-flex items-center gap-1 rounded-xl bg-purple-600 text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm khoản đi vay</span>
                </button>
              </div>
              {loansTaken.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Chưa có khoản đi vay nào.</p>
              ) : (
                <div className="space-y-2.5">
                  {loansTaken.map((lt) => {
                    const reps = loanRepayments.filter((r) => r.loanId === lt.id);
                    const paid = reps.reduce((s, r) => s + r.amountPrincipal, 0);
                    const remaining = Math.max(0, lt.principalAmount - paid);

                    return (
                      <div
                        key={lt.id}
                        className="rounded-2xl border border-slate-200/80 dark:border-emerald-900/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100">
                              {lt.lenderName}
                            </span>
                            <span className="text-xs text-slate-500">
                              · {lt.status === 'settled' ? 'Đã trả xong' : lt.status === 'partial' ? 'Đang trả' : 'Chưa trả'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Vay {formatDateVN(lt.startDate)}
                            {lt.dueDate ? ` · Hạn trả ${formatDateVN(lt.dueDate)}` : ''}
                            {lt.hasInterest ? ` · Lãi ${lt.interestRate}%/năm` : ' · Không lãi'}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Đã trả: <strong className="font-money">{formatVND(paid, symbol, hideBalances)}</strong>
                            {' · '}Còn nợ: <strong className="font-money text-purple-600 dark:text-purple-300">{formatVND(remaining, symbol, hideBalances)}</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setRepayModal({ kind: 'taken', id: lt.id, title: `Trả nợ cho ${lt.lenderName}` });
                                setRepPrincipal(remaining);
                                setRepInterest(0);
                                setRepDate(getTodayVN());
                                setRepAccountId('');
                                setRepNote('');
                              }}
                              className="rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 px-3 py-1.5 text-xs font-semibold cursor-pointer"
                            >
                              Ghi nhận trả nợ
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openTakenForm(lt)}
                            className="text-xs font-semibold text-[#20B889] hover:underline cursor-pointer"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLoanTaken(lt.id)}
                            className="text-slate-400 hover:text-[#E45F63] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {subTab === 'special' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">D. Các khoản riêng khác</span>
                <button
                  type="button"
                  onClick={() => openSpecialForm()}
                  className="inline-flex items-center gap-1 rounded-xl bg-amber-500 text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm mục theo dõi</span>
                </button>
              </div>
              {specialItems.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  Bạn có thể thêm vàng tích trữ, quỹ dự phòng, cổ phiếu hoặc tài sản đặc biệt tại đây.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {specialItems.map((sp) => (
                    <div
                      key={sp.id}
                      className="rounded-2xl border border-slate-200/80 dark:border-emerald-900/40 p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                          style={{ backgroundColor: `${sp.color}25` }}
                        >
                          {sp.sticker}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100 truncate">{sp.name}</p>
                          <p className="text-xs text-slate-500">
                            {sp.categoryLabel} · {formatDateVN(sp.date)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold font-money" style={{ color: sp.color }}>
                          {formatVND(sp.amount, symbol, hideBalances)}
                        </p>
                        <div className="flex justify-end gap-2 text-xs mt-0.5">
                          <button
                            type="button"
                            onClick={() => openSpecialForm(sp)}
                            className="text-[#20B889] font-semibold hover:underline cursor-pointer"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSpecialItem(sp.id)}
                            className="text-slate-400 hover:text-[#E45F63] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Saving Book */}
      {savingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Sổ tiết kiệm</h3>
              <button type="button" onClick={() => setSavingModal(false)} className="p-1.5 text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Tên khoản tiết kiệm (vd: Tiết kiệm mua nhà)"
              value={savName}
              onChange={(e) => setSavName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Ngân hàng / Nơi gửi (vd: Vietcombank)"
              value={savBank}
              onChange={(e) => setSavBank(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <SmartAmountInput value={savPrincipal} onChange={setSavPrincipal} label="Số tiền gốc" showQuickChips={false} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Ngày gửi</label>
                <input type="date" value={savStart} onChange={(e) => setSavStart(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Ngày đáo hạn</label>
                <input type="date" value={savMaturity} onChange={(e) => setSavMaturity(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Lãi suất (%/năm)</label>
                <input type="number" step="0.1" value={savRate} onChange={(e) => setSavRate(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Kỳ hạn (tháng)</label>
                <input type="number" value={savTerm} onChange={(e) => setSavTerm(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
            </div>
            <select
              value={savStatus}
              onChange={(e) => setSavStatus(e.target.value as 'active' | 'matured' | 'closed')}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
            >
              <option value="active">Đang gửi</option>
              <option value="matured">Đã đáo hạn</option>
              <option value="closed">Đã tất toán</option>
            </select>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ảnh giấy tờ / sổ (tùy chọn)</label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const c = await compressImageFile(f);
                    setSavFile({ ...c, fileName: f.name });
                  }
                }}
                className="text-xs"
              />
            </div>
            <input
              type="text"
              placeholder="Ghi chú"
              value={savNote}
              onChange={(e) => setSavNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (!savName.trim() || savPrincipal <= 0) return;
                await saveSavingBook(
                  {
                    id: editingSaving?.id,
                    name: savName,
                    bankName: savBank,
                    principalAmount: savPrincipal,
                    startDate: savStart,
                    maturityDate: savMaturity,
                    interestRate: parseFloat(savRate) || 0,
                    termMonths: parseInt(savTerm, 10) || 12,
                    note: savNote,
                    status: savStatus,
                  },
                  savFile
                );
                setSavingModal(false);
              }}
              className="w-full rounded-xl bg-[#20B889] text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Lưu sổ tiết kiệm
            </button>
          </div>
        </div>
      )}

      {/* Modal: Loan Given */}
      {givenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Khoản cho vay</h3>
              <button type="button" onClick={() => setGivenModal(false)} className="p-1.5 text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Tên người được cho vay"
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <SmartAmountInput value={gPrincipal} onChange={setGPrincipal} label="Số tiền cho vay" showQuickChips={false} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Ngày cho vay</label>
                <input type="date" value={gStart} onChange={(e) => setGStart(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Dự kiến hoàn trả</label>
                <input type="date" value={gReturn} onChange={(e) => setGReturn(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGHasInt(false)}
                className={`py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                  !gHasInt ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-200' : 'border-slate-200 text-slate-500'
                }`}
              >
                Không có lãi
              </button>
              <button
                type="button"
                onClick={() => setGHasInt(true)}
                className={`py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                  gHasInt ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-200' : 'border-slate-200 text-slate-500'
                }`}
              >
                Có tính lãi
              </button>
            </div>

            {gHasInt && (
              <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3 space-y-2.5">
                <select
                  value={gIntType}
                  onChange={(e) => setGIntType(e.target.value as 'percent_year' | 'percent_month' | 'fixed_monthly')}
                  className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-3 py-2 text-xs"
                >
                  <option value="percent_year">Lãi suất % / năm</option>
                  <option value="percent_month">Lãi suất % / tháng</option>
                  <option value="fixed_monthly">Tiền lãi cố định mỗi tháng (đ)</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={gIntVal}
                    onChange={(e) => setGIntVal(e.target.value)}
                    placeholder="Giá trị lãi"
                    className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-3 py-2 text-xs"
                  />
                  <input
                    type="date"
                    value={gIntStart}
                    onChange={(e) => setGIntStart(e.target.value)}
                    className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-3 py-2 text-xs"
                  />
                </div>
              </div>
            )}

            <input
              type="text"
              placeholder="Ghi chú"
              value={gNote}
              onChange={(e) => setGNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (!gName.trim() || gPrincipal <= 0) return;
                await saveLoanGiven({
                  id: editingGiven?.id,
                  borrowerName: gName,
                  principalAmount: gPrincipal,
                  startDate: gStart,
                  expectedReturnDate: gReturn,
                  status: editingGiven?.status || 'ongoing',
                  hasInterest: gHasInt,
                  interestType: gIntType,
                  interestValue: parseFloat(gIntVal) || 0,
                  interestStartDate: gIntStart,
                  note: gNote,
                });
                setGivenModal(false);
              }}
              className="w-full rounded-xl bg-blue-600 text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Lưu khoản cho vay
            </button>
          </div>
        </div>
      )}

      {/* Modal: Loan Taken */}
      {takenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Khoản đi vay</h3>
              <button type="button" onClick={() => setTakenModal(false)} className="p-1.5 text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Người hoặc đơn vị cho vay"
              value={tName}
              onChange={(e) => setTName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <SmartAmountInput value={tPrincipal} onChange={setTPrincipal} label="Số tiền vay" showQuickChips={false} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Ngày vay</label>
                <input type="date" value={tStart} onChange={(e) => setTStart(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Ngày phải trả</label>
                <input type="date" value={tDue} onChange={(e) => setTDue(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={tHasInt} onChange={(e) => setTHasInt(e.target.checked)} />
              <span>Có lãi suất (%/năm)</span>
            </label>
            {tHasInt && (
              <input
                type="number"
                step="0.1"
                value={tRate}
                onChange={(e) => setTRate(e.target.value)}
                placeholder="Lãi suất %/năm"
                className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
              />
            )}
            <input
              type="text"
              placeholder="Ghi chú"
              value={tNote}
              onChange={(e) => setTNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (!tName.trim() || tPrincipal <= 0) return;
                await saveLoanTaken({
                  id: editingTaken?.id,
                  lenderName: tName,
                  principalAmount: tPrincipal,
                  startDate: tStart,
                  dueDate: tDue,
                  hasInterest: tHasInt,
                  interestRate: parseFloat(tRate) || 0,
                  status: editingTaken?.status || 'ongoing',
                  note: tNote,
                });
                setTakenModal(false);
              }}
              className="w-full rounded-xl bg-purple-600 text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Lưu khoản đi vay
            </button>
          </div>
        </div>
      )}

      {/* Modal: Special Item */}
      {specialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Khoản theo dõi riêng</h3>
              <button type="button" onClick={() => setSpecialModal(false)} className="p-1.5 text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Tên khoản (vd: 2 chỉ vàng SJC, Quỹ dự phòng)"
              value={spName}
              onChange={(e) => setSpName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Nhóm"
                value={spLabel}
                onChange={(e) => setSpLabel(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
              />
              <input
                type="date"
                value={spDate}
                onChange={(e) => setSpDate(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {['🪙', '💎', '🏠', '📈', '🛡️', '🎯'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSpSticker(st)}
                    className={`w-8 h-8 rounded-lg ${spSticker === st ? 'bg-amber-100 ring-2 ring-amber-400' : 'bg-slate-100 dark:bg-slate-800'} cursor-pointer`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <input type="color" value={spColor} onChange={(e) => setSpColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
            </div>
            <SmartAmountInput value={spAmount} onChange={setSpAmount} label="Giá trị ước tính" showQuickChips={false} />
            <input
              type="text"
              placeholder="Ghi chú"
              value={spNote}
              onChange={(e) => setSpNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (!spName.trim()) return;
                await saveSpecialItem({
                  id: editingSpecial?.id,
                  name: spName,
                  categoryLabel: spLabel,
                  amount: spAmount,
                  color: spColor,
                  sticker: spSticker,
                  date: spDate,
                  note: spNote,
                });
                setSpecialModal(false);
              }}
              className="w-full rounded-xl bg-amber-500 text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Lưu khoản riêng
            </button>
          </div>
        </div>
      )}

      {/* Modal: Record Loan Repayment */}
      {repayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">{repayModal.title}</h3>
              <button type="button" onClick={() => setRepayModal(null)} className="p-1.5 text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SmartAmountInput value={repPrincipal} onChange={setRepPrincipal} label="Số tiền gốc thanh toán" showQuickChips={false} />
            <SmartAmountInput value={repInterest} onChange={setRepInterest} label="Tiền lãi (nếu có)" showQuickChips={false} />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={repDate}
                onChange={(e) => setRepDate(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
              />
              <select
                value={repAccountId}
                onChange={(e) => setRepAccountId(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
              >
                <option value="">Chỉ ghi sổ nợ (không đổi số dư ví)</option>
                {accounts
                  .filter((a) => a.isActive)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {repayModal.kind === 'given' ? 'Nhận vào: ' : 'Trả từ: '}
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="Ghi chú thanh toán"
              value={repNote}
              onChange={(e) => setRepNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (repPrincipal + repInterest <= 0) return;
                await recordLoanRepayment({
                  loanId: repayModal.id,
                  loanKind: repayModal.kind,
                  amountPrincipal: repPrincipal,
                  amountInterest: repInterest,
                  date: repDate,
                  note: repNote,
                  reflectToAccountId: repAccountId || undefined,
                });
                setRepayModal(null);
              }}
              className="w-full rounded-xl bg-[#20B889] text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Xác nhận ghi nhận
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
