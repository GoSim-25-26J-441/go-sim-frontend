"use client";

import Image from "next/image";
import logo from "../../public/logo/logo.png";

export default function Loading() {
  return (
    <div className="min-h-dvh grid place-items-center bg-linear-to-b from-black/10 to-black">
      <div className="relative animate-pulse-glow">
        <Image src={logo} alt="GO-SIM Logo" width={50} height={50} />
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
