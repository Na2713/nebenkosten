// Lokale Speicherung in IndexedDB. Es verlässt nichts das Gerät.
const DB_NAME = 'nebenkosten';
let dbPromise;

function oeffne() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const anfrage = indexedDB.open(DB_NAME, 1);
      anfrage.onupgradeneeded = () => {
        const db = anfrage.result;
        db.createObjectStore('meta');
        db.createObjectStore('jahre', { keyPath: 'id' });
      };
      anfrage.onsuccess = () => resolve(anfrage.result);
      anfrage.onerror = () => reject(anfrage.error);
    });
  }
  return dbPromise;
}

async function vorgang(store, modus, arbeit) {
  const db = await oeffne();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modus);
    const anfrage = arbeit(tx.objectStore(store));
    tx.oncomplete = () => resolve(anfrage?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const leseMeta = (schluessel) => vorgang('meta', 'readonly', (s) => s.get(schluessel));
export const schreibeMeta = (schluessel, wert) => vorgang('meta', 'readwrite', (s) => s.put(wert, schluessel));
export const leseJahre = () => vorgang('jahre', 'readonly', (s) => s.getAll());
export const schreibeJahr = (jahr) => vorgang('jahre', 'readwrite', (s) => s.put(jahr));
export const loescheJahr = (id) => vorgang('jahre', 'readwrite', (s) => s.delete(id));

/** Ersetzt alle Jahre in einem Schritt (Wiederherstellung) */
export async function ersetzeJahre(jahre) {
  await vorgang('jahre', 'readwrite', (s) => {
    s.clear();
    jahre.forEach((j) => s.put(j));
  });
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen */
export async function bitteUmDauerhaftenSpeicher() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* nicht unterstützt */ }
  return false;
}
