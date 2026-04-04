import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary'
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
      <div className="bg-white rounded-[32px] p-10 max-w-md w-full shadow-2xl shadow-stone-900/20 border border-stone-100">
        <h3 className="text-2xl font-bold text-stone-900 mb-2">{title}</h3>
        <p className="text-stone-500 mb-8">{message}</p>
        
        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-4 rounded-2xl text-sm font-semibold text-stone-600 hover:bg-stone-50 transition-all"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 text-white px-6 py-4 rounded-2xl text-sm font-semibold transition-all shadow-lg shadow-stone-200 ${
              variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-stone-900 hover:bg-stone-800'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
