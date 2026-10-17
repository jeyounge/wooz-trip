'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm({ next }) {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${next}` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setMsg({ ok: true, text: '가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.' });
        }
      }
    } catch (err) {
      const text = /Invalid login/i.test(err.message) ? '이메일이나 비밀번호가 맞지 않아요' : err.message;
      setMsg({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-[18px]">
      <div className="grid grid-cols-2 gap-1.5" role="tablist">
        {[
          ['login', '로그인'],
          ['signup', '처음이에요'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`pill ${mode === id ? 'pill-on' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="field">
        이메일
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        비밀번호 {mode === 'signup' && '(6자 이상)'}
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {msg && (
        <p role="status" className={`m-0 text-sm ${msg.ok ? 'text-ok' : 'text-warn-ink'}`}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-cta mt-1">
        {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하기'}
      </button>
    </form>
  );
}
