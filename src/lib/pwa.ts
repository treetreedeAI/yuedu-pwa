import { registerSW } from 'virtual:pwa-register';

export function registerPwa() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  registerSW({
    immediate: true,
    onRegisterError(error) {
      console.error('粵讀離線服務註冊失敗。', error);
    }
  });
}
