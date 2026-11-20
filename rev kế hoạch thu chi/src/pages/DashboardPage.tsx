import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  EyeOff,
  History,
  Plus,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { AccountModal } from '../components/AccountModal';
import { AssetsDebtsSection } from '../components/AssetsDebtsSection';
import { QuickSmartBar } from '../components/QuickSmartBar';
import { RadishMascot } from '../components/RadishMascot';
import { SmartAmountInput } from '../components/SmartAmountInput';
import { useAppStore } from '../store/useAppStore';
import { FinancialAccount, Transaction } from '../types/finance';
import {
  formatDateVN,
  formatMonthTitleVN,
  formatVND,
  getCurrentMonthKeyVN,
  getNextMonthKey,
  getPreviousMonthKey,
  hexToSoftTint,
} from '../utils/format';

export const DashboardPage: React.FC = () => {
  const selectedMonthKey = useAppStore((s) => s.selectedMonthKey);
  const setSelectedMonthKey = useAppStore((s) => s.setSelectedMonthKey);
  const setActiveSection = useAppStore((s) => s.setActiveSection);

  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const budgets = useAppStore((s) => s.budgets);
  const budgetCategories = useAppStore((s) => s.budgetCategories);
  const balanceAdjustments = useAppStore((s) => s.balanceAdjustments);
  const backupHistory = useAppStore((s) => s.backupHistory);
  const settings = useAppStore((s) => s.settings);

  const updateSettings = useAppStore((s) => s.updateSettings);
  const getAccountBalance = useAppStore((s) => s.getAccountBalance);
  const getTotalActiveBalance = useAppStore((s) => s.getTotalActiveBalance);
  const openTxModal = useAppStore((s) => s.openTxModal);
  const setTransferModalOpen = useAppStore((s) => s.setTransferModalOpen);
  const upsertMonthlyBudget = useAppStore((s) => s.upsertMonthlyBudget);
  const upsertCategoryBudget = useAppStore((s) => s.upsertCategoryBudget);
  const deleteCategoryBudget = useAppStore((s) => s.deleteCategoryBudget);
  const deleteOrDeactivateAccount = useAppStore((s) => s.deleteOrDeactivateAccount);
  const saveAccount = useAppStore((s) => s.saveAccount);
  const pushToast = useAppStore((s) => s.pushToast);

  const [mainTab, setMainTab] = useState<'budget' | 'balances'>('budget');
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetLimitInput, setBudgetLimitInput] = useState(0);
  const [catLimitId, setCatLimitId] = useState('');
  const [catLimitAmount, setCatLimitAmount] = useState(0);

  const [accModal, setAccModal] = useState<{ open: boolean; editing: FinancialAccount | null; mode: 'edit' | 'adjust' }>({
    open: false,
    editing: null,
    mode: 'edit',
  });
  const [showAdjustLogs, setShowAdjustLogs] = useState(false);
  const [selectedCatFilter, setSelectedCatFilter] = useState<string | null>(null);

  const sym = settings.currencySymbol;
  const hide = settings.hideBalances;
  const prevMonthKey = getPreviousMonthKey(selectedMonthKey);

  // Monthly transactions
  const monthTxs = useMemo(
    () => transactions.filter((t) => t.date && t.date.startsWith(selectedMonthKey)),
    [transactions, selectedMonthKey]
  );
  const prevMonthTxs = useMemo(
    () => transactions.filter((t) => t.date && t.date.startsWith(prevMonthKey)),
    [transactions, prevMonthKey]
  );

  const totalIncome = useMemo(
    () => monthTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [monthTxs]
  );
  const expenseTxs = useMemo(() => monthTxs.filter((t) => t.type === 'expense'), [monthTxs]);
  const totalExpense = useMemo(() => expenseTxs.reduce((s, t) => s + t.amount, 0), [expenseTxs]);
  const prevTotalExpense = useMemo(
    () => prevMonthTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    [prevMonthTxs]
  );

  const netDiff = totalIncome - totalExpense;
  const currentBudget = budgets.find((b) => b.monthKey === selectedMonthKey);
  const budgetLimit = currentBudget?.totalLimit || 0;
  const budgetRemaining = budgetLimit - totalExpense;
  const budgetUsedPct = budgetLimit > 0 ? Math.round((totalExpense / budgetLimit) * 100) : 0;
  const isOverBudget = budgetLimit > 0 && totalExpense > budgetLimit;

  const largestExpense: Transaction | null = useMemo(() => {
    if (expenseTxs.length === 0) return null;
    return expenseTxs.reduce((max, tx) => (tx.amount > max.amount ? tx : max), expenseTxs[0]);
  }, [expenseTxs]);

  // Breakdown by expense category
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of expenseTxs) {
      map.set(tx.categoryId, (map.get(tx.categoryId) || 0) + tx.amount);
    }
    return Array.from(map.entries())
      .map(([catId, amount]) => {
        const cat = categories.find((c) => c.id === catId);
        return {
          categoryId: catId,
          name: cat?.name || 'Khác',
          sticker: cat?.sticker || '📦',
          color: cat?.color || '#94A3B8',
          amount,
          percent: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [expenseTxs, categories, totalExpense]);

  const topCategory = expenseByCategory[0] || null;

  // Unusual spending spikes vs previous month (strictly real data)
  const unusualInsights = useMemo(() => {
    if (prevMonthTxs.length === 0 || expenseTxs.length === 0) return [];
    const insights: string[] = [];
    for (const item of expenseByCategory.slice(0, 5)) {
      const prevCatAmt = prevMonthTxs
        .filter((t) => t.type === 'expense' && t.categoryId === item.categoryId)
        .reduce((s, t) => s + t.amount, 0);
      if (prevCatAmt > 0) {
        const diffPct = Math.round(((item.amount - prevCatAmt) / prevCatAmt) * 100);
        if (diffPct >= 25) {
          insights.push(`Chi tiêu "${item.name}" tháng này tăng ${diffPct}% so với tháng trước.`);
        }
      }
    }
    return insights;
  }, [expenseByCategory, prevMonthTxs, expenseTxs]);

  // Backup reminder check
  const needsBackupReminder = useMemo(() => {
    if (transactions.length < 3 || settings.backupReminderDays <= 0) return false;
    const lastExport = backupHistory.find((b) => b.backupType === 'export');
    if (!lastExport) return true;
    const daysSince = (Date.now() - new Date(lastExport.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= settings.backupReminderDays;
  }, [transactions.length, backupHistory, settings.backupReminderDays]);

  const monthCategoryBudgets = budgetCategories.filter((bc) => bc.monthKey === selectedMonthKey);
  const expenseCategories = categories.filter((c) => c.type === 'expense' && !c.isHidden);
  const totalRealBalance = getTotalActiveBalance();

  const filteredCategoryTxs = selectedCatFilter
    ? expenseTxs.filter((t) => t.categoryId === selectedCatFilter)
    : [];

  return (
    <div className="space-y-6">
      {/* Top Toolbar: Month Selector + Balance Privacy Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedMonthKey(getPreviousMonthKey(selectedMonthKey))}
            className="p-2 rounded-xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 text-slate-600 dark:text-slate-300 hover:bg-[#E9F7EF] cursor-pointer"
            aria-label="Tháng trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-4 py-2 rounded-xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 text-sm font-bold text-[#294D3E] dark:text-emerald-100">
            {formatMonthTitleVN(selectedMonthKey)}
          </div>
          <button
            type="button"
            onClick={() => setSelectedMonthKey(getNextMonthKey(selectedMonthKey))}
            className="p-2 rounded-xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 text-slate-600 dark:text-slate-300 hover:bg-[#E9F7EF] cursor-pointer"
            aria-label="Tháng sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {selectedMonthKey !== getCurrentMonthKeyVN() && (
            <button
              type="button"
              onClick={() => setSelectedMonthKey(getCurrentMonthKeyVN())}
              className="px-3 py-2 rounded-xl bg-[#E9F7EF] dark:bg-emerald-950 text-xs font-semibold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
            >
              Tháng này
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateSettings({ hideBalances: !hide })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-[#20B889] cursor-pointer"
          >
            {hide ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{hide ? 'Hiện số dư' : 'Ẩn số dư'}</span>
          </button>
          <button
            type="button"
            onClick={() => openTxModal('expense')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white text-xs font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm giao dịch</span>
          </button>
        </div>
      </div>

      {/* Periodic Backup Reminder */}
      {needsBackupReminder && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Dữ liệu tài chính được lưu trực tiếp trên thiết bị này. Hãy sao lưu định kỳ để tránh mất dữ liệu khi đổi máy hoặc xóa trình duyệt.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveSection('settings')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 text-white px-3 py-1.5 text-xs font-bold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Sao lưu ngay</span>
          </button>
        </div>
      )}

      {/* Priority #1: Quick Smart Input Bar */}
      <QuickSmartBar />

      {/* 1.1 Two Management Tabs: Tab A (Monthly Budget) | Tab B (Actual Account Balances) */}
      <section className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713]">
            <button
              type="button"
              onClick={() => setMainTab('budget')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                mainTab === 'budget'
                  ? 'bg-white dark:bg-[#1B3128] text-[#294D3E] dark:text-emerald-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Ngân sách tháng
            </button>
            <button
              type="button"
              onClick={() => setMainTab('balances')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                mainTab === 'balances'
                  ? 'bg-white dark:bg-[#1B3128] text-[#294D3E] dark:text-emerald-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Số tiền thực tế hiện có
            </button>
          </div>

          {mainTab === 'budget' ? (
            <button
              type="button"
              onClick={() => {
                setBudgetLimitInput(budgetLimit);
                setCatLimitId(expenseCategories[0]?.id || '');
                setCatLimitAmount(0);
                setBudgetModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#E9F7EF] dark:bg-emerald-950/60 px-3.5 py-2 text-xs font-bold text-[#294D3E] dark:text-emerald-200 hover:bg-[#d2f0df] cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{budgetLimit > 0 ? 'Điều chỉnh ngân sách' : 'Thiết lập ngân sách'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTransferModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#E9F7EF] dark:bg-emerald-950/60 px-3 py-2 text-xs font-bold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Chuyển tiền</span>
              </button>
              <button
                type="button"
                onClick={() => setAccModal({ open: true, editing: null, mode: 'edit' })}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] text-white px-3 py-2 text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm tài khoản</span>
              </button>
            </div>
          )}
        </div>

        {/* TAB A: MONTHLY BUDGET */}
        {mainTab === 'budget' && (
          <div className="space-y-5">
            {budgetLimit === 0 ? (
              <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-6 flex flex-col sm:flex-row items-center gap-5">
                <RadishMascot expression="happy" size={88} />
                <div className="flex-1 text-center sm:text-left">
                  <h4 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
                    Chưa thiết lập ngân sách cho {formatMonthTitleVN(selectedMonthKey)}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Đặt hạn mức chi tiêu dự kiến đầu tháng để theo dõi tiến độ và nhận cảnh báo sớm khi gần vượt ngưỡng.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setBudgetLimitInput(0);
                      setCatLimitId(expenseCategories[0]?.id || '');
                      setBudgetModalOpen(true);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] text-white px-4 py-2 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thiết lập ngân sách ngay</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-4">
                    <span className="text-xs text-slate-500">Ngân sách dự kiến</span>
                    <p className="text-lg font-bold font-money text-[#294D3E] dark:text-emerald-100 mt-1">
                      {formatVND(budgetLimit, sym, hide)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-4">
                    <span className="text-xs text-slate-500">Tổng thu tháng</span>
                    <p className="text-lg font-bold font-money text-[#20B889] mt-1">
                      +{formatVND(totalIncome, sym, hide)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-4">
                    <span className="text-xs text-slate-500">Đã chi trong tháng</span>
                    <p className="text-lg font-bold font-money text-[#E45F63] mt-1">
                      -{formatVND(totalExpense, sym, hide)}
                    </p>
                  </div>
                  <div
                    className={`rounded-2xl p-4 ${
                      isOverBudget
                        ? 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900'
                        : 'bg-[#E9F7EF] dark:bg-emerald-950/40'
                    }`}
                  >
                    <span className={`text-xs font-semibold ${isOverBudget ? 'text-[#E45F63]' : 'text-[#294D3E] dark:text-emerald-200'}`}>
                      {isOverBudget ? 'Vượt ngân sách' : 'Ngân sách còn lại'}
                    </span>
                    <p className={`text-lg font-bold font-money mt-1 ${isOverBudget ? 'text-[#E45F63]' : 'text-[#20B889]'}`}>
                      {isOverBudget
                        ? formatVND(Math.abs(budgetRemaining), sym, hide)
                        : formatVND(budgetRemaining, sym, hide)}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-600 dark:text-slate-300">
                      Tỷ lệ đã sử dụng ngân sách: <strong className="font-money">{budgetUsedPct}%</strong>
                    </span>
                    {isOverBudget ? (
                      <span className="text-[#E45F63] font-bold">
                        Cảnh báo: Đã vượt {formatVND(Math.abs(budgetRemaining), sym, hide)}
                      </span>
                    ) : budgetUsedPct >= 80 ? (
                      <span className="text-amber-600 font-bold">Sắp chạm ngưỡng ngân sách</span>
                    ) : (
                      <span className="text-[#20B889]">Trong tầm kiểm soát</span>
                    )}
                  </div>
                  <div className="w-full h-3.5 rounded-full bg-slate-100 dark:bg-[#0D1713] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOverBudget ? 'bg-[#E45F63]' : budgetUsedPct >= 80 ? 'bg-[#F2B85B]' : 'bg-[#20B889]'
                      }`}
                      style={{ width: `${Math.min(100, budgetUsedPct)}%` }}
                    />
                  </div>
                </div>

                {isOverBudget && (
                  <div className="rounded-2xl bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3.5 flex items-center gap-3">
                    <RadishMascot expression="worried" size={56} className="shrink-0" />
                    <div className="text-xs text-red-900 dark:text-red-200">
                      <p className="font-bold">Củ Cải nhắc nhẹ: Tháng này bạn đã chi vượt ngân sách dự kiến!</p>
                      <p className="mt-0.5 opacity-90">
                        Đã chi {formatVND(totalExpense, sym, hide)} trên hạn mức {formatVND(budgetLimit, sym, hide)}. Hãy rà soát các khoản chi lớn bên dưới nhé.
                      </p>
                    </div>
                  </div>
                )}

                {/* Per-category limits if configured */}
                {monthCategoryBudgets.length > 0 && (
                  <div className="pt-2 space-y-2.5">
                    <h4 className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">
                      Hạn mức theo từng danh mục
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {monthCategoryBudgets.map((bc) => {
                        const cat = categories.find((c) => c.id === bc.categoryId);
                        const spent = expenseTxs
                          .filter((t) => t.categoryId === bc.categoryId)
                          .reduce((s, t) => s + t.amount, 0);
                        const pct = bc.limitAmount > 0 ? Math.round((spent / bc.limitAmount) * 100) : 0;
                        const over = spent > bc.limitAmount;
                        return (
                          <div key={bc.id} className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-[#1A2E25] dark:text-emerald-100">
                                {cat?.sticker} {cat?.name || 'Danh mục'}
                              </span>
                              <span className={`font-money font-semibold ${over ? 'text-[#E45F63]' : 'text-slate-600 dark:text-slate-300'}`}>
                                {formatVND(spent, sym, hide)} / {formatVND(bc.limitAmount, sym, hide)}
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${over ? 'bg-[#E45F63]' : 'bg-[#20B889]'}`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB B: ACTUAL ACCOUNT BALANCES */}
        {mainTab === 'balances' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#E9F7EF] dark:bg-emerald-950/50 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-[#436B5B] dark:text-emerald-300">
                  Tổng số tiền thực tế đang hoạt động
                </span>
                <p className="text-2xl font-extrabold font-money text-[#294D3E] dark:text-emerald-50 mt-0.5">
                  {formatVND(totalRealBalance, sym, hide)}
                </p>
              </div>
              <span className="text-xs text-[#436B5B] dark:text-emerald-300">
                {accounts.filter((a) => a.isActive && !a.isHidden).length} tài khoản đang hiển thị
              </span>
            </div>

            {accounts.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Chưa có tài khoản tài chính nào. Nhấn &ldquo;Thêm tài khoản&rdquo; để bắt đầu.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {accounts.map((acc) => {
                  const bal = getAccountBalance(acc.id);
                  return (
                    <div
                      key={acc.id}
                      className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-opacity ${
                        !acc.isActive || acc.isHidden
                          ? 'opacity-55 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1713]'
                          : 'border-emerald-100 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                            style={{ backgroundColor: hexToSoftTint(acc.color, 0.16) }}
                          >
                            {acc.sticker}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100">{acc.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {acc.type === 'cash' ? 'Tiền mặt' : acc.type === 'ewallet' ? 'Ví điện tử' : 'Ngân hàng'}
                              {!acc.isActive ? ' · Ngừng sử dụng' : acc.isHidden ? ' · Đang ẩn khỏi tổng' : ''}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => saveAccount({ ...acc, isHidden: !acc.isHidden })}
                          className="p-1.5 text-slate-400 hover:text-[#20B889] cursor-pointer"
                          title={acc.isHidden ? 'Hiện tài khoản' : 'Ẩn khỏi tổng'}
                        >
                          {acc.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>

                      <div className="flex items-end justify-between gap-2 pt-1">
                        <p className="text-lg font-extrabold font-money text-[#294D3E] dark:text-emerald-50">
                          {formatVND(bal, sym, hide)}
                        </p>
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setAccModal({ open: true, editing: acc, mode: 'adjust' })}
                            className="font-semibold text-[#20B889] hover:underline cursor-pointer"
                          >
                            Điều chỉnh
                          </button>
                          <button
                            type="button"
                            onClick={() => setAccModal({ open: true, editing: acc, mode: 'edit' })}
                            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                            title="Sửa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await deleteOrDeactivateAccount(acc.id, 'deactivate');
                              if (!res.ok && res.error) pushToast({ title: res.error, tone: 'warning' });
                            }}
                            className="text-slate-400 hover:text-[#E45F63] cursor-pointer"
                            title={acc.isActive ? 'Ngừng sử dụng' : 'Kích hoạt lại'}
                          >
                            {acc.isActive ? 'Tắt' : 'Bật'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Balance Adjustment Audit History */}
            {balanceAdjustments.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustLogs(!showAdjustLogs)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#294D3E] dark:text-emerald-300 hover:underline cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>
                    {showAdjustLogs ? 'Ẩn' : 'Xem'} lịch sử điều chỉnh số dư thủ công ({balanceAdjustments.length})
                  </span>
                </button>
                {showAdjustLogs && (
                  <div className="mt-2 rounded-2xl border border-slate-100 dark:border-emerald-900/40 divide-y divide-slate-100 dark:divide-emerald-900/40 max-h-48 overflow-y-auto">
                    {balanceAdjustments.map((adj) => {
                      const acc = accounts.find((a) => a.id === adj.accountId);
                      return (
                        <div key={adj.id} className="px-3.5 py-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold">{acc?.name || 'Tài khoản'}</span>
                            <span className="text-slate-500"> · {adj.reason} ({formatDateVN(adj.date)})</span>
                          </div>
                          <span className={`font-money font-bold ${adj.delta >= 0 ? 'text-[#20B889]' : 'text-[#E45F63]'}`}>
                            {adj.delta >= 0 ? '+' : ''}{formatVND(adj.delta, sym, hide)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 1.2 Assets & Independent Debt Ledgers */}
      <AssetsDebtsSection />

      {/* 1.3 Monthly Spending Card + 1.4 Quick Monthly Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1.3 Số tiền đã chi trong tháng */}
        <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
              Số tiền đã chi trong tháng
            </h3>
            <span className="text-xs text-slate-400">{formatMonthTitleVN(selectedMonthKey)}</span>
          </div>

          <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-4">
            <p className="text-xs text-slate-500">Tổng chi tiêu</p>
            <p className="text-2xl font-extrabold font-money text-[#E45F63] mt-1">
              {formatVND(totalExpense, sym, hide)}
            </p>
            {prevTotalExpense > 0 && (
              <div className="flex items-center gap-1.5 text-xs mt-2">
                {totalExpense > prevTotalExpense ? (
                  <TrendingUp className="w-3.5 h-3.5 text-[#E45F63]" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-[#20B889]" />
                )}
                <span className="text-slate-600 dark:text-slate-300">
                  {totalExpense >= prevTotalExpense ? 'Tăng' : 'Giảm'}{' '}
                  <strong>
                    {Math.abs(Math.round(((totalExpense - prevTotalExpense) / prevTotalExpense) * 100))}%
                  </strong>{' '}
                  so với tháng trước ({formatVND(prevTotalExpense, sym, hide)})
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3.5">
              <span className="text-slate-500">Số giao dịch chi</span>
              <p className="text-base font-bold font-money text-[#1A2E25] dark:text-emerald-100 mt-1">
                {expenseTxs.length}
              </p>
            </div>
            <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3.5">
              <span className="text-slate-500">Chi nhiều nhất</span>
              <p className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100 mt-1 truncate">
                {topCategory ? `${topCategory.sticker} ${topCategory.name}` : 'Chưa có'}
              </p>
            </div>
          </div>

          {largestExpense && (
            <div className="rounded-2xl border border-slate-100 dark:border-emerald-900/40 p-3.5 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <span className="text-slate-400">Khoản chi lớn nhất</span>
                <p className="font-bold text-[#1A2E25] dark:text-emerald-100 truncate mt-0.5">
                  {largestExpense.note || categories.find((c) => c.id === largestExpense.categoryId)?.name || 'Chi tiêu'}
                </p>
              </div>
              <span className="font-money font-bold text-[#E45F63] shrink-0">
                -{formatVND(largestExpense.amount, sym, hide)}
              </span>
            </div>
          )}
        </div>

        {/* 1.4 Báo cáo nhanh trong tháng */}
        <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
              Báo cáo nhanh trong tháng
            </h3>
            <button
              type="button"
              onClick={() => setActiveSection('reports')}
              className="text-xs font-bold text-[#20B889] hover:underline cursor-pointer"
            >
              Xem báo cáo chi tiết →
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#E9F7EF]/60 dark:bg-emerald-950/40 p-3">
              <span className="text-[11px] text-slate-500">Tổng thu</span>
              <p className="text-sm sm:text-base font-bold font-money text-[#20B889] mt-0.5">
                +{formatVND(totalIncome, sym, hide)}
              </p>
            </div>
            <div className="rounded-2xl bg-red-50/70 dark:bg-red-950/30 p-3">
              <span className="text-[11px] text-slate-500">Tổng chi</span>
              <p className="text-sm sm:text-base font-bold font-money text-[#E45F63] mt-0.5">
                -{formatVND(totalExpense, sym, hide)}
              </p>
            </div>
            <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3">
              <span className="text-[11px] text-slate-500">Chênh lệch</span>
              <p className={`text-sm sm:text-base font-bold font-money mt-0.5 ${netDiff >= 0 ? 'text-[#294D3E] dark:text-emerald-100' : 'text-[#E45F63]'}`}>
                {netDiff >= 0 ? '+' : ''}{formatVND(netDiff, sym, hide)}
              </p>
            </div>
          </div>

          {unusualInsights.length > 0 && (
            <div className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              {unusualInsights.map((msg, i) => (
                <p key={i}>• {msg}</p>
              ))}
            </div>
          )}

          {expenseByCategory.length === 0 ? (
            <div className="py-8 flex flex-col items-center text-center">
              <RadishMascot expression="happy" size={76} />
              <p className="text-xs text-slate-500 mt-2">
                Chưa có giao dịch chi tiêu nào trong {formatMonthTitleVN(selectedMonthKey)}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
              <div className="sm:col-span-5 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseByCategory}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={76}
                      paddingAngle={2}
                      onClick={(_, idx) => {
                        const target = expenseByCategory[idx];
                        if (target) {
                          setSelectedCatFilter((prev) =>
                            prev === target.categoryId ? null : target.categoryId
                          );
                        }
                      }}
                    >
                      {expenseByCategory.map((entry) => (
                        <Cell
                          key={entry.categoryId}
                          fill={entry.color}
                          className="cursor-pointer outline-none"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => formatVND(Number(val ?? 0), sym, hide)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="sm:col-span-7 space-y-2 max-h-52 overflow-y-auto pr-1">
                {expenseByCategory.map((item) => (
                  <button
                    key={item.categoryId}
                    type="button"
                    onClick={() =>
                      setSelectedCatFilter((prev) => (prev === item.categoryId ? null : item.categoryId))
                    }
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                      selectedCatFilter === item.categoryId
                        ? 'bg-[#E9F7EF] dark:bg-emerald-950/70 ring-1 ring-[#20B889]'
                        : 'hover:bg-[#F5F8F6] dark:hover:bg-[#0D1713]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate font-semibold text-[#1A2E25] dark:text-emerald-100">
                        {item.sticker} {item.name}
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="font-money font-bold text-[#1A2E25] dark:text-emerald-100">
                        {formatVND(item.amount, sym, hide)}
                      </span>
                      <span className="text-slate-400 ml-1.5">({item.percent}%)</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Drill-down transactions when user clicks a category */}
          {selectedCatFilter && (
            <div className="pt-3 border-t border-slate-100 dark:border-emerald-900/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#294D3E] dark:text-emerald-200">
                  Giao dịch thuộc mục &ldquo;{categories.find((c) => c.id === selectedCatFilter)?.name}&rdquo; ({filteredCategoryTxs.length})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCatFilter(null)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Đóng lọc
                </button>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {filteredCategoryTxs.map((tx) => (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => openTxModal(tx.type, tx)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] text-xs hover:bg-[#E9F7EF] cursor-pointer"
                  >
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {formatDateVN(tx.date)} · {tx.note || 'Không có ghi chú'}
                    </span>
                    <span className="font-money font-bold text-[#E45F63] ml-2">
                      -{formatVND(tx.amount, sym, hide)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Monthly Budget & Category Limits Modal */}
      {budgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
                Ngân sách {formatMonthTitleVN(selectedMonthKey)}
              </h3>
              <button type="button" onClick={() => setBudgetModalOpen(false)} className="text-slate-400 cursor-pointer">
                ✕
              </button>
            </div>

            <SmartAmountInput
              value={budgetLimitInput}
              onChange={setBudgetLimitInput}
              label="Tổng ngân sách dự kiến trong tháng"
              showQuickChips={false}
            />

            <button
              type="button"
              onClick={async () => {
                await upsertMonthlyBudget(selectedMonthKey, budgetLimitInput);
              }}
              className="w-full rounded-xl bg-[#20B889] text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Lưu ngân sách tháng
            </button>

            <div className="pt-3 border-t border-slate-100 dark:border-emerald-900/40 space-y-3">
              <h4 className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">
                Thêm hạn mức theo từng danh mục
              </h4>
              <select
                value={catLimitId}
                onChange={(e) => setCatLimitId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
              >
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sticker} {c.name}
                  </option>
                ))}
              </select>
              <SmartAmountInput
                value={catLimitAmount}
                onChange={setCatLimitAmount}
                label="Hạn mức danh mục"
                showQuickChips={false}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!catLimitId || catLimitAmount <= 0) return;
                  await upsertCategoryBudget(selectedMonthKey, catLimitId, catLimitAmount);
                  setCatLimitAmount(0);
                }}
                className="w-full rounded-xl bg-[#294D3E] text-white font-semibold py-2 text-xs cursor-pointer"
              >
                + Lưu hạn mức danh mục
              </button>

              {monthCategoryBudgets.length > 0 && (
                <div className="space-y-1.5">
                  {monthCategoryBudgets.map((bc) => {
                    const cat = categories.find((c) => c.id === bc.categoryId);
                    return (
                      <div key={bc.id} className="flex items-center justify-between text-xs bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 rounded-xl">
                        <span>{cat?.sticker} {cat?.name}: <strong className="font-money">{formatVND(bc.limitAmount, sym)}</strong></span>
                        <button type="button" onClick={() => deleteCategoryBudget(bc.id)} className="text-[#E45F63] cursor-pointer">
                          Xóa
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account Add / Edit / Adjust Modal */}
      <AccountModal
        open={accModal.open}
        editing={accModal.editing}
        mode={accModal.mode}
        onClose={() => setAccModal({ open: false, editing: null, mode: 'edit' })}
      />
    </div>
  );
};
