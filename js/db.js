'use strict';

/*
 * Pizzaiolo Amici — livello dati IndexedDB nativa, nessuna libreria.
 * Espone window.PizzaioloDB con un wrapper Promise-based minimo attorno alle
 * API IndexedDB e le cancellazioni a cascata (che nel SQL originale erano FK
 * ON DELETE CASCADE/SET NULL, qui riprodotte a mano in un'unica transazione).
 *
 * Insidia da tenere presente ovunque in questo file: una IDBTransaction si
 * autochiude appena l'event loop torna libero senza richieste pendenti su di
 * essa. Per questo ogni operazione multi-step qui sotto issue tutte le sue
 * richieste in modo sincrono dentro gli handler onsuccess (mai un `await` di
 * una Promise esterna nel mezzo), lasciando che sia la transazione stessa,
 * via tx.oncomplete, a segnalare quando il lavoro è davvero salvato.
 */

(function (global) {
  const DB_NOME = 'pizzaiolo';
  const DB_VERSIONE = 1;

  let dbPromise = null;

  function migraSchema(db, vecchiaVersione) {
    if (vecchiaVersione < 1) {
      db.createObjectStore('farine', { keyPath: 'id', autoIncrement: true })
        .createIndex('nome', 'nome');
      db.createObjectStore('ricette', { keyPath: 'id', autoIncrement: true });

      const esperimenti = db.createObjectStore('esperimenti', { keyPath: 'id', autoIncrement: true });
      esperimenti.createIndex('farina_id', 'farina_id');
      esperimenti.createIndex('ricetta_id', 'ricetta_id');
      esperimenti.createIndex('data', 'data');
      esperimenti.createIndex('rif_esperimento_id', 'rif_esperimento_id');

      db.createObjectStore('passi', { keyPath: 'id', autoIncrement: true })
        .createIndex('esperimento_id', 'esperimento_id');
      db.createObjectStore('foto', { keyPath: 'id', autoIncrement: true })
        .createIndex('esperimento_id', 'esperimento_id');

      db.createObjectStore('settings', { keyPath: 'chiave' });
    }
    // Migrazioni future: if (vecchiaVersione < 2) { ... } senza toccare il ramo precedente.
  }

  function apriDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const richiesta = global.indexedDB.open(DB_NOME, DB_VERSIONE);
      richiesta.onupgradeneeded = (ev) => migraSchema(richiesta.result, ev.oldVersion);
      richiesta.onsuccess = () => {
        const db = richiesta.result;
        // Un'altra scheda che apre una versione più recente ci chiede di chiudere:
        // senza questo, quella scheda resterebbe bloccata su onblocked all'infinito.
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      richiesta.onerror = () => reject(richiesta.error);
      richiesta.onblocked = () => {
        console.warn('Pizzaiolo: apertura del database bloccata da un\'altra scheda aperta.');
      };
    });
    return dbPromise;
  }

  function richiestaComePromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** Una singola transazione, con `azione(tx, contesto)` sincrona: scrivere in
   * `contesto.risultato` per restituire un valore, `contesto.errore` prima di
   * un `tx.abort()` per un rifiuto con un messaggio leggibile (vedi eliminaFarina). */
  function transazione(stores, modo, azione) {
    return apriDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(stores, modo);
      const contesto = {};
      tx.oncomplete = () => resolve(contesto.risultato);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(contesto.errore || tx.error || new Error('Transazione annullata'));
      try {
        azione(tx, contesto);
      } catch (errore) {
        contesto.errore = errore;
        try { tx.abort(); } catch (_) { /* già annullata */ }
      }
    }));
  }

  /* ---------- letture (una singola richiesta, nessuna insidia di durata) ---------- */

  async function get(store, id) {
    const db = await apriDb();
    return richiestaComePromise(db.transaction(store, 'readonly').objectStore(store).get(id));
  }

  async function getAll(store) {
    const db = await apriDb();
    return richiestaComePromise(db.transaction(store, 'readonly').objectStore(store).getAll());
  }

  async function getAllByIndice(store, indice, valore) {
    const db = await apriDb();
    return richiestaComePromise(
      db.transaction(store, 'readonly').objectStore(store).index(indice).getAll(valore)
    );
  }

  async function conta(store, indice, valore) {
    const db = await apriDb();
    const os = db.transaction(store, 'readonly').objectStore(store);
    const sorgente = indice ? os.index(indice) : os;
    return richiestaComePromise(sorgente.count(valore));
  }

  /* ---------- scritture (via transazione(), per avere sempre tx.oncomplete) ---------- */

  function put(store, oggetto) {
    return transazione(store, 'readwrite', (tx, ctx) => {
      tx.objectStore(store).put(oggetto).onsuccess = (ev) => { ctx.risultato = ev.target.result; };
    });
  }

  function elimina(store, id) {
    return transazione(store, 'readwrite', (tx) => {
      tx.objectStore(store).delete(id);
    });
  }

  /* ---------- cascate (SPEC §7.4 / regola "farina in uso" di farine.php) ---------- */

  /** Rifiuta se la farina è usata da almeno un esperimento (stessa regola di farine.php). */
  function eliminaFarina(id) {
    return transazione(['farine', 'esperimenti'], 'readwrite', (tx, ctx) => {
      tx.objectStore('esperimenti').index('farina_id').count(id).onsuccess = (ev) => {
        if (ev.target.result > 0) {
          ctx.errore = new Error('Farina in uso da uno o più esperimenti: non può essere eliminata.');
          tx.abort();
          return;
        }
        tx.objectStore('farine').delete(id);
      };
    });
  }

  /** Cancella l'esperimento, i suoi passi e foto, azzera i riferimenti di chi lo cita
   * come confronto (rif_esperimento_id), e cancella la ricetta se non è condivisa con
   * altri esperimenti — comportamento identico a quello già in uso in diario.php/
   * esperimento.php (SPEC §7.4). */
  function eliminaEsperimento(id) {
    return transazione(['esperimenti', 'ricette', 'passi', 'foto'], 'readwrite', (tx) => {
      const esperimenti = tx.objectStore('esperimenti');
      const ricette = tx.objectStore('ricette');
      const passi = tx.objectStore('passi');
      const foto = tx.objectStore('foto');

      esperimenti.get(id).onsuccess = (ev) => {
        const esperimento = ev.target.result;
        if (!esperimento) return; // già assente: niente da fare, ma la transazione resta valida

        passi.index('esperimento_id').getAllKeys(id).onsuccess = (ev2) => {
          ev2.target.result.forEach((chiave) => passi.delete(chiave));
        };
        foto.index('esperimento_id').getAllKeys(id).onsuccess = (ev2) => {
          ev2.target.result.forEach((chiave) => foto.delete(chiave));
        };
        esperimenti.index('rif_esperimento_id').getAll(id).onsuccess = (ev2) => {
          ev2.target.result.forEach((rif) => {
            rif.rif_esperimento_id = null;
            esperimenti.put(rif);
          });
        };
        esperimenti.index('ricetta_id').count(esperimento.ricetta_id).onsuccess = (ev2) => {
          // Se questo era l'unico esperimento a citarla, la ricetta non ha più senso da sola.
          if (ev2.target.result <= 1) ricette.delete(esperimento.ricetta_id);
        };
        esperimenti.delete(id);
      };
    });
  }

  global.PizzaioloDB = {
    apriDb, get, getAll, getAllByIndice, conta, put, elimina, transazione,
    eliminaFarina, eliminaEsperimento,
  };
})(typeof window !== 'undefined' ? window : globalThis);
