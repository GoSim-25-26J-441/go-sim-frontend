"use client";

interface LoaderModalProps {
  isOpen: boolean;
  message?: string;
}

export default function LoaderModal({ isOpen, message = "Loading..." }: LoaderModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 shadow-xl max-w-sm w-full mx-4">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="text-gray-300 text-sm">{message}</p>
        </div>
      </div>
    </div>
  );
}
