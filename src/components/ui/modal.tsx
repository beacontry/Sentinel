"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, children, className = "" }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }} modal={false}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-fade-in"
          onClick={onClose}
        />
        <Dialog.Content
          onEscapeKeyDown={onClose}
          className={`fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2
            rounded-xl border border-border bg-bg-surface p-6
            shadow-2xl animate-scale-in
            focus:outline-none mx-4 sm:mx-0 max-h-[85vh] overflow-y-auto
            ${className}`}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ModalHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 ${className}`}>
      {children}
    </div>
  );
}

export function ModalTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Title className={`text-lg font-semibold text-text-primary ${className}`}>
      {children}
    </Dialog.Title>
  );
}

export function ModalDescription({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Description className={`text-sm text-text-secondary ${className}`}>
      {children}
    </Dialog.Description>
  );
}

export function ModalFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mt-6 flex items-center justify-end gap-3 ${className}`}>
      {children}
    </div>
  );
}
