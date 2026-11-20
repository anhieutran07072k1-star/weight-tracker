import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  FolderCog,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import { QuickSmartBar } from '../components/QuickSmartBar';
import { RadishMascot } from '../components/RadishMascot';
import { useAppStore } from '../store/useAppStore';
import { SpendingSession } from '../types/finance';
import {
  formatDateTimeReadable,
  formatDateVN,
  formatSignedVND,
  formatVND,
  getSessionLabel,
  hexToSoftTint,
} from '../utils/format';

export const TransactionsPage: React.FC = () => {
  const transactions = useAppStore((s) => s.transactions);
  const transfers = useAppStore((s) => s.transfers);
  const categories = useAppStore((s) => s.categories);
  const accounts = useAppStore((s) => s.accounts);
  const attachments = useAppStore((s) => s.attachments);
  const settings = useAppStore((s) => s.settings);

  const openTxModal = useAppStore((s) => s.openTxModal);
  const deleteTransaction = useAppStore((s) => s.deleteTransaction);
  const deleteTransfer = useAppStore((s) => s.deleteTransfer);
  const setTransferModalOpen = useAppStore((s) => s.setTransferModalOpen);

  const [tab, setTab] = useState<'expense' | 'income' | 'all' | 'transfers'>('expense');
  const [search, setSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterSession, setFilterSession] = useState<SpendingSession>('');
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const sym = settings.currencySymbol;
  const hide = settings.hideBalances;

  const filteredTx = useMemo(() => {
    return transactions.filter((tx) => {
      if (tab === 'expense' && tx.type !== 'expense') return false;
      if (tab === 'income' && tx.type !== 'income') return false;
      if (filterAccount && tx.accountId !== filterAccount) return false;
      if (filterCategory && tx.categoryId !== filterCategory) return false;
      if (filterMonth && !tx.date.startsWith(filterMonth)) return false;
      if (filterSession && tx.session !== filterSession) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const catName = categories.find((c) => c.id === tx.categoryId)?.name.toLowerCase() || '';
        const accName = accounts.find((a) => a.id === tx.accountId)?.name.toLowerCase() || '';
        const match =
          tx.note.toLowerCase().includes(q) ||
          (tx.sourceOrRecipient || '').toLowerCase().includes(q) ||
          catName.includes(q) ||
          accName.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [transactions, tab, filterAccount, filterCategory, filterMonth, filterSession, search, categories, accounts]);

  const totalShown = useMemo(() => {
    return filteredTx.reduce((sum, tx) => (tx.type === 'income' ? sum + tx.amount : sum - tx.amount), 0);
  }, [filteredTx]);

  return (
    <div className="space-y-5">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-[#294D3E] dark:text-emerald-100">Chi tiết thu chi</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quản lý toàn bộ giao dịch sổ tài chính chính và danh mục tùy chỉnh
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCatManagerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 px-3.5 py-2 text-xs font-bold text-[#294D3E] dark:text-emerald-200 hover:border-[#20B889] cursor-pointer"
          >
            <FolderCog className="w-4 h-4 text-[#20B889]" />
            <span>Quản lý danh mục</span>
          </button>
          <button
            type="button"
            onClick={() => setTransferModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 px-3.5 py-2 text-xs font-bold text-[#294D3E] dark:text-emerald-200 hover:border-[#20B889] cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4 text-[#20B889]" />
            <span>Chuyển tiền</span>
          </button>
          <button
            type="button"
            onClick={() => openTxModal(tab === 'income' ? 'income' : 'expense')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] hover:bg-[#199e74] px-4 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm {tab === 'income' ? 'khoản thu' : 'khoản chi'}</span>
          </button>
        </div>
      </div>

      {/* Quick Smart Entry */}
      <QuickSmartBar />

      {/* Main Filter & Tab Container */}
      <div className="rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713]">
            {[
              { key: 'expense' as const, label: 'CHI' },
              { key: 'income' as const, label: 'THU' },
              { key: 'all' as const, label: 'Tất cả' },
              { key: 'transfers' as const, label: 'Chuyển tiền' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  tab === t.key
                    ? t.key === 'expense'
                      ? 'bg-[#E45F63] text-white'
                      : t.key === 'income'
                      ? 'bg-[#20B889] text-white'
                      : 'bg-white dark:bg-[#1B3128] text-[#294D3E] dark:text-emerald-100 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab !== 'transfers' && (
            <div className="text-xs text-slate-500">
              {filteredTx.length} giao dịch · Tổng:{' '}
              <strong className={`font-money ${totalShown >= 0 ? 'text-[#20B889]' : 'text-[#E45F63]'}`}>
                {formatVND(totalShown, sym, hide)}
              </strong>
            </div>
          )}
        </div>

        {/* Search & Filters */}
        {tab !== 'transfers' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm ghi chú, danh mục, nguồn tiền..."
                className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] pl-9 pr-3 py-2 text-xs outline-none focus:border-[#20B889]"
              />
            </div>
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            >
              <option value="">Tất cả tài khoản</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.sticker} {a.name}
                </option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-3 py-2 text-xs"
            >
              <option value="">Tất cả danh mục</option>
              {categories
                .filter((c) => tab === 'all' || c.type === tab)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sticker} {c.name}
                  </option>
                ))}
            </select>
            <div className="flex gap-2">
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-2.5 py-2 text-xs"
              />
              <select
                value={filterSession}
                onChange={(e) => setFilterSession(e.target.value as SpendingSession)}
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-[#F5F8F6] dark:bg-[#0D1713] px-2 py-2 text-xs"
              >
                <option value="">Mọi buổi</option>
                <option value="morning">Sáng</option>
                <option value="noon">Trưa</option>
                <option value="afternoon">Chiều</option>
                <option value="evening">Tối</option>
              </select>
            </div>
          </div>
        )}

        {/* Transfers List */}
        {tab === 'transfers' ? (
          transfers.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Chưa có giao dịch chuyển tiền nội bộ nào.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-emerald-900/40">
              {transfers.map((tr) => {
                const fromAcc = accounts.find((a) => a.id === tr.fromAccountId);
                const toAcc = accounts.find((a) => a.id === tr.toAccountId);
                return (
                  <div key={tr.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100">
                        {fromAcc?.sticker} {fromAcc?.name || '?'} → {toAcc?.sticker} {toAcc?.name || '?'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateVN(tr.date)} {tr.time} · {tr.note}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-money font-bold text-[#294D3E] dark:text-emerald-200">
                        {formatVND(tr.amount, sym, hide)}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteTransfer(tr.id)}
                        className="p-1.5 text-slate-400 hover:text-[#E45F63] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : filteredTx.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center">
            <RadishMascot expression="happy" size={88} />
            <h4 className="text-sm font-bold text-[#294D3E] dark:text-emerald-100 mt-3">
              Chưa có giao dịch nào phù hợp
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Bạn có thể gõ nhanh vào thanh thông minh phía trên hoặc bấm nút Thêm giao dịch.
            </p>
            <button
              type="button"
              onClick={() => openTxModal(tab === 'income' ? 'income' : 'expense')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] text-white px-4 py-2 text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Ghi giao dịch đầu tiên</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-emerald-900/40">
            {filteredTx.map((tx) => {
              const cat = categories.find((c) => c.id === tx.categoryId);
              const acc = accounts.find((a) => a.id === tx.accountId);
              const firstAtt =
                tx.attachmentIds.length > 0
                  ? attachments.find((a) => a.id === tx.attachmentIds[0])
                  : null;

              return (
                <div
                  key={tx.id}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-[#F5F8F6]/70 dark:hover:bg-[#0D1713]/60 px-2 rounded-2xl transition-colors"
                >
                  <div
                    onClick={() => openTxModal(tx.type, tx)}
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  >
                    {firstAtt ? (
                      <img
                        src={firstAtt.dataUrl}
                        alt={tx.note || 'Ảnh giao dịch'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImg(firstAtt.dataUrl);
                        }}
                        className="w-11 h-11 rounded-2xl object-cover border border-slate-200 dark:border-emerald-900/50 shrink-0"
                      />
                    ) : (
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
                        style={{ backgroundColor: hexToSoftTint(cat?.color || '#20B889', 0.16) }}
                      >
                        {cat?.sticker || '📦'}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-[#1A2E25] dark:text-emerald-100 truncate">
                          {cat?.name || 'Khác'}
                        </span>
                        {tx.note && (
                          <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
                            — {tx.note}
                          </span>
                        )}
                      </div>
                      {settings.txViewStyle === 'detailed' && (
                        <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>
                            {tx.date ? formatDateVN(tx.date) : 'Chưa rõ ngày'}
                            {tx.time ? ` ${tx.time}` : ''}
                          </span>
                          <span>·</span>
                          <span>{acc ? `${acc.sticker} ${acc.name}` : 'Chưa chọn tài khoản'}</span>
                          {tx.session && (
                            <>
                              <span>·</span>
                              <span>{getSessionLabel(tx.session)}</span>
                            </>
                          )}
                          {tx.sourceOrRecipient && (
                            <>
                              <span>·</span>
                              <span>Từ: {tx.sourceOrRecipient}</span>
                            </>
                          )}
                          <span className="hidden sm:inline">· Ghi lúc {formatDateTimeReadable(tx.createdAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-xl font-money text-sm font-bold ${
                        tx.type === 'income'
                          ? 'bg-[#E9F7EF] dark:bg-emerald-950/60 text-[#20B889]'
                          : 'bg-red-50 dark:bg-red-950/40 text-[#E45F63]'
                      }`}
                    >
                      {formatSignedVND(tx.amount, tx.type, sym, hide)}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteTransaction(tx.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-[#E45F63] hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      aria-label="Xóa giao dịch"
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

      <CategoryManagerModal open={catManagerOpen} onClose={() => setCatManagerOpen(false)} />

      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-pointer"
        >
          <img src={lightboxImg} alt="Xem ảnh đính kèm" className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
        </div>
      )}
    </div>
  );
};
