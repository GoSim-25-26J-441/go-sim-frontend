"use client";

import Image from "next/image";
import logo from "../../../public/logo/logo.png";
import { useLoading } from "@/hooks/useLoading";

export function GlobalLoader() {
  const isLoading = useLoading((state) => state.isLoading);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative animate-pulse-glow">
        <Image src={logo} alt="GO-SIM Logo" width={60} height={60} priority />
      </div>

      <style jsx>{`
        @keyframes pulse-glow {
          0%,
          100% {
            opacity: 1;
            filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.5));
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            filter: drop-shadow(0 0 30px rgba(59, 130, 246, 0.8));
            transform: scale(1.05);
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
