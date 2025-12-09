// src/app/(auth)/login/page.tsx
"use client";
export default function Login() {
  return (
    <div className="min-h-dvh grid place-items-center">
      <form className="w-full max-w-sm bg-card border border-border p-6 rounded-xl space-y-3">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <input className="w-full bg-surface border border-border rounded-md p-2" placeholder="Email" />
        <input type="password" className="w-full bg-surface border border-border rounded-md p-2" placeholder="Password" />
        <span className="text-sm text-brand">{'Don\'t have an account?'}<a href="/signup" className="text-brand hover:underline cursor-pointer">Sign up</a></span>
        <button className="w-full rounded-md bg-brand text-white py-2">Continue</button>
      </form>
    </div>
  );
}
