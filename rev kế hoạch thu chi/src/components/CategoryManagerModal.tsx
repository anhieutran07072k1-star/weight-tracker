import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Category, TransactionType } from '../types/finance';

const STICKER_PRESETS = ['🍜', '🥬', '🛍️', '🛵', '🧾', '⚡', '🏠', '💊', '💄', '🎮', '✈️', '📚', '👨‍👩‍👧', '🐾', '📦', '💵', '🎁', '🏪', '🎀', '🤝', '📥', '🏦', '💹', '✨', '☕', '🎂', '🧋', '🏋️'];
const COLOR_PRESETS = ['#20B889', '#E45F63', '#F2B85B', '#5B9BD5', '#8B7AE8', '#EC6B87', '#38BDF8', '#FB923C', '#10B981', '#94A3B8'];

export const CategoryManagerModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const saveCategory = useAppStore((s) => s.saveCategory);
  const deleteCategoryWithReassign = useAppStore((s) => s.deleteCategoryWithReassign);

  const [tab, setTab] = useState<TransactionType>('expense');
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [sticker, setSticker] = useState('🍜');
  const [color, setColor] = useState('#20B889');
  const [description, setDescription] = useState('');

  const [deletingTarget, setDeletingTarget] = useState<Category | null>(null);
  const [reassignId, setReassignId] = useState('');

  if (!open) return null;

  const list = categories
    .filter((c) => c.type === tab)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setSticker(tab === 'expense' ? '🍜' : '💵');
    setColor(tab === 'expense' ? '#E45F63' : '#20B889');
    setDescription('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await saveCategory({
      id: editing?.id,
      name,
      type: tab,
      sticker,
      color,
      description,
      isHidden: editing?.isHidden ?? false,
      sortOrder: editing ? editing.sortOrder : list.length,
    });
    resetForm();
  };

  const handleMove = async (cat: Category, dir: -1 | 1) => {
    const idx = list.findIndex((c) => c.id === cat.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const other = list[swapIdx];
    await saveCategory({ ...cat, sortOrder: other.sortOrder });
    await saveCategory({ ...other, sortOrder: cat.sortOrder });
  };

  const handleRequestDelete = async (cat: Category) => {
    const count = transactions.filter((t) => t.categoryId === cat.id).length;
    if (count === 0) {
      await deleteCategoryWithReassign(cat.id);
    } else {
      setDeletingTarget(cat);
      const firstAlt = list.find((c) => c.id !== cat.id);
      setReassignId(firstAlt?.id || '');
    }
  };

  const confirmDeleteWithReassign = async () => {
    if (!deletingTarget || !reassignId) return;
    await deleteCategoryWithReassign(deletingTarget.id, reassignId);
    setDeletingTarget(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/60 shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white/95 dark:bg-[#13221C]/95 backdrop-blur-md border-b border-slate-100 dark:border-emerald-900/40">
          <h2 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Quản lý danh mục thu chi</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713]">
            <button
              type="button"
              onClick={() => {
                setTab('expense');
                resetForm();
              }}
              className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                tab === 'expense' ? 'bg-[#E45F63] text-white' : 'text-slate-500'
              }`}
            >
              Danh mục CHI
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('income');
                resetForm();
              }}
              className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                tab === 'income' ? 'bg-[#20B889] text-white' : 'text-slate-500'
              }`}
            >
              Danh mục THU
            </button>
          </div>

          {/* Add / Edit form */}
          <form onSubmit={handleSave} className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-4 space-y-3 border border-slate-200/70 dark:border-emerald-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">
                {editing ? `Sửa danh mục "${editing.name}"` : 'Tạo danh mục mới'}
              </span>
              {editing && (
                <button type="button" onClick={resetForm} className="text-xs text-slate-500 hover:underline cursor-pointer">
                  Hủy sửa
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên danh mục (vd: Trà sữa, Đầu tư...)"
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả ngắn (tùy chọn)"
                className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">Sticker</span>
              <div className="flex flex-wrap gap-1.5">
                {STICKER_PRESETS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSticker(st)}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center cursor-pointer ${
                      sticker === st ? 'bg-[#20B889]/20 ring-2 ring-[#20B889]' : 'bg-white dark:bg-[#13221C]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 mr-1">Màu:</span>
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full cursor-pointer ${color === c ? 'ring-2 ring-offset-2 ring-[#294D3E]' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white font-semibold px-4 py-2 text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{editing ? 'Cập nhật' : 'Thêm danh mục'}</span>
              </button>
            </div>
          </form>

          {/* Reassign prompt */}
          {deletingTarget && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                Danh mục &ldquo;{deletingTarget.name}&rdquo; đang có{' '}
                {transactions.filter((t) => t.categoryId === deletingTarget.id).length} giao dịch lịch sử. Chọn danh mục khác để chuyển các giao dịch đó trước khi xóa:
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  value={reassignId}
                  onChange={(e) => setReassignId(e.target.value)}
                  className="flex-1 rounded-xl border border-amber-300 bg-white dark:bg-[#13221C] px-3 py-2 text-xs"
                >
                  {list
                    .filter((c) => c.id !== deletingTarget.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sticker} {c.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={confirmDeleteWithReassign}
                  className="rounded-xl bg-[#E45F63] text-white px-3.5 py-2 text-xs font-bold cursor-pointer"
                >
                  Chuyển &amp; Xóa
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingTarget(null)}
                  className="rounded-xl bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          {/* List */}
          <div className="divide-y divide-slate-100 dark:divide-emerald-900/40 border border-slate-100 dark:border-emerald-900/40 rounded-2xl overflow-hidden">
            {list.map((cat, idx) => {
              const txCount = transactions.filter((t) => t.categoryId === cat.id).length;
              return (
                <div
                  key={cat.id}
                  className={`flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#13221C] ${
                    cat.isHidden ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ backgroundColor: `${cat.color}20` }}
                    >
                      {cat.sticker}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1A2E25] dark:text-emerald-100 truncate">
                        {cat.name}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {txCount} giao dịch {cat.isHidden ? '· Đang ẩn' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMove(cat, -1)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                      title="Lên"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === list.length - 1}
                      onClick={() => handleMove(cat, 1)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                      title="Xuống"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => saveCategory({ ...cat, isHidden: !cat.isHidden })}
                      className="p-1.5 text-slate-400 hover:text-[#20B889] cursor-pointer"
                      title={cat.isHidden ? 'Hiện danh mục' : 'Ẩn danh mục'}
                    >
                      {cat.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(cat);
                        setName(cat.name);
                        setSticker(cat.sticker);
                        setColor(cat.color);
                        setDescription(cat.description || '');
                      }}
                      className="px-2 py-1 text-xs font-semibold text-[#20B889] hover:underline cursor-pointer"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRequestDelete(cat)}
                      className="p-1.5 text-slate-400 hover:text-[#E45F63] cursor-pointer"
                      title="Xóa danh mục"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
