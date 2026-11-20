import React, { useEffect, useRef, useState } from 'react';
import { Check, Mic, MicOff, RotateCcw, Square, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SpendingSession, TransactionType } from '../types/finance';
import { ParsedQuickTransaction, parseSmartTransactionText } from '../utils/smartParser';
import { RadishMascot } from './RadishMascot';
import { SmartAmountInput } from './SmartAmountInput';

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [subIdx: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export const VoiceInputModal: React.FC = () => {
  const open = useAppStore((s) => s.voiceModalOpen);
  const setOpen = useAppStore((s) => s.setVoiceModalOpen);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const aliases = useAppStore((s) => s.aliases);
  const addTransaction = useAppStore((s) => s.addTransaction);

  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speechError, setSpeechError] = useState('');

  // Editable parsed preview fields
  const [parsed, setParsed] = useState<ParsedQuickTransaction | null>(null);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [session, setSession] = useState<SpendingSession>('');
  const [note, setNote] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!open) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRec =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    setSupported(Boolean(SpeechRec));
    setTranscript('');
    setSpeechError('');
    setParsed(null);
  }, [open]);

  const applyParsedText = (text: string) => {
    if (!text.trim()) {
      setParsed(null);
      return;
    }
    const res = parseSmartTransactionText(text, accounts, categories, aliases);
    setParsed(res);
    setType(res.type);
    setAmount(res.amount);
    setCategoryId(res.categoryId);
    setAccountId(res.accountId);
    setDate(res.date);
    setTime(res.time);
    setSession(res.session);
    setNote(res.note);
  };

  const startListening = () => {
    const SpeechRec = (window as unknown as Record<string, new () => SpeechRecognitionLike>).SpeechRecognition ||
      (window as unknown as Record<string, new () => SpeechRecognitionLike>).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSupported(false);
      return;
    }

    setSpeechError('');
    const rec = new SpeechRec();
    rec.lang = 'vi-VN';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev) => {
      let full = '';
      for (let i = 0; i < ev.results.length; i++) {
        full += ev.results[i][0].transcript + ' ';
      }
      const cleaned = full.trim();
      setTranscript(cleaned);
      applyParsedText(cleaned);
    };

    rec.onerror = (ev) => {
      setSpeechError(
        ev.error === 'not-allowed'
          ? 'Trình duyệt chưa được cấp quyền Micro. Bạn có thể cấp quyền hoặc nhập văn bản trực tiếp bên dưới.'
          : `Lỗi nhận dạng giọng nói (${ev.error}). Bạn có thể nhập tay bên dưới.`
      );
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setSpeechError('Không thể khởi động Micro trên trình duyệt này.');
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const resetVoice = () => {
    stopListening();
    setTranscript('');
    setParsed(null);
    setSpeechError('');
    startListening();
  };

  const handleConfirmSave = async () => {
    if (amount <= 0) {
      setSpeechError('Vui lòng kiểm tra và nhập số tiền hợp lệ trước khi lưu.');
      return;
    }
    await addTransaction({
      type,
      amount,
      categoryId: categoryId || categories.find((c) => c.type === type)?.id || '',
      accountId,
      date,
      time,
      session,
      note: note.trim() || transcript.trim(),
      attachmentIds: [],
      status: 'completed',
    });
    setOpen(false);
  };

  if (!open) return null;

  const activeAccounts = accounts.filter((a) => a.isActive);
  const filteredCats = categories.filter((c) => c.type === type && !c.isHidden);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/60 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-emerald-900/40">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-[#20B889]" />
            <h2 className="text-base font-bold text-[#294D3E] dark:text-emerald-100">Nhập giao dịch bằng giọng nói</h2>
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
          {!supported && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3.5 text-xs text-amber-800 dark:text-amber-200">
              Trình duyệt hiện tại không hỗ trợ Web Speech API nhận dạng giọng nói trực tiếp. Bạn có thể gõ tự nhiên vào ô bên dưới (ví dụ: &ldquo;Sáng nay tôi ăn sáng hết 50 nghìn, trả bằng tiền mặt&rdquo;).
            </div>
          )}

          {/* Listening controls */}
          <div className="flex flex-col items-center justify-center rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] p-5 border border-emerald-100 dark:border-emerald-900/40">
            {listening ? (
              <>
                <div className="w-16 h-16 rounded-full bg-[#E45F63]/15 flex items-center justify-center mb-3 animate-pulse">
                  <Mic className="w-8 h-8 text-[#E45F63]" />
                </div>
                <p className="text-sm font-bold text-[#E45F63]">Đang lắng nghe...</p>
                <p className="text-xs text-slate-500 mt-1 text-center">
                  Thử nói: &ldquo;Sáng nay tôi ăn sáng hết 50 nghìn, trả bằng tiền mặt&rdquo;
                </p>
              </>
            ) : (
              <>
                <RadishMascot expression="happy" size={72} />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                  Nhấn Bắt đầu nói hoặc chỉnh sửa nội dung văn bản bên dưới
                </p>
              </>
            )}

            <div className="flex items-center gap-2 mt-4">
              {!listening ? (
                <button
                  type="button"
                  disabled={!supported}
                  onClick={startListening}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white font-semibold px-4 py-2.5 text-xs cursor-pointer disabled:opacity-50"
                >
                  <Mic className="w-4 h-4" />
                  <span>Bắt đầu nói</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopListening}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#E45F63] hover:bg-[#d34c50] text-white font-semibold px-4 py-2.5 text-xs cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Dừng ghi âm</span>
                </button>
              )}
              {transcript && (
                <button
                  type="button"
                  onClick={resetVoice}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-emerald-900/60 px-3.5 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Ghi âm lại</span>
                </button>
              )}
            </div>
          </div>

          {/* Live / Editable Transcript */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Nội dung nhận dạng (có thể chỉnh sửa trực tiếp)
            </label>
            <textarea
              rows={2}
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                applyParsedText(e.target.value);
              }}
              placeholder="Ví dụ: Sáng nay ăn sáng hết 50 nghìn tiền mặt..."
              className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
            />
          </div>

          {speechError && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <MicOff className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{speechError}</span>
            </div>
          )}

          {/* Parsed Editable Preview */}
          {parsed && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-[#E9F7EF]/50 dark:bg-[#0D1713] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#294D3E] dark:text-emerald-200">
                  Xem trước &amp; xác nhận trước khi lưu
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setType('expense')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      type === 'expense' ? 'bg-[#E45F63] text-white' : 'bg-white dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    Chi
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('income')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      type === 'income' ? 'bg-[#20B889] text-white' : 'bg-white dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    Thu
                  </button>
                </div>
              </div>

              {parsed.warnings.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  {parsed.warnings.map((w, i) => (
                    <p key={i}>• {w}</p>
                  ))}
                </div>
              )}

              <SmartAmountInput value={amount} onChange={setAmount} showQuickChips={false} accentTone={type} />

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Danh mục</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-2.5 py-2 text-xs"
                  >
                    {filteredCats.map((c) => (
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
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-2.5 py-2 text-xs"
                  >
                    <option value="">-- Chọn sau --</option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.sticker} {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-2.5 py-2 text-xs"
                />
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú"
                  className="rounded-xl border border-slate-200 dark:border-emerald-900/50 bg-white dark:bg-[#13221C] px-2.5 py-2 text-xs"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmSave}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#20B889] hover:bg-[#199e74] text-white font-bold py-2.5 text-sm cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Xác nhận &amp; Lưu giao dịch</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
