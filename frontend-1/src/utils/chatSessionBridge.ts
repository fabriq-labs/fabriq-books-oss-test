/** Synchronous chat reset for auth flows (logout/login) before route unmount. */
type ChatResetFn = () => void;

let resetChatFn: ChatResetFn | null = null;

export function registerChatReset(fn: ChatResetFn): () => void {
  resetChatFn = fn;
  return () => {
    if (resetChatFn === fn) {
      resetChatFn = null;
    }
  };
}

export function triggerChatReset(): void {
  resetChatFn?.();
}
