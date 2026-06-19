import React, { useState } from 'react';

import { Button, Card } from '../components/ui.jsx';
import { clearSavedEmail, getSavedEmail, storeSavedEmail } from '../lib/supabase.js';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState(() => getSavedEmail());
  const [password, setPassword] = useState('');
  const [shouldRememberEmail, setShouldRememberEmail] = useState(() => Boolean(getSavedEmail()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email || !password || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      await onLogin(email, password);
      if (shouldRememberEmail) {
        storeSavedEmail(email);
      } else {
        clearSavedEmail();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-slate-800">在庫管理システム</h1>
          <p className="mt-2 text-sm text-slate-500">Supabaseアカウントでログインしてください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">メールアドレス</label>
            <input
              type="email"
              className="w-full rounded-md border border-slate-200 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">パスワード</label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-200 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
              checked={shouldRememberEmail}
              onChange={(event) => setShouldRememberEmail(event.target.checked)}
            />
            IDを保存する
          </label>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full py-3" disabled={isSubmitting}>
            {isSubmitting ? 'ログイン中...' : 'ログイン'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// --- Application Components ---
