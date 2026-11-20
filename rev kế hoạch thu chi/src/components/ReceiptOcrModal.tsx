import React, { useEffect, useState } from 'react';
import { Camera, Check, Image as ImageIcon, Plus, Receipt, Trash2, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { compressImageFile, getCurrentTimeVN, getTodayVN, inferSessionFromTime } from '../utils/format';
import { ParsedReceiptData, ReceiptLineItem, runLocalReceiptOCR } from '../utils/receiptOcr';
import { RadishMascot } from './RadishMascot';
import { SmartAmountInput } from './SmartAmountInput';

export const ReceiptOcrModal: React.FC = () => {
  const open = useAppStore((s) => s.ocrModalOpen);
  const setOpen = useAppStore((s) => s.setOcrModalOpen);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const addTransaction = useAppStore((s) => s.addTransaction);
  const pushToast = useAppStore((s) => s.pushToast);

  const [mode, setMode] = useState<'receipt' | 'product'>('receipt');
  const [imageFile, setImageFile] = useState<{
    dataUrl: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  } | null>(null);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  // Receipt fields
  const [storeName, setStoreName] = useState('');
  const [date, setDate] = useState(getTodayVN());
  const [time, setTime] = useState(getCurrentTimeVN());
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [shippingFee, setShippingFee] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [items, setItems] = useState<ReceiptLineItem[]>([]);
  const [saveStrategy, setSaveStrategy] = useState<'single' | 'split'>('single');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const activeAccounts = accounts.filter((a) => a.isActive);
  const expenseCategories = categories.filter((c) => c.type === 'expense' && !c.isHidden);

  useEffect(() => {
    if (!open) return;
    setImageFile(null);
    setProcessing(false);
    setProgress(0);
    setStoreName('');
    setDate(getTodayVN());
    setTime(getCurrentTimeVN());
    setAccountId('');
    setCategoryId(expenseCategories[0]?.id || '');
    setTotalAmount(0);
    setShippingFee(0);
    setTaxAmount(0);
    setItems([]);
    setSaveStrategy('single');
    setWarnings([]);
    setNote('');
  }, [open]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageFile(file);
    const imgObj = {
      ...compressed,
      fileName: file.name,
    };
    setImageFile(imgObj);
    e.target.value = '';

    if (mode === 'receipt') {
      setProcessing(true);
      setProgress(5);
      setStatusText('Đang đọc thông tin hóa đơn trên thiết bị...');
      const parsed: ParsedReceiptData = await runLocalReceiptOCR(compressed.dataUrl, (pct, status) => {
        setProgress(pct);
        setStatusText(status);
      });
      setProcessing(false);
      setStoreName(parsed.storeName);
      setDate(parsed.date);
      setTime(parsed.time);
      setTotalAmount(parsed.totalAmount);
      setShippingFee(parsed.shippingFee);
      setTaxAmount(parsed.taxAmount);
      setItems(parsed.items);
      setWarnings(parsed.warnings);
      if (parsed.storeName) {
        setNote(`Hóa đơn ${parsed.storeName}`);
      }
    } else {
      // Product photo mode: do NOT auto-fabricate a price
      setWarnings([]);
    }
  };

  const handleAddLineItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}`,
        name: 'Sản phẩm mới',
        quantity: 1,
        unitPrice: 0,
        lineTotal: 0,
      },
    ]);
  };

  const handleSave = async () => {
    if (mode === 'product' || saveStrategy === 'single' || items.length === 0) {
      if (totalAmount <= 0) {
        setWarnings(['Vui lòng nhập số tiền thanh toán hợp lệ.']);
        return;
      }
      await addTransaction(
        {
          type: 'expense',
          amount: totalAmount,
          categoryId: categoryId || expenseCategories[0]?.id || '',
          accountId,
          date,
          time,
          session: inferSessionFromTime(time),
          note: note.trim() || (storeName ? `Mua tại ${storeName}` : 'Chi tiêu kèm ảnh'),
          attachmentIds: [],
          status: 'completed',
        },
        imageFile ? [imageFile] : []
      );
      setOpen(false);
      return;
    }

    // Split multi-item receipt into separate transactions
    const validItems = items.filter((it) => it.lineTotal > 0);
    if (validItems.length === 0) {
      setWarnings(['Không có sản phẩm nào có số tiền > 0 để tách.']);
      return;
    }

    for (let i = 0; i < validItems.length; i++) {
      const it = validItems[i];
      await addTransaction(
        {
          type: 'expense',
          amount: it.lineTotal,
          categoryId: categoryId || expenseCategories[0]?.id || '',
          accountId,
          date,
          time,
          session: inferSessionFromTime(time),
          note: `${it.name}${it.quantity > 1 ? ` (x${it.quantity})` : ''}${storeName ? ` - ${storeName}` : ''}`,
          attachmentIds: [],
          status: 'completed',
        },
        i === 0 && imageFile ? [imageFile] : []
      );
    }
    pushToast({
      title: `Đã tách và lưu ${validItems.length} khoản chi từ hóa đơn`,
      tone: 'success',
    });
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/60 shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white/95 dark:bg-[#13221C]/95 backdrop-blur-md border-b border-slate-100 dark:border-emerald-900/40">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#20B889]" />
            <h2 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">
              Chụp hóa đơn / Ảnh sản phẩm
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713]">
            <button
              type="button"
              onClick={() => setMode('receipt')}
              className={`py-2 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                mode === 'receipt'
                  ? 'bg-white dark:bg-[#1B3128] text-[#294D3E] dark:text-emerald-100 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              🧾 Quét hóa đơn (OCR cục bộ)
            </button>
            <button
              type="button"
              onClick={() => setMode('product')}
              className={`py-2 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                mode === 'product'
                  ? 'bg-white dark:bg-[#1B3128] text-[#294D3E] dark:text-emerald-100 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              📸 Chụp món ăn / sản phẩm
            </button>
          </div>

          {/* Upload / Camera controls */}
          <div className="flex flex-wrap gap-3">
            <label className="flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border-2 border-dashed border-[#20B889] bg-[#E9F7EF]/60 dark:bg-emerald-950/30 text-xs font-bold text-[#294D3E] dark:text-emerald-200 cursor-pointer hover:bg-[#E9F7EF]">
              <Camera className="w-4 h-4" />
              <span>Chụp trực tiếp bằng Camera</span>
              <input type="file" accept="image/*" capture="environment" onChange={handleImagePick} className="hidden" />
            </label>
            <label className="flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-slate-200 dark:border-emerald-900/60 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <ImageIcon className="w-4 h-4" />
              <span>Tải ảnh từ thư viện</span>
              <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
            </label>
          </div>

          {processing && (
            <div className="rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-5 flex flex-col items-center text-center">
              <RadishMascot expression="thinking" size={68} />
              <p className="text-xs font-semibold text-[#294D3E] dark:text-emerald-200 mt-2">
                {statusText} ({progress}%)
              </p>
              <div className="w-full max-w-xs h-2 rounded-full bg-slate-200 dark:bg-slate-800 mt-2 overflow-hidden">
                <div
                  className="h-full bg-[#20B889] transition-all"
                  style={{ width: `${Math.max(8, progress)}%` }}
                />
              </div>
            </div>
          )}

          {imageFile && !processing && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <img
                  src={imageFile.dataUrl}
                  alt="Ảnh hóa đơn"
                  className="w-24 h-28 object-cover rounded-2xl border border-slate-200 dark:border-emerald-900/60 shrink-0"
                />
                <div className="flex-1 space-y-2">
                  {warnings.length > 0 && (
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-2.5 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                      {warnings.map((w, i) => (
                        <p key={i}>• {w}</p>
                      ))}
                    </div>
                  )}

                  {mode === 'receipt' && (
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="Tên cửa hàng (tùy chọn)"
                      className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
                    />
                  )}

                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      mode === 'product'
                        ? 'Mô tả món ăn / sản phẩm (vd: Đĩa bánh cuốn, áo Shopee...)'
                        : 'Ghi chú giao dịch'
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <SmartAmountInput
                value={totalAmount}
                onChange={setTotalAmount}
                label={mode === 'product' ? 'Nhập giá tiền sản phẩm' : 'Tổng thanh toán'}
                accentTone="expense"
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Ngày</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-2.5 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Giờ</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-2.5 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Danh mục</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-2.5 py-2 text-xs"
                  >
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sticker} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Tài khoản</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-2.5 py-2 text-xs"
                  >
                    <option value="">-- Để trống --</option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.sticker} {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {mode === 'receipt' && (
                <div className="space-y-3 border-t border-slate-100 dark:border-emerald-900/40 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">
                      Chi tiết dòng sản phẩm ({items.length})
                    </span>
                    <div className="flex items-center gap-2">
                      {items.length > 1 && (
                        <div className="flex rounded-lg bg-slate-100 dark:bg-[#0D1713] p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setSaveStrategy('single')}
                            className={`px-2 py-1 rounded-md cursor-pointer ${
                              saveStrategy === 'single' ? 'bg-white dark:bg-[#1B3128] shadow-sm' : 'text-slate-500'
                            }`}
                          >
                            Gộp 1 giao dịch
                          </button>
                          <button
                            type="button"
                            onClick={() => setSaveStrategy('split')}
                            className={`px-2 py-1 rounded-md cursor-pointer ${
                              saveStrategy === 'split' ? 'bg-white dark:bg-[#1B3128] shadow-sm' : 'text-slate-500'
                            }`}
                          >
                            Tách từng món
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleAddLineItem}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#20B889] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm dòng</span>
                      </button>
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {items.map((it, idx) => (
                        <div key={it.id} className="grid grid-cols-12 gap-1.5 items-center text-xs">
                          <input
                            type="text"
                            value={it.name}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x))
                              )
                            }
                            className="col-span-5 rounded-lg border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-2 py-1.5"
                          />
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : x
                                )
                              )
                            }
                            className="col-span-2 rounded-lg border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-2 py-1.5 text-center"
                          />
                          <input
                            type="number"
                            min={0}
                            value={it.lineTotal}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, lineTotal: Math.round(parseInt(e.target.value, 10) || 0) } : x
                                )
                              )
                            }
                            className="col-span-4 rounded-lg border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#0D1713] px-2 py-1.5 text-right font-money"
                          />
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="col-span-1 flex justify-center text-slate-400 hover:text-[#E45F63] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {(shippingFee > 0 || taxAmount > 0) && (
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>Phí vận chuyển: {shippingFee.toLocaleString('vi-VN')}đ</span>
                      <span>Thuế/VAT: {taxAmount.toLocaleString('vi-VN')}đ</span>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white font-bold py-3 text-sm cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {mode === 'receipt' && saveStrategy === 'split' && items.length > 1
                    ? `Lưu ${items.filter((x) => x.lineTotal > 0).length} khoản chi kèm ảnh`
                    : 'Lưu giao dịch kèm ảnh'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
