import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RadishMascot } from '../components/RadishMascot';
import { useAppStore } from '../store/useAppStore';
import {
  exportReportToCSV,
  exportReportToExcel,
  exportReportToPDF,
} from '../utils/exportReports';
import {
  formatDateTimeReadable,
  formatDateVN,
  formatMonthTitleVN,
  formatShortVND,
  formatSignedVND,
  formatVND,
  getCurrentMonthKeyVN,
  getPreviousMonthKey,
  getTodayVN,
  hexToSoftTint,
} from '../utils/format';

export const ReportsPage: React.FC = () => {
  const transactions = useAppStore((s) => s.transactions);
  const categories = useAppStore((s) => s.categories);
  const accounts = useAppStore((s) => s.accounts);
  const attachments = useAppStore((s) => s.attachments);
  const settings = useAppStore((s) => s.settings);
  const openTxModal = useAppStore((s) => s.openTxModal);
  const deleteTransaction = useAppStore((s) => s.deleteTransaction);

  // Time filter modes
  const [periodMode, setPeriodMode] = useState<'month' | 'day' | 'year' | 'range'>('month');
  const [filterMonth, setFilterMonth] = useState(getCurrentMonthKeyVN());
  const [filterDay, setFilterDay] = useState(getTodayVN());
  const [filterYear, setFilterYear] = useState(getTodayVN().slice(0, 4));
  const [fromDate, setFromDate] = useState(getCurrentMonthKeyVN() + '-01');
  const [toDate, setToDate] = useState(getTodayVN());

  const [filterAccount, setFilterAccount] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');

  const [chartKind, setChartKind] = useState<'expense' | 'income' | 'combined'>('expense');
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [timelineSort, setTimelineSort] = useState<'desc' | 'asc'>('desc');
  const [exportScope, setExportScope] = useState<'filtered' | 'all'>('filtered');
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const sym = settings.currencySymbol;
  const hide = settings.hideBalances;

  const periodLabel = useMemo(() => {
    if (periodMode === 'day') return `Ngày ${formatDateVN(filterDay)}`;
    if (periodMode === 'month') return formatMonthTitleVN(filterMonth);
    if (periodMode === 'year') return `Năm ${filterYear}`;
    return `${formatDateVN(fromDate)} – ${formatDateVN(toDate)}`;
  }, [periodMode, filterDay, filterMonth, filterYear, fromDate, toDate]);

  const filteredTxs = useMemo(() => {
    return transactions.filter((tx) => {
      if (periodMode === 'day' && tx.date !== filterDay) return false;
      if (periodMode === 'month' && !tx.date.startsWith(filterMonth)) return false;
      if (periodMode === 'year' && !tx.date.startsWith(filterYear)) return false;
      if (periodMode === 'range') {
        if (fromDate && tx.date < fromDate) return false;
        if (toDate && tx.date > toDate) return false;
      }
      if (filterAccount && tx.accountId !== filterAccount) return false;
      if (filterCategory && tx.categoryId !== filterCategory) return false;
      if (filterType !== 'all' && tx.type !== filterType) return false;
      return true;
    });
  }, [transactions, periodMode, filterDay, filterMonth, filterYear, fromDate, toDate, filterAccount, filterCategory, filterType]);

  const stats = useMemo(() => {
    const incTxs = filteredTxs.filter((t) => t.type === 'income');
    const expTxs = filteredTxs.filter((t) => t.type === 'expense');
    const totalInc = incTxs.reduce((s, t) => s + t.amount, 0);
    const totalExp = expTxs.reduce((s, t) => s + t.amount, 0);
    const maxInc = incTxs.length > 0 ? incTxs.reduce((a, b) => (b.amount > a.amount ? b : a)) : null;
    const maxExp = expTxs.length > 0 ? expTxs.reduce((a, b) => (b.amount > a.amount ? b : a)) : null;
    return {
      totalInc,
      totalExp,
      net: totalInc - totalExp,
      count: filteredTxs.length,
      maxInc,
      maxExp,
    };
  }, [filteredTxs]);

  // Pie Breakdown (strictly separates Income vs Expense — never combines them into percentages!)
  const pieData = useMemo(() => {
    if (chartKind === 'combined') return [];
    const targetTxs = filteredTxs.filter((t) => t.type === chartKind);
    const total = targetTxs.reduce((s, t) => s + t.amount, 0);
    const map = new Map<string, number>();
    for (const t of targetTxs) {
      map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
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
          percent: total > 0 ? Math.round((amount / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTxs, chartKind, categories]);

  // Cashflow Trend Chart (Day / Week / Month)
  const trendData = useMemo(() => {
    const map = new Map<string, { label: string; thu: number; chi: number }>();
    for (const tx of filteredTxs) {
      if (!tx.date) continue;
      let key = tx.date;
      let label = formatDateVN(tx.date).slice(0, 5);
      if (trendGranularity === 'month') {
        key = tx.date.slice(0, 7);
        label = `T${tx.date.slice(5, 7)}/${tx.date.slice(2, 4)}`;
      } else if (trendGranularity === 'week') {
        const dt = new Date(tx.date);
        const weekNum = Math.ceil(dt.getDate() / 7);
        key = `${tx.date.slice(0, 7)}-W${weekNum}`;
        label = `Tuần ${weekNum} (${tx.date.slice(5, 7)})`;
      }
      const entry = map.get(key) || { label, thu: 0, chi: 0 };
      if (tx.type === 'income') entry.thu += tx.amount;
      else entry.chi += tx.amount;
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [filteredTxs, trendGranularity]);

  // Real MoM comparison insights (only when month mode & previous month has data)
  const insights = useMemo(() => {
    if (periodMode !== 'month') return [];
    const prevKey = getPreviousMonthKey(filterMonth);
    const currExpTxs = transactions.filter((t) => t.type === 'expense' && t.date.startsWith(filterMonth));
    const prevExpTxs = transactions.filter((t) => t.type === 'expense' && t.date.startsWith(prevKey));
    if (currExpTxs.length === 0 || prevExpTxs.length === 0) return [];

    const out: string[] = [];
    const currTotal = currExpTxs.reduce((s, t) => s + t.amount, 0);
    const prevTotal = prevExpTxs.reduce((s, t) => s + t.amount, 0);
    if (prevTotal > 0) {
      const pct = Math.round(((currTotal - prevTotal) / prevTotal) * 100);
      if (pct !== 0) {
        out.push(
          `Tổng chi tiêu ${formatMonthTitleVN(filterMonth)} ${pct > 0 ? 'tăng' : 'giảm'} ${Math.abs(pct)}% so với ${formatMonthTitleVN(prevKey)}.`
        );
      }
    }
    // Category spikes
    const currByCat = new Map<string, number>();
    const prevByCat = new Map<string, number>();
    currExpTxs.forEach((t) => currByCat.set(t.categoryId, (currByCat.get(t.categoryId) || 0) + t.amount));
    prevExpTxs.forEach((t) => prevByCat.set(t.categoryId, (prevByCat.get(t.categoryId) || 0) + t.amount));
    currByCat.forEach((cAmt, catId) => {
      const pAmt = prevByCat.get(catId) || 0;
      if (pAmt > 0) {
        const pct = Math.round(((cAmt - pAmt) / pAmt) * 100);
        if (Math.abs(pct) >= 20) {
          const cat = categories.find((c) => c.id === catId);
          out.push(`Chi tiêu "${cat?.name || 'Khác'}" ${pct > 0 ? 'tăng' : 'giảm'} ${Math.abs(pct)}% so với tháng trước.`);
        }
      }
    });
    return out;
  }, [periodMode, filterMonth, transactions, categories]);

  // Sorted Timeline Transactions (grouped clearly if missing time -> "Không xác định giờ")
  const sortedTimeline = useMemo(() => {
    const copy = [...filteredTxs];
    copy.sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return timelineSort === 'desc' ? -dateCmp : dateCmp;
      const tA = a.time || (timelineSort === 'desc' ? '00:00' : '99:99');
      const tB = b.time || (timelineSort === 'desc' ? '00:00' : '99:99');
      const timeCmp = tA.localeCompare(tB);
      return timelineSort === 'desc' ? -timeCmp : timeCmp;
    });
    return copy;
  }, [filteredTxs, timelineSort]);

  const handleExport = (format: 'xlsx' | 'csv' | 'pdf') => {
    const targetTxs = exportScope === 'all' ? transactions : filteredTxs;
    const totalIncome = targetTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = targetTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const opts = {
      title: 'Báo Cáo Thu Chi Cá Nhân',
      periodLabel: exportScope === 'all' ? 'Toàn bộ dữ liệu' : periodLabel,
      transactions: targetTxs,
      categories,
      accounts,
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      currencySymbol: sym,
    };
    if (format === 'xlsx') exportReportToExcel(opts);
    else if (format === 'csv') exportReportToCSV(opts);
    else exportReportToPDF(opts);
  };

  return (
    <div className="space-y-6">
      {/* 4.1 Filter Header + 4.5 Export Buttons */}
      <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-[#294D3E] dark:text-emerald-100">Báo cáo chi tiết</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Phân tích dữ liệu thực tế từ sổ tài chính chính ({periodLabel})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={exportScope}
              onChange={(e) => setExportScope(e.target.value as 'filtered' | 'all')}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-2.5 py-2 text-xs"
            >
              <option value="filtered">Xuất dữ liệu đang lọc</option>
              <option value="all">Xuất toàn bộ</option>
            </select>
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] text-white px-3 py-2 text-xs font-bold cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#E9F7EF] dark:bg-emerald-950 text-[#294D3E] dark:text-emerald-200 px-3 py-2 text-xs font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#294D3E] text-white px-3 py-2 text-xs font-bold cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
          </div>
        </div>

        {/* Time & Attribute Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <select
            value={periodMode}
            onChange={(e) => setPeriodMode(e.target.value as 'month' | 'day' | 'year' | 'range')}
            className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs font-semibold"
          >
            <option value="month">Theo tháng</option>
            <option value="day">Một ngày cụ thể</option>
            <option value="year">Theo năm</option>
            <option value="range">Từ ngày đến ngày</option>
          </select>

          {periodMode === 'month' && (
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            />
          )}
          {periodMode === 'day' && (
            <input
              type="date"
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            />
          )}
          {periodMode === 'year' && (
            <input
              type="number"
              min={2000}
              max={2100}
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            />
          )}
          {periodMode === 'range' && (
            <div className="flex gap-1.5 sm:col-span-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-2.5 py-2 text-xs"
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-2.5 py-2 text-xs"
              />
            </div>
          )}

          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
          >
            <option value="">Tất cả tài khoản</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.sticker} {c.name}</option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | 'income' | 'expense')}
            className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
          >
            <option value="all">Thu &amp; Chi</option>
            <option value="expense">Chỉ Chi</option>
            <option value="income">Chỉ Thu</option>
          </select>
        </div>
      </div>

      {/* 4.2 KPI Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="rounded-2xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-4">
          <span className="text-[11px] text-slate-500">Tổng thu</span>
          <p className="text-base font-bold font-money text-[#20B889] mt-1">+{formatVND(stats.totalInc, sym, hide)}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-4">
          <span className="text-[11px] text-slate-500">Tổng chi</span>
          <p className="text-base font-bold font-money text-[#E45F63] mt-1">-{formatVND(stats.totalExp, sym, hide)}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-4">
          <span className="text-[11px] text-slate-500">Chênh lệch</span>
          <p className="text-base font-bold font-money text-[#294D3E] dark:text-emerald-100 mt-1">{formatVND(stats.net, sym, hide)}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-4">
          <span className="text-[11px] text-slate-500">Số giao dịch</span>
          <p className="text-base font-bold font-money text-[#1A2E25] dark:text-emerald-100 mt-1">{stats.count}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-4">
          <span className="text-[11px] text-slate-500">Khoản thu lớn nhất</span>
          <p className="text-sm font-bold font-money text-[#20B889] mt-1">
            {stats.maxInc ? formatVND(stats.maxInc.amount, sym, hide) : '—'}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-4">
          <span className="text-[11px] text-slate-500">Khoản chi lớn nhất</span>
          <p className="text-sm font-bold font-money text-[#E45F63] mt-1">
            {stats.maxExp ? formatVND(stats.maxExp.amount, sym, hide) : '—'}
          </p>
        </div>
      </div>

      {/* Real-data MoM Insights */}
      {insights.length > 0 && (
        <div className="rounded-2xl bg-[#E9F7EF] dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-4 space-y-1 text-xs text-[#294D3E] dark:text-emerald-200">
          <p className="font-bold flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-[#20B889]" />
            <span>Nhận xét từ dữ liệu lịch sử</span>
          </p>
          {insights.map((txt, idx) => (
            <p key={idx}>• {txt}</p>
          ))}
        </div>
      )}

      {/* 4.2 Interactive Charts + 4.4 Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pie / Combined Chart */}
        <div className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Tỷ trọng theo danh mục</h3>
            <div className="inline-flex p-1 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] text-xs">
              <button
                type="button"
                onClick={() => setChartKind('expense')}
                className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                  chartKind === 'expense' ? 'bg-[#E45F63] text-white' : 'text-slate-500'
                }`}
              >
                Chi tiêu
              </button>
              <button
                type="button"
                onClick={() => setChartKind('income')}
                className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                  chartKind === 'income' ? 'bg-[#20B889] text-white' : 'text-slate-500'
                }`}
              >
                Thu nhập
              </button>
              <button
                type="button"
                onClick={() => setChartKind('combined')}
                className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                  chartKind === 'combined' ? 'bg-[#294D3E] text-white' : 'text-slate-500'
                }`}
              >
                Tổng hợp
              </button>
            </div>
          </div>

          {chartKind === 'combined' ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ name: periodLabel, Thu: stats.totalInc, Chi: stats.totalExp }]}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => formatShortVND(v)} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val) => formatVND(Number(val ?? 0), sym, hide)} />
                  <Legend />
                  <Bar dataKey="Thu" fill="#20B889" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="Chi" fill="#E45F63" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : pieData.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Chưa có dữ liệu {chartKind === 'expense' ? 'chi tiêu' : 'thu nhập'} trong kỳ này.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
              <div className="sm:col-span-6 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                      onClick={(_, idx) => {
                        const target = pieData[idx];
                        if (target) {
                          setFilterCategory((prev) =>
                            prev === target.categoryId ? '' : target.categoryId
                          );
                        }
                      }}
                    >
                      {pieData.map((d) => (
                        <Cell key={d.categoryId} fill={d.color} className="cursor-pointer outline-none" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatVND(Number(val ?? 0), sym, hide)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="sm:col-span-6 space-y-1.5 max-h-56 overflow-y-auto">
                {pieData.map((d) => (
                  <button
                    key={d.categoryId}
                    type="button"
                    onClick={() =>
                      setFilterCategory((prev) => (prev === d.categoryId ? '' : d.categoryId))
                    }
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer ${
                      filterCategory === d.categoryId
                        ? 'bg-[#E9F7EF] dark:bg-emerald-950 ring-1 ring-[#20B889]'
                        : 'hover:bg-[#F5F8F6] dark:hover:bg-[#0D1713]'
                    }`}
                  >
                    <span className="truncate font-semibold">
                      {d.sticker} {d.name}
                    </span>
                    <span className="font-money font-bold ml-2 shrink-0">
                      {formatShortVND(d.amount)} ({d.percent}%)
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Trend Bar Chart */}
        <div className="lg:col-span-6 rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Biểu đồ thu chi</h3>
            <div className="inline-flex p-1 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] text-xs">
              {[
                { key: 'day' as const, label: 'Ngày' },
                { key: 'week' as const, label: 'Tuần' },
                { key: 'month' as const, label: 'Tháng' },
              ].map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setTrendGranularity(g.key)}
                  className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                    trendGranularity === g.key ? 'bg-white dark:bg-[#1B3128] shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {trendData.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">Chưa có giao dịch để vẽ biểu đồ.</div>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatShortVND(v)} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val) => formatVND(Number(val ?? 0), sym, hide)} />
                  <Legend />
                  <Bar dataKey="thu" name="Thu" fill="#20B889" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="chi" name="Chi" fill="#E45F63" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 4.3 Vertical Timeline Thu Chi */}
      <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Timeline thu chi</h3>
            <p className="text-xs text-slate-500">
              Theo dõi dòng chảy giao dịch trực quan theo thời gian thực hiện
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTimelineSort((s) => (s === 'desc' ? 'asc' : 'desc'))}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs font-semibold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
          >
            <ArrowDownUp className="w-3.5 h-3.5" />
            <span>{timelineSort === 'desc' ? 'Mới nhất trước' : 'Cũ nhất trước'}</span>
          </button>
        </div>

        {sortedTimeline.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center">
            <RadishMascot expression="happy" size={80} />
            <p className="text-xs text-slate-500 mt-2">Không có giao dịch nào trong khoảng thời gian đã chọn.</p>
          </div>
        ) : (
          <div className="relative pl-6 sm:pl-24 space-y-4 before:content-[''] before:absolute before:left-2.5 sm:before:left-20 before:top-2 before:bottom-2 before:w-0.5 before:bg-emerald-200 dark:before:bg-emerald-900">
            {sortedTimeline.map((tx) => {
              const cat = categories.find((c) => c.id === tx.categoryId);
              const acc = accounts.find((a) => a.id === tx.accountId);
              const firstAtt =
                tx.attachmentIds.length > 0
                  ? attachments.find((a) => a.id === tx.attachmentIds[0])
                  : null;
              const catTint = hexToSoftTint(cat?.color || '#20B889', 0.14);

              return (
                <div key={tx.id} className="relative flex items-start gap-3">
                  {/* Timeline node dot */}
                  <span
                    className={`absolute -left-[19px] sm:-left-[21px] top-4 w-3 h-3 rounded-full ring-4 ring-white dark:ring-[#13221C] ${
                      tx.type === 'income' ? 'bg-[#20B889]' : 'bg-[#E45F63]'
                    }`}
                  />

                  {/* Desktop Left Time Column */}
                  <div className="hidden sm:block absolute -left-24 top-3 w-16 text-right">
                    <p className="text-xs font-bold font-money text-[#294D3E] dark:text-emerald-200">
                      {tx.time ? tx.time : 'Không xác định giờ'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {tx.date ? formatDateVN(tx.date).slice(0, 5) : ''}
                    </p>
                  </div>

                  {/* Right Transaction Card */}
                  <div
                    onClick={() => openTxModal(tx.type, tx)}
                    className="flex-1 rounded-2xl border border-slate-100 dark:border-emerald-900/40 p-3.5 hover:border-emerald-300 transition-colors cursor-pointer bg-[#F5F8F6]/40 dark:bg-[#0D1713]/60"
                  >
                    <div className="sm:hidden text-[11px] font-bold text-slate-500 mb-1.5">
                      {tx.date ? formatDateVN(tx.date) : 'Chưa rõ ngày'} · {tx.time || 'Không xác định giờ'}
                    </div>

                    {/* Row 1: Photo or Category Sticker + Category Name with Soft Tinted Bg */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {firstAtt ? (
                          <img
                            src={firstAtt.dataUrl}
                            alt={cat?.name || 'Ảnh'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxImg(firstAtt.dataUrl);
                            }}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <span
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                            style={{ backgroundColor: catTint }}
                          >
                            {cat?.sticker || '📦'}
                          </span>
                        )}
                        <span
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-[#1A2E25] dark:text-emerald-100"
                          style={{ backgroundColor: catTint }}
                        >
                          {cat?.name || 'Khác'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTransaction(tx.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-[#E45F63] cursor-pointer"
                        title="Xóa giao dịch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Row 2: Note */}
                    <p className="text-sm font-semibold text-[#1A2E25] dark:text-emerald-50 mt-2">
                      {tx.note || 'Không có ghi chú'}
                    </p>

                    {/* Row 3: Amount badge + account meta */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                      <span
                        className={`inline-block px-3 py-1 rounded-xl font-money text-sm font-extrabold ${
                          tx.type === 'income'
                            ? 'bg-[#E9F7EF] dark:bg-emerald-950/70 text-[#20B889]'
                            : 'bg-red-50 dark:bg-red-950/40 text-[#E45F63]'
                        }`}
                      >
                        {formatSignedVND(tx.amount, tx.type, sym, hide)}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {acc ? `${acc.sticker} ${acc.name}` : 'Chưa chọn tài khoản'} · Ghi nhận {formatDateTimeReadable(tx.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-pointer"
        >
          <img src={lightboxImg} alt="Xem ảnh" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
        </div>
      )}
    </div>
  );
};
