"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function Signup() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    // TODO: call your real signup API here
    // await fetch("/api/auth/signup", { method: "POST", body: new FormData(e.currentTarget) })
    router.push("/login?from=signup"); // go to login after “signup”
  }

  return (
    <div className="min-h-dvh grid place-items-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-card border border-border p-6 rounded-xl space-y-3">
        <h1 className="text-xl font-semibold">Create your account</h1>
        <input name="name" placeholder="Full name" className="w-full bg-surface border border-border rounded-md p-2" required />
        <input name="email" type="email" placeholder="you@example.com" className="w-full bg-surface border border-border rounded-md p-2" required />
        <input name="password" type="password" placeholder="Password" className="w-full bg-surface border border-border rounded-md p-2" required />
        <button disabled={loading} className="w-full rounded-md bg-brand text-white py-2">
          {loading ? "Creating…" : "Sign up"}
        </button>
        <p className="text-sm opacity-70">
          Already have an account? <Link href="/" className="text-brand">Log in</Link>
        </p>
      </form>
    </div>
  );
}
