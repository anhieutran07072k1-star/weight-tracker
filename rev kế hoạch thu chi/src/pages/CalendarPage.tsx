import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { FinancialEvent } from '../types/finance';
import {
  formatDateVN,
  formatMonthTitleVN,
  formatShortVND,
  formatSignedVND,
  formatVND,
  getCurrentMonthKeyVN,
  getNextMonthKey,
  getPreviousMonthKey,
  getTodayVN,
} from '../utils/format';
import {
  convertSolar2Lunar,
  formatLunarFull,
  formatLunarShort,
  getVietnameseHolidays,
} from '../utils/lunarCalendar';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const CalendarPage: React.FC = () => {
  const selectedMonthKey = useAppStore((s) => s.selectedMonthKey);
  const setSelectedMonthKey = useAppStore((s) => s.setSelectedMonthKey);
  const transactions = useAppStore((s) => s.transactions);
  const categories = useAppStore((s) => s.categories);
  const accounts = useAppStore((s) => s.accounts);
  const events = useAppStore((s) => s.financialEvents);
  const settings = useAppStore((s) => s.settings);
  const openTxModal = useAppStore((s) => s.openTxModal);
  const saveEvent = useAppStore((s) => s.saveEvent);
  const deleteEvent = useAppStore((s) => s.deleteEvent);

  const [calMode, setCalMode] = useState<'basic' | 'other'>('other');
  const [selectedDay, setSelectedDay] = useState<string>(getTodayVN());
  const [listFilterType, setListFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [listFilterAcc, setListFilterAcc] = useState('');
  const [listFilterCat, setListFilterCat] = useState('');

  // Event modal
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FinancialEvent | null>(null);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(getTodayVN());
  const [evColor, setEvColor] = useState('#F2B85B');
  const [evSticker, setEvSticker] = useState('🎂');
  const [evType, setEvType] = useState<FinancialEvent['eventType']>('birthday');
  const [evRepeat, setEvRepeat] = useState(false);
  const [evNote, setEvNote] = useState('');

  const sym = settings.currencySymbol;
  const hide = settings.hideBalances;
  const [yearNum, monthNum] = selectedMonthKey.split('-').map(Number);

  // Month stats
  const monthStats = useMemo(() => {
    const txs = transactions.filter((t) => t.date && t.date.startsWith(selectedMonthKey));
    const inc = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const activeDays = new Set(txs.map((t) => t.date)).size;
    return { inc, exp, net: inc - exp, activeDays };
  }, [transactions, selectedMonthKey]);

  // Build calendar grid Mon -> Sun
  const calendarDays = useMemo(() => {
    const firstDay = new Date(yearNum, monthNum - 1, 1);
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    // JS getDay(): 0=Sun, 1=Mon...6=Sat -> Mon-indexed 0..6
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isWeekend: boolean;
      lunar: ReturnType<typeof convertSolar2Lunar>;
      holidays: ReturnType<typeof getVietnameseHolidays>;
      dayEvents: FinancialEvent[];
      income: number;
      expense: number;
    }> = [];

    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    for (let i = 0; i < totalCells; i++) {
      const dt = new Date(yearNum, monthNum - 1, 1 - startOffset + i);
      const y = dt.getFullYear();
      const m = dt.getMonth() + 1;
      const d = dt.getDate();
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const colIdx = i % 7;
      const isWeekend = colIdx === 5 || colIdx === 6;
      const lunar = convertSolar2Lunar(d, m, y);
      const holidays = getVietnameseHolidays(d, m, lunar);

      const dayTxs = transactions.filter((t) => t.date === dateStr);
      const income = dayTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = dayTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

      const mmdd = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(
        (ev) => ev.date === dateStr || (ev.repeatAnnually && ev.date.slice(5) === mmdd)
      );

      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: m === monthNum,
        isWeekend,
        lunar,
        holidays,
        dayEvents,
        income,
        expense,
      });
    }
    return cells;
  }, [yearNum, monthNum, transactions, events]);

  const selectedDayInfo = calendarDays.find((c) => c.dateStr === selectedDay) || (() => {
    const [sy, sm, sd] = selectedDay.split('-').map(Number);
    const lunar = convertSolar2Lunar(sd || 1, sm || 1, sy || 2026);
    const holidays = getVietnameseHolidays(sd || 1, sm || 1, lunar);
    const mmdd = selectedDay.slice(5);
    const dayEvents = events.filter((ev) => ev.date === selectedDay || (ev.repeatAnnually && ev.date.slice(5) === mmdd));
    return { lunar, holidays, dayEvents };
  })();

  const selectedDayTxs = useMemo(() => {
    return transactions.filter((t) => {
      if (t.date !== selectedDay) return false;
      if (listFilterType !== 'all' && t.type !== listFilterType) return false;
      if (listFilterAcc && t.accountId !== listFilterAcc) return false;
      if (listFilterCat && t.categoryId !== listFilterCat) return false;
      return true;
    });
  }, [transactions, selectedDay, listFilterType, listFilterAcc, listFilterCat]);

  const openNewEvent = (dateStr: string, ev?: FinancialEvent) => {
    setEditingEvent(ev || null);
    setEvTitle(ev?.title || '');
    setEvDate(ev?.date || dateStr);
    setEvColor(ev?.color || '#F2B85B');
    setEvSticker(ev?.sticker || '🎂');
    setEvType(ev?.eventType || 'birthday');
    setEvRepeat(ev?.repeatAnnually ?? false);
    setEvNote(ev?.note || '');
    setEventModalOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* 3.1 Month Overview Header */}
      <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedMonthKey(getPreviousMonthKey(selectedMonthKey))}
              className="p-2 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={selectedMonthKey}
              onChange={(e) => e.target.value && setSelectedMonthKey(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-1.5 text-sm font-bold text-[#294D3E] dark:text-emerald-100"
            />
            <button
              type="button"
              onClick={() => setSelectedMonthKey(getNextMonthKey(selectedMonthKey))}
              className="p-2 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedMonthKey(getCurrentMonthKeyVN());
                setSelectedDay(getTodayVN());
              }}
              className="px-3 py-1.5 rounded-xl bg-[#E9F7EF] dark:bg-emerald-950 text-xs font-bold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
            >
              Tháng hiện tại
            </button>
          </div>

          {/* 3.3 BASIC vs KHÁC Switch */}
          <div className="flex items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713]">
              <button
                type="button"
                onClick={() => setCalMode('basic')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  calMode === 'basic'
                    ? 'bg-white dark:bg-[#1B3128] text-[#294D3E] dark:text-emerald-100 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                BASIC
              </button>
              <button
                type="button"
                onClick={() => setCalMode('other')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  calMode === 'other'
                    ? 'bg-[#20B889] text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                KHÁC (Âm lịch &amp; Sự kiện)
              </button>
            </div>
            <button
              type="button"
              onClick={() => openNewEvent(selectedDay)}
              className="inline-flex items-center gap-1 rounded-xl bg-[#294D3E] text-white px-3 py-2 text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thêm sự kiện</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-2xl bg-[#E9F7EF]/60 dark:bg-emerald-950/40 p-3">
            <span className="text-slate-500">Tổng thu {formatMonthTitleVN(selectedMonthKey)}</span>
            <p className="text-base font-bold font-money text-[#20B889] mt-0.5">+{formatVND(monthStats.inc, sym, hide)}</p>
          </div>
          <div className="rounded-2xl bg-red-50/70 dark:bg-red-950/30 p-3">
            <span className="text-slate-500">Tổng chi</span>
            <p className="text-base font-bold font-money text-[#E45F63] mt-0.5">-{formatVND(monthStats.exp, sym, hide)}</p>
          </div>
          <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3">
            <span className="text-slate-500">Chênh lệch</span>
            <p className="text-base font-bold font-money text-[#294D3E] dark:text-emerald-100 mt-0.5">{formatVND(monthStats.net, sym, hide)}</p>
          </div>
          <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-3">
            <span className="text-slate-500">Ngày có giao dịch</span>
            <p className="text-base font-bold font-money text-[#1A2E25] dark:text-emerald-100 mt-0.5">{monthStats.activeDays} ngày</p>
          </div>
        </div>
      </div>

      {/* 3.2 Monthly Calendar Grid */}
      <div className="rounded-3xl bg-white dark:bg-[#13221C] border-2 border-[#BCE3D4] dark:border-emerald-800/80 p-3 sm:p-5 shadow-xs space-y-3">
        <div className="rounded-2xl border-2 border-[#B5DFCE] dark:border-emerald-800/80 overflow-hidden bg-[#D5ECE2] dark:bg-emerald-950/70">
          {/* Weekday Header Row */}
          <div className="grid grid-cols-7 gap-[1.5px] border-b-2 border-[#9AD2BC] dark:border-emerald-700/90 text-center text-xs font-extrabold">
            {WEEKDAYS.map((wd, idx) => {
              const isSat = idx === 5;
              const isSun = idx === 6;
              return (
                <div
                  key={wd}
                  className={`py-2.5 px-1 tracking-wide uppercase ${
                    isSun
                      ? 'bg-[#FFE7EB] dark:bg-rose-950/70 text-[#C8283B] dark:text-rose-200'
                      : isSat
                      ? 'bg-[#FFF3DE] dark:bg-amber-950/60 text-[#B45309] dark:text-amber-200'
                      : 'bg-[#E2F5EC] dark:bg-[#163327] text-[#1D4B3A] dark:text-emerald-100'
                  }`}
                >
                  {wd}
                </div>
              );
            })}
          </div>

          {/* Framed 7-column Day Cells */}
          <div className="grid grid-cols-7 gap-[1.5px]">
            {calendarDays.map((cell, idx) => {
              const isSelected = cell.dateStr === selectedDay;
              const isToday = cell.dateStr === getTodayVN();
              const hasSpecial = cell.dayEvents.length > 0 || cell.holidays.length > 0;
              const colIdx = idx % 7;
              const isSat = colIdx === 5;
              const isSun = colIdx === 6;

              let cellToneClass =
                'bg-white dark:bg-[#13221C] border-transparent hover:bg-[#F3FBF7] dark:hover:bg-[#182E25]';

              if (!cell.isCurrentMonth) {
                cellToneClass =
                  'bg-[#F1F5F3] dark:bg-[#0D1713] border-dashed border-slate-300/80 dark:border-emerald-950/90 opacity-60 hover:opacity-85';
              } else if (isSelected) {
                cellToneClass =
                  'bg-[#DDF7EB] dark:bg-[#153C2D] border-2 border-[#159C72] dark:border-emerald-400 ring-2 ring-[#20B889]/35 z-10 shadow-sm';
              } else if (isToday) {
                cellToneClass =
                  'bg-[#EEFCF5] dark:bg-[#123326] border-2 border-[#20B889] dark:border-emerald-500';
              } else if (isSun) {
                cellToneClass =
                  'bg-[#FFF8F9] dark:bg-[#1D1518] border border-[#F5CBD2] dark:border-rose-900/50 hover:border-[#E45F63]';
              } else if (isSat) {
                cellToneClass =
                  'bg-[#FFFBF4] dark:bg-[#1C1914] border border-[#F2D7AE] dark:border-amber-900/50 hover:border-amber-400';
              } else if (cell.income > 0 || cell.expense > 0 || hasSpecial) {
                cellToneClass =
                  'bg-[#FAFEFC] dark:bg-[#14261F] border border-[#B7DFCE] dark:border-emerald-800/70 hover:border-[#20B889]';
              } else {
                cellToneClass =
                  'bg-white dark:bg-[#13221C] border border-[#D4E6DD] dark:border-emerald-900/50 hover:border-[#20B889]';
              }

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => setSelectedDay(cell.dateStr)}
                  className={`min-h-[80px] sm:min-h-[100px] p-1.5 sm:p-2 text-left flex flex-col justify-between transition-all cursor-pointer relative ${cellToneClass}`}
                >
                  <div className="flex items-start justify-between gap-1 w-full">
                    <span
                      className={`inline-flex items-center justify-center text-xs sm:text-sm font-extrabold leading-none ${
                        isToday
                          ? 'bg-[#20B889] text-white px-1.5 py-1 rounded-lg shadow-xs'
                          : isSelected
                          ? 'bg-[#1D4B3A] dark:bg-emerald-400 text-white dark:text-[#0D1713] px-1.5 py-1 rounded-lg'
                          : isSun
                          ? 'text-[#D93848] dark:text-rose-300'
                          : isSat
                          ? 'text-[#B45309] dark:text-amber-300'
                          : 'text-[#1A2E25] dark:text-emerald-100'
                      }`}
                    >
                      {cell.dayNum}
                    </span>

                    {calMode === 'other' && (
                      <span
                        className={`text-[10px] font-semibold leading-none px-1 py-0.5 rounded ${
                          cell.lunar.day === 1 || cell.lunar.day === 15
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-200'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {formatLunarShort(cell.lunar)}
                      </span>
                    )}
                  </div>

                  {/* Dots for transactions & special events */}
                  <div className="flex flex-wrap items-center gap-1 my-0.5">
                    {cell.income > 0 && (
                      <span className="w-2 h-2 rounded-full bg-[#16A377] ring-1 ring-white dark:ring-[#13221C]" />
                    )}
                    {cell.expense > 0 && (
                      <span className="w-2 h-2 rounded-full bg-[#E45F63] ring-1 ring-white dark:ring-[#13221C]" />
                    )}
                    {cell.dayEvents.map((ev) => (
                      <span
                        key={ev.id}
                        className="w-2 h-2 rounded-full ring-1 ring-white dark:ring-[#13221C]"
                        style={{ backgroundColor: ev.color }}
                      />
                    ))}
                    {cell.holidays.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 ring-1 ring-white dark:ring-[#13221C]" />
                    )}
                  </div>

                  {/* Event label in KHÁC mode */}
                  {calMode === 'other' && hasSpecial && (
                    <p className="hidden sm:block text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/50 text-amber-800 dark:text-amber-200 truncate w-full">
                      {cell.dayEvents[0]
                        ? `${cell.dayEvents[0].sticker} ${cell.dayEvents[0].title}`
                        : cell.holidays[0]?.name}
                    </p>
                  )}

                  {/* Daily Totals */}
                  <div className="space-y-0.5 w-full overflow-hidden">
                    {cell.income > 0 && (
                      <p className="text-[10px] sm:text-[11px] font-money font-bold text-[#148F68] dark:text-emerald-300 bg-[#E6F8F0] dark:bg-emerald-950/70 rounded px-1 truncate">
                        +{hide ? '••' : formatShortVND(cell.income)}
                      </p>
                    )}
                    {cell.expense > 0 && (
                      <p className="text-[10px] sm:text-[11px] font-money font-bold text-[#C93B40] dark:text-rose-300 bg-[#FEECEF] dark:bg-rose-950/60 rounded px-1 truncate">
                        -{hide ? '••' : formatShortVND(cell.expense)}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Visual Legend Bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border-2 border-[#20B889] bg-[#EEFCF5]" /> Hôm nay
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border-2 border-[#159C72] bg-[#DDF7EB]" /> Ngày đang chọn
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16A377]" /> Có thu
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E45F63]" /> Có chi
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Lễ / Sự kiện
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-[#F2D7AE] bg-[#FFFBF4]" /> Thứ 7
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-[#F5CBD2] bg-[#FFF8F9]" /> Chủ nhật
          </span>
        </div>
      </div>

      {/* 3.4 Selected Day Details + Transaction List Below Calendar */}
      <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-emerald-900/40 pb-3">
          <div>
            <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#20B889]" />
              <span>Ngày {formatDateVN(selectedDay)}</span>
              {calMode === 'other' && (
                <span className="text-xs font-normal text-slate-500">
                  ({formatLunarFull(selectedDayInfo.lunar)})
                </span>
              )}
            </h3>
            {calMode === 'other' && selectedDayInfo.holidays.length > 0 && (
              <p className="text-xs font-semibold text-amber-600 mt-1">
                Lễ / Tết: {selectedDayInfo.holidays.map((h) => h.name).join(' · ')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openNewEvent(selectedDay)}
              className="px-3 py-1.5 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] text-xs font-semibold text-[#294D3E] dark:text-emerald-200 cursor-pointer"
            >
              + Sự kiện ngày này
            </button>
            <button
              type="button"
              onClick={() => openTxModal('expense')}
              className="px-3 py-1.5 rounded-xl bg-[#20B889] text-white text-xs font-bold cursor-pointer"
            >
              + Thêm thu/chi
            </button>
          </div>
        </div>

        {/* Special events of selected day (in KHÁC mode) */}
        {calMode === 'other' && selectedDayInfo.dayEvents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedDayInfo.dayEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] text-xs"
              >
                <span>{ev.sticker}</span>
                <div>
                  <span className="font-bold">{ev.title}</span>
                  {ev.repeatAnnually && <span className="text-slate-400 ml-1">(Lặp hằng năm)</span>}
                  {ev.note && <p className="text-[11px] text-slate-500">{ev.note}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => openNewEvent(selectedDay, ev)}
                  className="text-[#20B889] font-semibold ml-1 cursor-pointer"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => deleteEvent(ev.id)}
                  className="text-slate-400 hover:text-[#E45F63] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Filter bar for day transactions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] text-xs">
            {[
              { key: 'all' as const, label: 'Tất cả' },
              { key: 'income' as const, label: 'Chỉ thu' },
              { key: 'expense' as const, label: 'Chỉ chi' },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setListFilterType(f.key)}
                className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                  listFilterType === f.key ? 'bg-white dark:bg-[#1B3128] shadow-sm' : 'text-slate-500'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={listFilterAcc}
            onChange={(e) => setListFilterAcc(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-2.5 py-1.5 text-xs"
          >
            <option value="">Tất cả tài khoản</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            value={listFilterCat}
            onChange={(e) => setListFilterCat(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-2.5 py-1.5 text-xs"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Day Transactions */}
        {selectedDayTxs.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            Không có giao dịch nào trong ngày {formatDateVN(selectedDay)}.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-emerald-900/40">
            {selectedDayTxs.map((tx) => {
              const cat = categories.find((c) => c.id === tx.categoryId);
              const acc = accounts.find((a) => a.id === tx.accountId);
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => openTxModal(tx.type, tx)}
                  className="w-full py-2.5 flex items-center justify-between text-left hover:bg-[#F5F8F6]/70 dark:hover:bg-[#0D1713] px-2 rounded-xl cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg">{cat?.sticker || '📦'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100 truncate">
                        {cat?.name || 'Khác'} {tx.note ? `— ${tx.note}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {tx.time || 'Không rõ giờ'} · {acc?.name || 'Chưa chọn tài khoản'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`font-money text-sm font-bold shrink-0 ${
                      tx.type === 'income' ? 'text-[#20B889]' : 'text-[#E45F63]'
                    }`}
                  >
                    {formatSignedVND(tx.amount, tx.type, sym, hide)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Event Modal */}
      {eventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
                {editingEvent ? 'Sửa sự kiện' : 'Thêm sự kiện đặc biệt'}
              </h3>
              <button type="button" onClick={() => setEventModalOpen(false)} className="text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Tên sự kiện (vd: Sinh nhật mẹ, Du lịch Đà Lạt...)"
              value={evTitle}
              onChange={(e) => setEvTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="date"
                value={evDate}
                onChange={(e) => setEvDate(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
              />
              <select
                value={evType}
                onChange={(e) => setEvType(e.target.value as FinancialEvent['eventType'])}
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
              >
                <option value="birthday">Sinh nhật</option>
                <option value="anniversary">Kỷ niệm</option>
                <option value="travel">Du lịch</option>
                <option value="bill">Thanh toán hóa đơn</option>
                <option value="holiday">Lễ / Tết</option>
                <option value="other">Sự kiện khác</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {['🎂', '💍', '✈️', '🧾', '🎉', '❤️', '🌸'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setEvSticker(st)}
                    className={`w-8 h-8 rounded-lg ${evSticker === st ? 'bg-[#E9F7EF] ring-2 ring-[#20B889]' : 'bg-slate-100 dark:bg-slate-800'} cursor-pointer`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <input type="color" value={evColor} onChange={(e) => setEvColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={evRepeat} onChange={(e) => setEvRepeat(e.target.checked)} />
              <span>Lặp lại hằng năm</span>
            </label>
            <input
              type="text"
              placeholder="Ghi chú thêm"
              value={evNote}
              onChange={(e) => setEvNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (!evTitle.trim()) return;
                await saveEvent({
                  id: editingEvent?.id,
                  title: evTitle.trim(),
                  date: evDate,
                  color: evColor,
                  sticker: evSticker,
                  note: evNote,
                  repeatAnnually: evRepeat,
                  eventType: evType,
                });
                setEventModalOpen(false);
              }}
              className="w-full rounded-xl bg-[#20B889] text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Lưu sự kiện
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
