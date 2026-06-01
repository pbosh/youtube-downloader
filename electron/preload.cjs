const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronDesktop", {
  requestResize: () => ipcRenderer.invoke("window:resize-to-content"),
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("desktop-app");
});
