"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Login() {
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();         
    router.push("/dashboard");       
  }

  return (
    <div className="min-h-dvh grid place-items-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-card border border-border p-6 rounded-xl space-y-3">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <input name="email" className="w-full bg-surface border border-border rounded-md p-2" placeholder="Email" />
        <input name="password" type="password" className="w-full bg-surface border border-border rounded-md p-2" placeholder="Password" />
        <div className="text-sm">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-brand hover:underline">Sign up</Link>
        </div>
        <button type="submit" className="w-full rounded-md bg-brand text-white py-2">
          Continue
        </button>
      </form>
    </div>
  );
}
