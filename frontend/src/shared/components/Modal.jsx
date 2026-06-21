import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function Modal({ isOpen, onClose, children, title, size = 'md' }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Handle clicking backdrop to close (light-dismiss fallback)
  const handleBackdropClick = (event) => {
    const dialog = dialogRef.current;
    if (event.target === dialog) {
      onClose();
    }
  };

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={onClose}
      className={`bg-brand-plum border border-white/10 rounded-3xl p-6 w-full ${sizeClasses[size]} shadow-2xl focus:outline-none backdrop:bg-black/60 backdrop:backdrop-blur-sm animate-fade-in m-auto`}
    >
      <div className="space-y-4">
        {title && (
          <div className="flex justify-between items-center pb-3 border-b border-white/5">
            <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1 rounded-full hover:bg-white/5"
              aria-label="Close modal"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
        <div className="text-slate-300 text-sm">{children}</div>
      </div>
    </dialog>
  );
}
export default Modal;
