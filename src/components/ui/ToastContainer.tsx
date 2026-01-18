"use client";

import { useToast } from "@/hooks/useToast";
import { X, CheckCircle, XCircle, Info, AlertTriangle } from "lucide-react";

export function ToastContainer() {
  const toasts = useToast((s) => s.toasts);
  const removeToast = useToast((s) => s.removeToast);

  const getToastStyles = (type: string) => {
    switch (type) {
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
          className={`flex items-start gap-3 p-2 rounded-full border backdrop-blur-sm shadow-xl animate-in slide-in-from-bottom duration-300 ${getToastStyles(toast.type)}`}
        >
          <div className="flex-shrink-0 mt-0.5">{getIcon(toast.type)}</div>
          <p className="flex-1 text-xs font-medium leading-relaxed mt-0.5">
            {toast.message}
          </p>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 hover:bg-white/10 rounded-lg p-1 transition-colors duration-150"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
