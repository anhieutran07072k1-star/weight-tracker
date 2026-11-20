import React, { useState } from 'react';
import { Lock, LogOut } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { RadishMascot } from './RadishMascot';

export const LockScreen: React.FC = () => {
  const activeProfile = useAppStore((s) => s.activeProfile);
  const unlockWithSecret = useAppStore((s) => s.unlockWithSecret);
  const logout = useAppStore((s) => s.logout);

  const hasPin = Boolean(activeProfile?.pinHash);
  const [mode, setMode] = useState<'pin' | 'password'>(hasPin ? 'pin' : 'password');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = await unlockWithSecret(secret, mode);
    if (!ok) {
      setError(mode === 'pin' ? 'Mã PIN chưa chính xác.' : 'Mật khẩu chưa chính xác.');
      setSecret('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F5F8F6] dark:bg-[#0D1713] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#13221C] border border-emerald-100 dark:border-emerald-900/60 p-7 text-center shadow-sm">
        <div className="flex justify-center mb-3">
          <RadishMascot expression="sleeping" size={88} />
        </div>
        <h2 className="text-lg font-bold text-[#294D3E] dark:text-emerald-100">Ứng dụng đang khóa</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Xin chào {activeProfile?.displayName} — nhập {mode === 'pin' ? 'mã PIN' : 'mật khẩu'} để tiếp tục
        </p>

        {hasPin && (
          <div className="flex justify-center gap-3 mt-4 text-xs">
            <button
              type="button"
              onClick={() => {
                setMode('pin');
                setSecret('');
                setError('');
              }}
              className={`font-semibold cursor-pointer ${mode === 'pin' ? 'text-[#20B889] underline' : 'text-slate-500'}`}
            >
              Mã PIN
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => {
                setMode('password');
                setSecret('');
                setError('');
              }}
              className={`font-semibold cursor-pointer ${mode === 'password' ? 'text-[#20B889] underline' : 'text-slate-500'}`}
            >
              Mật khẩu
            </button>
          </div>
        )}

        <form onSubmit={handleUnlock} className="mt-4 space-y-3">
          <input
            type="password"
            inputMode={mode === 'pin' ? 'numeric' : 'text'}
            autoFocus
            value={secret}
            onChange={(e) => setSecret(mode === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value)}
            placeholder={mode === 'pin' ? 'Nhập mã PIN 4-6 số' : 'Nhập mật khẩu'}
            className="w-full rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-[#F5F8F6] dark:bg-[#0D1713] px-4 py-3 text-center text-base font-semibold tracking-widest outline-none focus:border-[#20B889]"
          />

          {error && <p className="text-xs font-medium text-[#E45F63]">{error}</p>}

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#20B889] hover:bg-[#1aa378] text-white font-semibold py-2.5 text-sm cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>Mở khóa</span>
          </button>
        </form>

        <button
          type="button"
          onClick={logout}
          className="mt-5 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#E45F63] cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Đăng xuất hồ sơ</span>
        </button>
      </div>
    </div>
  );
};
