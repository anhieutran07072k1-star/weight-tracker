import React, { useMemo, useState } from 'react';
import {
  ArrowRightCircle,
  BookOpen,
  FolderPlus,
  Image as ImageIcon,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { RadishMascot } from '../components/RadishMascot';
import { SmartAmountInput } from '../components/SmartAmountInput';
import { useAppStore } from '../store/useAppStore';
import { CustomLedger, DiaryEntry } from '../types/finance';
import { compressImageFile, formatDateVN, formatVND, getCurrentTimeVN, getTodayVN } from '../utils/format';

const LEDGER_STICKERS = ['✈️', '🏔️', '🏖️', '🎂', '🧧', '👨‍👩‍👧', '🚀', '🍱', '🏠', '💍'];
const LEDGER_COLORS = ['#20B889', '#38BDF8', '#F2B85B', '#E45F63', '#8B7AE8', '#EC6B87'];

export const OtherLedgersPage: React.FC = () => {
  const customLedgers = useAppStore((s) => s.customLedgers);
  const ledgerTransactions = useAppStore((s) => s.ledgerTransactions);
  const diaryEntries = useAppStore((s) => s.diaryEntries);
  const attachments = useAppStore((s) => s.attachments);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const settings = useAppStore((s) => s.settings);

  const saveCustomLedger = useAppStore((s) => s.saveCustomLedger);
  const deleteCustomLedger = useAppStore((s) => s.deleteCustomLedger);
  const addLedgerTransaction = useAppStore((s) => s.addLedgerTransaction);
  const deleteLedgerTransaction = useAppStore((s) => s.deleteLedgerTransaction);
  const reflectLedgerTxToMainAccount = useAppStore((s) => s.reflectLedgerTxToMainAccount);
  const saveDiaryEntry = useAppStore((s) => s.saveDiaryEntry);
  const deleteDiaryEntry = useAppStore((s) => s.deleteDiaryEntry);

  const sym = settings.currencySymbol;
  const hide = settings.hideBalances;

  const [mainTab, setMainTab] = useState<'ledgers' | 'diary'>('ledgers');
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>('');

  // Create/Edit Ledger modal
  const [ledgerModal, setLedgerModal] = useState(false);
  const [editingLedger, setEditingLedger] = useState<CustomLedger | null>(null);
  const [lName, setLName] = useState('');
  const [lSticker, setLSticker] = useState('✈️');
  const [lColor, setLColor] = useState('#20B889');
  const [lDesc, setLDesc] = useState('');
  const [lStart, setLStart] = useState(getTodayVN());
  const [lEnd, setLEnd] = useState('');

  // Ledger Tx form
  const [ltxModal, setLtxModal] = useState(false);
  const [ltxType, setLtxType] = useState<'contribution' | 'expense'>('expense');
  const [ltxAmount, setLtxAmount] = useState(0);
  const [ltxPersonOrCat, setLtxPersonOrCat] = useState('');
  const [ltxDate, setLtxDate] = useState(getTodayVN());
  const [ltxTime, setLtxTime] = useState(getCurrentTimeVN());
  const [ltxNote, setLtxNote] = useState('');
  const [ltxFile, setLtxFile] = useState<{ dataUrl: string; fileName: string; mimeType: string; sizeBytes: number } | undefined>(undefined);

  // Reflect to main ledger modal
  const [reflectTargetId, setReflectTargetId] = useState<string | null>(null);
  const [reflectAccountId, setReflectAccountId] = useState('');
  const [reflectCatId, setReflectCatId] = useState('');

  // Diary state
  const [diarySearch, setDiarySearch] = useState('');
  const [diaryFrom, setDiaryFrom] = useState('');
  const [diaryModal, setDiaryModal] = useState(false);
  const [editingDiary, setEditingDiary] = useState<DiaryEntry | null>(null);
  const [dTitle, setDTitle] = useState('');
  const [dDate, setDDate] = useState(getTodayVN());
  const [dMood, setDMood] = useState('😊');
  const [dContent, setDContent] = useState('');
  const [dPendingFiles, setDPendingFiles] = useState<Array<{ dataUrl: string; fileName: string; mimeType: string; sizeBytes: number }>>([]);

  const activeLedger = customLedgers.find((l) => l.id === selectedLedgerId) || customLedgers[0] || null;

  const activeLedgerTxs = useMemo(() => {
    if (!activeLedger) return [];
    return ledgerTransactions
      .filter((t) => t.ledgerId === activeLedger.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  }, [ledgerTransactions, activeLedger]);

  const ledgerSummary = useMemo(() => {
    const contributed = activeLedgerTxs.filter((t) => t.type === 'contribution').reduce((s, t) => s + t.amount, 0);
    const spent = activeLedgerTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const contributorMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();
    for (const t of activeLedgerTxs) {
      const label = t.personOrCategory || (t.type === 'contribution' ? 'Thành viên' : 'Chi phí');
      if (t.type === 'contribution') {
        contributorMap.set(label, (contributorMap.get(label) || 0) + t.amount);
      } else {
        expenseMap.set(label, (expenseMap.get(label) || 0) + t.amount);
      }
    }
    const contributors = Array.from(contributorMap.entries()).map(([name, amount]) => ({ name, amount }));
    const expenseBreakdown = Array.from(expenseMap.entries()).map(([name, amount], idx) => ({
      name,
      amount,
      color: LEDGER_COLORS[idx % LEDGER_COLORS.length],
    }));

    return { contributed, spent, remaining: contributed - spent, contributors, expenseBreakdown };
  }, [activeLedgerTxs]);

  const filteredDiary = useMemo(() => {
    return diaryEntries.filter((d) => {
      if (diaryFrom && d.date < diaryFrom) return false;
      if (diarySearch.trim()) {
        const q = diarySearch.trim().toLowerCase();
        if (!d.title.toLowerCase().includes(q) && !d.content.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [diaryEntries, diarySearch, diaryFrom]);

  const openLedgerForm = (item?: CustomLedger) => {
    setEditingLedger(item || null);
    setLName(item?.name || '');
    setLSticker(item?.sticker || '✈️');
    setLColor(item?.color || '#20B889');
    setLDesc(item?.description || '');
    setLStart(item?.startDate || getTodayVN());
    setLEnd(item?.endDate || '');
    setLedgerModal(true);
  };

  const openDiaryForm = (item?: DiaryEntry) => {
    setEditingDiary(item || null);
    setDTitle(item?.title || '');
    setDDate(item?.date || getTodayVN());
    setDMood(item?.moodSticker || '😊');
    setDContent(item?.content || '');
    setDPendingFiles([]);
    setDiaryModal(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-2xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50">
          <button
            type="button"
            onClick={() => setMainTab('ledgers')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
              mainTab === 'ledgers' ? 'bg-[#20B889] text-white' : 'text-slate-500'
            }`}
          >
            Sổ theo dõi độc lập
          </button>
          <button
            type="button"
            onClick={() => setMainTab('diary')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
              mainTab === 'diary' ? 'bg-[#20B889] text-white' : 'text-slate-500'
            }`}
          >
            Nhật ký riêng
          </button>
        </div>

        {mainTab === 'ledgers' ? (
          <button
            type="button"
            onClick={() => openLedgerForm()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] text-white px-4 py-2.5 text-xs font-bold cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>+ Tạo sổ mới</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openDiaryForm()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] text-white px-4 py-2.5 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Viết nhật ký mới</span>
          </button>
        )}
      </div>

      {/* TAB 1: INDEPENDENT CUSTOM LEDGERS */}
      {mainTab === 'ledgers' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-[#E9F7EF]/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-3.5 text-xs text-[#294D3E] dark:text-emerald-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#20B889] shrink-0" />
            <span>
              <strong>Không gian độc lập:</strong> Mọi khoản đóng góp và chi tiêu trong các sổ này không cộng vào tổng thu/chi sổ chính, không đổi số dư ví và không ảnh hưởng ngân sách tháng.
            </span>
          </div>

          {customLedgers.length === 0 ? (
            <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-10 flex flex-col items-center text-center">
              <RadishMascot expression="happy" size={92} />
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100 mt-3">
                Tạo sổ tài chính riêng cho chuyến đi hoặc dự án của bạn
              </h3>
              <p className="text-xs text-slate-500 max-w-md mt-1">
                Ví dụ: Du lịch Đà Lạt, Quỹ ăn uống chung, Tiệc sinh nhật, Mua sắm Tết, Dự án cá nhân...
              </p>
              <button
                type="button"
                onClick={() => openLedgerForm()}
                className="mt-4 rounded-xl bg-[#20B889] text-white px-4 py-2.5 text-xs font-bold cursor-pointer"
              >
                + Tạo sổ mới đầu tiên
              </button>
            </div>
          ) : (
            <>
              {/* Ledger Tabs Strip */}
              <div className="flex flex-wrap gap-2">
                {customLedgers.map((lg) => {
                  const selected = activeLedger?.id === lg.id;
                  return (
                    <button
                      key={lg.id}
                      type="button"
                      onClick={() => setSelectedLedgerId(lg.id)}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                        selected
                          ? 'border-[#20B889] bg-white dark:bg-[#13221C] text-[#294D3E] dark:text-emerald-100 shadow-sm'
                          : 'border-slate-200 dark:border-emerald-900/40 bg-white/60 dark:bg-[#13221C]/60 text-slate-500'
                      }`}
                    >
                      <span className="text-base">{lg.sticker}</span>
                      <span>{lg.name}</span>
                    </button>
                  );
                })}
              </div>

              {activeLedger && (
                <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                        style={{ backgroundColor: `${activeLedger.color}22` }}
                      >
                        {activeLedger.sticker}
                      </span>
                      <div>
                        <h3 className="text-lg font-extrabold text-[#294D3E] dark:text-emerald-100">
                          {activeLedger.name}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {formatDateVN(activeLedger.startDate)}
                          {activeLedger.endDate ? ` → ${formatDateVN(activeLedger.endDate)}` : ''}
                          {activeLedger.description ? ` · ${activeLedger.description}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openLedgerForm(activeLedger)}
                        className="px-3 py-1.5 rounded-xl bg-[#F5F8F6] dark:bg-[#0D1713] text-xs font-semibold cursor-pointer"
                      >
                        Sửa sổ
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCustomLedger(activeLedger.id)}
                        className="p-2 rounded-xl text-slate-400 hover:text-[#E45F63] cursor-pointer"
                        title="Xóa sổ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLtxType('expense');
                          setLtxAmount(0);
                          setLtxPersonOrCat('');
                          setLtxDate(getTodayVN());
                          setLtxTime(getCurrentTimeVN());
                          setLtxNote('');
                          setLtxFile(undefined);
                          setLtxModal(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#20B889] text-white px-3.5 py-2 text-xs font-bold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Ghi vào sổ</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-[#E9F7EF]/70 dark:bg-emerald-950/40 p-4">
                      <span className="text-xs text-slate-500">Tổng tiền đóng góp / Quỹ</span>
                      <p className="text-lg font-bold font-money text-[#20B889] mt-1">
                        +{formatVND(ledgerSummary.contributed, sym, hide)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-red-50/70 dark:bg-red-950/30 p-4">
                      <span className="text-xs text-slate-500">Tổng tiền đã chi</span>
                      <p className="text-lg font-bold font-money text-[#E45F63] mt-1">
                        -{formatVND(ledgerSummary.spent, sym, hide)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-4">
                      <span className="text-xs text-slate-500">Số dư quỹ còn lại</span>
                      <p className="text-lg font-bold font-money text-[#294D3E] dark:text-emerald-100 mt-1">
                        {formatVND(ledgerSummary.remaining, sym, hide)}
                      </p>
                    </div>
                  </div>

                  {/* Contributors & Chart */}
                  {(ledgerSummary.contributors.length > 0 || ledgerSummary.expenseBreakdown.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {ledgerSummary.contributors.length > 0 && (
                        <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-4 space-y-2">
                          <h4 className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">
                            Danh sách đóng góp
                          </h4>
                          {ledgerSummary.contributors.map((c) => (
                            <div key={c.name} className="flex justify-between text-xs">
                              <span className="font-semibold">{c.name}</span>
                              <span className="font-money font-bold text-[#20B889]">
                                +{formatVND(c.amount, sym, hide)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {ledgerSummary.expenseBreakdown.length > 0 && (
                        <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-4 flex items-center gap-4">
                          <div className="w-28 h-28 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={ledgerSummary.expenseBreakdown} dataKey="amount" nameKey="name" innerRadius={22} outerRadius={44}>
                                  {ledgerSummary.expenseBreakdown.map((e) => (
                                    <Cell key={e.name} fill={e.color} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(val) => formatVND(Number(val ?? 0), sym, hide)} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-1 text-xs">
                            <h4 className="font-bold text-[#294D3E] dark:text-emerald-200">Cơ cấu chi tiêu sổ</h4>
                            {ledgerSummary.expenseBreakdown.map((e) => (
                              <div key={e.name} className="flex justify-between">
                                <span className="truncate">{e.name}</span>
                                <span className="font-money font-bold">{formatVND(e.amount, sym, hide)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ledger Timeline / Transactions */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">
                      Lịch sử giao dịch trong sổ ({activeLedgerTxs.length})
                    </h4>
                    {activeLedgerTxs.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">Chưa có khoản đóng góp hay chi tiêu nào trong sổ này.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-emerald-900/40">
                        {activeLedgerTxs.map((ltx) => {
                          const att = ltx.attachmentId ? attachments.find((a) => a.id === ltx.attachmentId) : null;
                          return (
                            <div key={ltx.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                {att && (
                                  <img src={att.dataUrl} alt="Ảnh" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100">
                                    {ltx.type === 'contribution' ? `Đóng góp: ${ltx.personOrCategory}` : ltx.personOrCategory}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {formatDateVN(ltx.date)} {ltx.time} {ltx.note ? `· ${ltx.note}` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-money text-sm font-bold ${
                                    ltx.type === 'contribution' ? 'text-[#20B889]' : 'text-[#E45F63]'
                                  }`}
                                >
                                  {ltx.type === 'contribution' ? '+' : '-'}
                                  {formatVND(ltx.amount, sym, hide)}
                                </span>

                                {!ltx.reflectedMainTxId ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReflectTargetId(ltx.id);
                                      setReflectAccountId(accounts.find((a) => a.isActive)?.id || '');
                                      const matchingType = ltx.type === 'contribution' ? 'income' : 'expense';
                                      setReflectCatId(categories.find((c) => c.type === matchingType)?.id || '');
                                    }}
                                    title="Phản ánh vào tài khoản chính"
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#F5F8F6] dark:bg-[#0D1713] px-2 py-1 text-[11px] font-semibold text-[#294D3E] dark:text-emerald-300 cursor-pointer"
                                  >
                                    <ArrowRightCircle className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Ghi vào sổ chính</span>
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-[#20B889] font-semibold">Đã ghi sổ chính</span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => deleteLedgerTransaction(ltx.id)}
                                  className="p-1.5 text-slate-400 hover:text-[#E45F63] cursor-pointer"
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
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: INDEPENDENT DIARY */}
      {mainTab === 'diary' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={diarySearch}
                onChange={(e) => setDiarySearch(e.target.value)}
                placeholder="Tìm kiếm nhật ký theo từ khóa..."
                className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] pl-9 pr-3 py-2 text-xs"
              />
            </div>
            <input
              type="date"
              value={diaryFrom}
              onChange={(e) => setDiaryFrom(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            />
            {diaryFrom && (
              <button type="button" onClick={() => setDiaryFrom('')} className="text-xs text-slate-500 cursor-pointer">
                Xóa lọc ngày
              </button>
            )}
          </div>

          {filteredDiary.length === 0 ? (
            <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-10 flex flex-col items-center text-center">
              <BookOpen className="w-10 h-10 text-[#20B889] mb-2" />
              <p className="text-sm font-bold text-[#294D3E] dark:text-emerald-100">Sổ tay nhật ký riêng</p>
              <p className="text-xs text-slate-500 mt-1">
                Ghi lại nhật ký đi chợ, cảm xúc hoặc lưu ý chi tiêu hằng ngày (độc lập hoàn toàn với giao dịch tiền).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDiary.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{entry.moodSticker}</span>
                      <div>
                        <h4 className="text-sm font-bold text-[#294D3E] dark:text-emerald-100">{entry.title}</h4>
                        <p className="text-[11px] text-slate-400">{formatDateVN(entry.date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => openDiaryForm(entry)}
                        className="text-[#20B889] font-semibold cursor-pointer"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDiaryEntry(entry.id)}
                        className="text-slate-400 hover:text-[#E45F63] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    {entry.content}
                  </p>
                  {entry.attachmentIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.attachmentIds.map((attId) => {
                        const att = attachments.find((a) => a.id === attId);
                        return att ? (
                          <img key={attId} src={att.dataUrl} alt="Ảnh nhật ký" className="w-16 h-16 rounded-xl object-cover" />
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Create/Edit Custom Ledger */}
      {ledgerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
                {editingLedger ? 'Sửa sổ theo dõi' : 'Tạo sổ theo dõi độc lập'}
              </h3>
              <button type="button" onClick={() => setLedgerModal(false)} className="text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Tên sổ (vd: Du lịch Đà Lạt, Quỹ gia đình...)"
              value={lName}
              onChange={(e) => setLName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5 flex-wrap">
                {LEDGER_STICKERS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setLSticker(st)}
                    className={`w-8 h-8 rounded-lg ${lSticker === st ? 'bg-[#E9F7EF] ring-2 ring-[#20B889]' : 'bg-slate-100 dark:bg-slate-800'} cursor-pointer`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <input type="color" value={lColor} onChange={(e) => setLColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Ngày bắt đầu</label>
                <input type="date" value={lStart} onChange={(e) => setLStart(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Ngày kết thúc (tùy chọn)</label>
                <input type="date" value={lEnd} onChange={(e) => setLEnd(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              </div>
            </div>
            <input
              type="text"
              placeholder="Mô tả ngắn"
              value={lDesc}
              onChange={(e) => setLDesc(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (!lName.trim()) return;
                const newId = await saveCustomLedger({
                  id: editingLedger?.id,
                  name: lName.trim(),
                  sticker: lSticker,
                  color: lColor,
                  description: lDesc,
                  startDate: lStart,
                  endDate: lEnd || undefined,
                });
                setSelectedLedgerId(newId);
                setLedgerModal(false);
              }}
              className="w-full rounded-xl bg-[#20B889] text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Lưu sổ riêng
            </button>
          </div>
        </div>
      )}

      {/* Modal: Add Ledger Transaction */}
      {ltxModal && activeLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
                Ghi vào sổ: {activeLedger.name}
              </h3>
              <button type="button" onClick={() => setLtxModal(false)} className="text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLtxType('expense')}
                className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  ltxType === 'expense' ? 'bg-[#E45F63] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
              >
                Chi tiêu từ quỹ
              </button>
              <button
                type="button"
                onClick={() => setLtxType('contribution')}
                className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  ltxType === 'contribution' ? 'bg-[#20B889] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
              >
                Đóng góp vào quỹ
              </button>
            </div>
            <SmartAmountInput value={ltxAmount} onChange={setLtxAmount} showQuickChips={false} />
            <input
              type="text"
              placeholder={ltxType === 'contribution' ? 'Tên người đóng góp (vd: Người A)' : 'Hạng mục chi (vd: Khách sạn, Ăn uống...)'}
              value={ltxPersonOrCat}
              onChange={(e) => setLtxPersonOrCat(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={ltxDate} onChange={(e) => setLtxDate(e.target.value)} className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              <input type="time" value={ltxTime} onChange={(e) => setLtxTime(e.target.value)} className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
            </div>
            <input
              type="text"
              placeholder="Ghi chú"
              value={ltxNote}
              onChange={(e) => setLtxNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#20B889] cursor-pointer">
              <ImageIcon className="w-4 h-4" />
              <span>{ltxFile ? ltxFile.fileName : 'Đính kèm ảnh (tùy chọn)'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const c = await compressImageFile(f);
                    setLtxFile({ ...c, fileName: f.name });
                  }
                }}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                if (ltxAmount <= 0) return;
                await addLedgerTransaction(
                  {
                    ledgerId: activeLedger.id,
                    type: ltxType,
                    amount: ltxAmount,
                    personOrCategory: ltxPersonOrCat.trim() || (ltxType === 'contribution' ? 'Đóng góp' : 'Chi phí'),
                    date: ltxDate,
                    time: ltxTime,
                    note: ltxNote,
                  },
                  ltxFile
                );
                setLtxModal(false);
              }}
              className="w-full rounded-xl bg-[#20B889] text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Lưu vào sổ riêng
            </button>
          </div>
        </div>
      )}

      {/* Modal: Reflect Ledger Tx into Main Account (with duplicate warning) */}
      {reflectTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
              Phản ánh giao dịch vào tài khoản chính
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl">
              Cảnh báo: Thao tác này sẽ tạo một giao dịch tương ứng trong sổ chính và cập nhật số dư tài khoản bạn chọn. Chỉ thực hiện một lần để tránh ghi nhận trùng lặp!
            </p>
            <select
              value={reflectAccountId}
              onChange={(e) => setReflectAccountId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
            >
              {accounts.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.sticker} {a.name}</option>
              ))}
            </select>
            <select
              value={reflectCatId}
              onChange={(e) => setReflectCatId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
            >
              {categories.filter((c) => !c.isHidden).map((c) => (
                <option key={c.id} value={c.id}>{c.sticker} {c.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReflectTargetId(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  await reflectLedgerTxToMainAccount(reflectTargetId, reflectAccountId, reflectCatId);
                  setReflectTargetId(null);
                }}
                className="flex-1 rounded-xl bg-[#20B889] text-white py-2.5 text-xs font-bold cursor-pointer"
              >
                Xác nhận ghi sổ chính
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Diary Entry */}
      {diaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#13221C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
                {editingDiary ? 'Sửa nhật ký' : 'Viết nhật ký mới'}
              </h3>
              <button type="button" onClick={() => setDiaryModal(false)} className="text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Tiêu đề (vd: Nhật ký đi chợ ngày 08/09)"
              value={dTitle}
              onChange={(e) => setDTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs" />
              <div className="flex gap-1">
                {['😊', '🥳', '😌', '🤔', '😅', '❤️'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDMood(m)}
                    className={`w-8 h-8 rounded-lg ${dMood === m ? 'bg-[#E9F7EF] ring-2 ring-[#20B889]' : 'bg-slate-100 dark:bg-slate-800'} cursor-pointer`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={4}
              placeholder="Viết ghi chú tự do tại đây..."
              value={dContent}
              onChange={(e) => setDContent(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-3 py-2 text-sm"
            />
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#20B889] cursor-pointer">
              <ImageIcon className="w-4 h-4" />
              <span>Thêm ảnh kỷ niệm ({dPendingFiles.length} ảnh mới)</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files) return;
                  const arr: Array<{ dataUrl: string; fileName: string; mimeType: string; sizeBytes: number }> = [];
                  for (let i = 0; i < files.length; i++) {
                    const c = await compressImageFile(files[i]);
                    arr.push({ ...c, fileName: files[i].name });
                  }
                  setDPendingFiles((prev) => [...prev, ...arr]);
                }}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                if (!dTitle.trim() && !dContent.trim()) return;
                await saveDiaryEntry(
                  {
                    id: editingDiary?.id,
                    title: dTitle.trim() || `Nhật ký ngày ${formatDateVN(dDate)}`,
                    date: dDate,
                    content: dContent,
                    moodSticker: dMood,
                    attachmentIds: editingDiary?.attachmentIds || [],
                  },
                  dPendingFiles
                );
                setDiaryModal(false);
              }}
              className="w-full rounded-xl bg-[#20B889] text-white font-bold py-2.5 text-sm cursor-pointer"
            >
              Lưu nhật ký
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
