/// <reference types="vite/client" />

declare global {
  interface Window {
    electronDesktop?: {
      requestResize?: () => void;
    };
  }
}

export {};
