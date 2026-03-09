"use client";

import { useToast } from "@/hooks/useToast";
import { X, CheckCircle, XCircle, Info, AlertTriangle } from "lucide-react";
import Image from "next/image";

export function ToastContainer() {
  const toasts = useToast((s) => s.toasts);
  const removeToast = useToast((s) => s.removeToast);

  const getToastStyles = (type: string) => {
    switch (type) {
      case "chat":
        return "bg-black/70 text-white text-sm font-medium rounded-md px-3 py-2.5 border-white/10";
      case "success":
        return "bg-gradient-to-r from-[#34D399]/10 to-[#34D399]/10 border-[#34D399]/30 text-green-400";
      case "error":
        return "bg-gradient-to-r from-[#F58595]/10 to-[#F58595]/10 border-[#F58595]/30 text-red-400";
      case "info":
        return "bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-500/30 text-blue-400";
      case "warning":
        return "bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30 text-yellow-400";
      default:
        return "bg-gray-800 border-gray-700 text-gray-200";
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "chat":
        return (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            <Image
              src="/logo/logo.png"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
            />
          </div>
        );
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "info":
        return <Info className="w-5 h-5 text-blue-500" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 border backdrop-blur-md shadow-xl animate-in slide-in-from-bottom duration-300 ${getToastStyles(toast.type)} ${toast.type === "chat" ? "min-w-[280px] rounded-xl px-3 py-2.5" : "rounded-full p-2"}`}
        >
          <div className="shrink-0">{getIcon(toast.type)}</div>
          <p className={`flex-1 font-medium leading-relaxed ${toast.type === "chat" ? "text-sm" : "text-xs mt-0.5"}`}>
            {toast.message}
          </p>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 hover:bg-white/10 rounded-lg p-1 transition-colors duration-150"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
