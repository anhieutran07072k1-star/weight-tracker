import React, { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, Lock, ShieldCheck, Upload, UserPlus } from 'lucide-react';
import { db, inspectBackupFile, restoreBackupData } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { UserProfile } from '../types/finance';
import { RadishMascot } from './RadishMascot';
import { SmartAmountInput } from './SmartAmountInput';
import { PWAInstallButton } from './PWAComponents';

export const AuthScreen: React.FC = () => {
  const registerProfile = useAppStore((s) => s.registerProfile);
  const loginProfile = useAppStore((s) => s.loginProfile);
  const loginWithGoogle = useAppStore((s) => s.loginWithGoogle);
  const refreshAllData = useAppStore((s) => s.refreshAllData);
  const pushToast = useAppStore((s) => s.pushToast);

  const [existingProfiles, setExistingProfiles] = useState<UserProfile[]>([]);
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [loginMethod, setLoginMethod] = useState<'password' | 'pin'>('password');

  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(true);

  const [cashInit, setCashInit] = useState(0);
  const [momoInit, setMomoInit] = useState(0);
  const [bankInit, setBankInit] = useState(0);
  const [showStarterWallets, setShowStarterWallets] = useState(false);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  useEffect(() => {
    db.userProfiles.toArray().then((list) => {
      setExistingProfiles(list);
      if (list.length > 0) {
        setMode('login');
        const firstLocal = list.find((p) => !p.googleUid) || list[0];
        setIdentifier(firstLocal.identifier);
      }
    });
  }, []);

  const handleGoogleContinue = async () => {
    setError('');
    setGoogleSubmitting(true);
    try {
      const res = await loginWithGoogle({ remember });
      if (!res.ok) {
        setError(res.error || 'Đăng nhập với Google không thành công.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('Mật khẩu xác nhận không khớp.');
          setSubmitting(false);
          return;
        }
        const res = await registerProfile({
          identifier,
          displayName,
          password,
          pin: pin.trim() || undefined,
          remember,
          starterBalances: {
            acc_cash: cashInit,
            acc_momo: momoInit,
            acc_bidv: bankInit,
          },
        });
        if (!res.ok) setError(res.error || 'Không thể tạo hồ sơ.');
      } else {
        const res = await loginProfile({
          identifier,
          secret: loginMethod === 'pin' ? pin : password,
          mode: loginMethod,
          remember,
        });
        if (!res.ok) setError(res.error || 'Đăng nhập thất bại.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const info = await inspectBackupFile(text);
    if (!info.valid || !info.parsedData) {
      setError(info.error || 'Tệp sao lưu không hợp lệ.');
      return;
    }
    if (Array.isArray(info.parsedData.userProfiles) && info.parsedData.userProfiles.length > 0) {
      await db.userProfiles.bulkPut(info.parsedData.userProfiles as UserProfile[]);
    }
    const count = await restoreBackupData(info.parsedData, 'overwrite');
    await refreshAllData();
    const profiles = await db.userProfiles.toArray();
    setExistingProfiles(profiles);
    if (profiles.length > 0) {
      setMode('login');
      setIdentifier(profiles[0].identifier);
    }
    pushToast({
      title: 'Đã khôi phục dữ liệu từ bản sao lưu',
      description: `Khôi phục ${count} bản ghi thành công. Hãy đăng nhập bằng hồ sơ của bạn.`,
      tone: 'success',
      mascot: 'celebrating',
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F8F6] dark:bg-[#0D1713] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/50 shadow-sm">
        {/* Left Friendly Welcome Panel */}
        <div className="lg:col-span-5 bg-[#E9F7EF] dark:bg-[#152C23] p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-6">
              <span className="text-lg font-extrabold tracking-tight text-[#294D3E] dark:text-emerald-200">
                Kế Hoạch Thu Chi
              </span>
              <PWAInstallButton compact />
            </div>

            <div className="flex justify-center my-4">
              <RadishMascot expression="waving" size={128} />
            </div>

            <h1 className="text-2xl font-extrabold text-[#294D3E] dark:text-emerald-50 text-center mt-2">
              Quản lý tài chính nhẹ nhàng mỗi ngày
            </h1>
            <p className="text-sm text-[#436B5B] dark:text-emerald-200/80 text-center mt-3 leading-relaxed">
              Ghi chép thu chi siêu nhanh bằng chữ, giọng nói hoặc chụp hóa đơn. Dùng được ngoại tuyến và đồng bộ đa thiết bị qua Google Drive riêng.
            </p>
          </div>

          <div className="mt-8 space-y-2.5 text-xs text-[#294D3E] dark:text-emerald-200/90 border-t border-emerald-200/70 dark:border-emerald-800/50 pt-5">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#20B889] shrink-0 mt-0.5" />
              <span>
                <strong>Local-first + Mã hóa AES-GCM:</strong> Mọi thay đổi lưu ngay vào IndexedDB, mã hóa trước khi đồng bộ vào không gian riêng trên Google Drive.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-[#20B889] shrink-0 mt-0.5" />
              <span>
                Nếu đăng nhập bằng Email/SĐT mà chưa liên kết Google, dữ liệu chỉ lưu trên thiết bị hiện tại (có thể liên kết Google sau).
              </span>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          {/* Official Google Sign-In CTA */}
          <div className="space-y-2.5 mb-5">
            <button
              type="button"
              disabled={googleSubmitting}
              onClick={handleGoogleContinue}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 dark:border-emerald-800 bg-white dark:bg-[#0D1713] hover:bg-slate-50 dark:hover:bg-[#162921] text-[#1F1F1F] dark:text-emerald-50 font-semibold py-3 px-4 text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>{googleSubmitting ? 'Đang kết nối Google...' : 'Tiếp tục với Google (Đồng bộ đa thiết bị)'}</span>
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200 dark:border-emerald-900/50" />
              <span className="shrink mx-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Hoặc dùng hồ sơ cục bộ trên máy
              </span>
              <div className="flex-grow border-t border-slate-200 dark:border-emerald-900/50" />
            </div>
          </div>

          <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1713] mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-[#1B3128] text-[#294D3E] dark:text-emerald-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Đăng nhập cục bộ
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-[#1B3128] text-[#294D3E] dark:text-emerald-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              Tạo hồ sơ mới
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'login' && existingProfiles.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Hồ sơ trên thiết bị
                </label>
                <div className="flex flex-wrap gap-2">
                  {existingProfiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setIdentifier(p.identifier)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        identifier === p.identifier
                          ? 'border-[#20B889] bg-[#E9F7EF] dark:bg-emerald-950 text-[#294D3E] dark:text-emerald-200'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {p.displayName} ({p.identifier}){p.googleUid ? ' · Đã liên kết Google' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
              Lưu ý: Đăng nhập bằng Email hoặc SĐT ở đây chỉ lưu dữ liệu trên thiết bị này. Nếu chưa liên kết Google, hệ thống không tự gộp với tài khoản Google trùng email.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Email hoặc Số điện thoại (định danh cục bộ)
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Ví dụ: minh@gmail.com hoặc 0901234567"
                className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Tên hiển thị (tùy chọn)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ví dụ: Gia đình Minh"
                  className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
                />
              </div>
            )}

            {mode === 'login' && (
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setLoginMethod('password')}
                  className={`font-semibold cursor-pointer ${
                    loginMethod === 'password' ? 'text-[#20B889] underline' : 'text-slate-500'
                  }`}
                >
                  Dùng mật khẩu
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => setLoginMethod('pin')}
                  className={`font-semibold cursor-pointer ${
                    loginMethod === 'pin' ? 'text-[#20B889] underline' : 'text-slate-500'
                  }`}
                >
                  Dùng mã PIN nhanh
                </button>
              </div>
            )}

            {(mode === 'register' || loginMethod === 'password') && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Mật khẩu
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 4 ký tự"
                  className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
                />
              </div>
            )}

            {mode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Xác nhận mật khẩu
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu"
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Mã PIN mở nhanh (tùy chọn, 4-6 số)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ví dụ: 1234"
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] px-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
                  />
                </div>
              </div>
            )}

            {mode === 'login' && loginMethod === 'pin' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Mã PIN mở nhanh
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Nhập 4-6 chữ số"
                    className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#0D1713] pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-[#20B889]"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowStarterWallets(!showStarterWallets)}
                  className="text-xs font-semibold text-[#20B889] hover:underline cursor-pointer"
                >
                  {showStarterWallets ? '▾ Ẩn thiết lập số dư ban đầu' : '▸ Nhập số dư ban đầu cho ví của bạn (tùy chọn)'}
                </button>
                {showStarterWallets && (
                  <div className="mt-3 p-4 rounded-2xl bg-[#F5F8F6] dark:bg-[#0D1713] space-y-3 border border-slate-200/80 dark:border-emerald-900/40">
                    <SmartAmountInput
                      label="💵 Tiền mặt ban đầu"
                      value={cashInit}
                      onChange={setCashInit}
                      showQuickChips={false}
                    />
                    <SmartAmountInput
                      label="👛 Ví MoMo ban đầu"
                      value={momoInit}
                      onChange={setMomoInit}
                      showQuickChips={false}
                    />
                    <SmartAmountInput
                      label="🏦 Tài khoản BIDV ban đầu"
                      value={bankInit}
                      onChange={setBankInit}
                      showQuickChips={false}
                    />
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-slate-300 text-[#20B889] focus:ring-[#20B889]"
              />
              <span>Ghi nhớ đăng nhập trên thiết bị này (không cần nhập lại mỗi lần mở)</span>
            </label>

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3.5 py-2.5 text-xs font-medium text-[#E45F63]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#20B889] hover:bg-[#1aa378] text-white font-semibold py-3 px-4 text-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              {mode === 'register' ? <UserPlus className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              <span>{mode === 'register' ? 'Bắt đầu quản lý thu chi' : 'Mở sổ thu chi'}</span>
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-emerald-900/40 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Đã có tệp sao lưu từ thiết bị cũ?</span>
            <label className="inline-flex items-center gap-1.5 font-semibold text-[#294D3E] dark:text-emerald-300 hover:text-[#20B889] cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Khôi phục từ tệp JSON</span>
              <input type="file" accept=".json,application/json" onChange={handleImportBackup} className="hidden" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
