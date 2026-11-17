(() => {
  const DB_NAME = "nexus-offline-v1";
  const STORE = "responses";
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function transact(mode, operation) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    });
  }
  window.NexusOffline = {
    get: key => transact("readonly", store => store.get(key)),
    put: (key, value) => transact("readwrite", store => store.put(value, key))
  };
  function updateStatus() {
    const el = document.getElementById("offlineStatus");
    if (!el) return;
    const online = navigator.onLine;
    el.textContent = online ? "ONLINE · Sync available" : "OFFLINE · Saved data only";
    el.style.color = online ? "#087b57" : "#a45b12";
    el.setAttribute("aria-label", el.textContent);
  }
  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  document.addEventListener("DOMContentLoaded", updateStatus);
  updateStatus();
})();