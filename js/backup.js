'use strict';

/*
 * Pizzaiolo Amici — backup/ripristino: un file JSON con le foto in base64
 * (nessuna dipendenza, decisione di Guido). Espone window.PizzaioloBackup.
 *
 * Formato: { app:'pizzaiolo', versione:1, esportato_il, farine, ricette,
 *            esperimenti, passi, settings, foto:[{..., dati_base64}] }.
 */

(function (global) {
  const db = global.PizzaioloDB;
  const STORE_SEMPLICI = ['farine', 'ricette', 'esperimenti', 'passi', 'settings'];

  function blobABase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result); // già una data URL "data:...;base64,...."
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function base64ABlob(dataUrl) {
    // fetch() su una data: URL non fa nessuna richiesta di rete: il browser la
    // risolve internamente. Scorciatoia pulita per il round-trip, zero dipendenze.
    return fetch(dataUrl).then((r) => r.blob());
  }

  async function esportaBackup() {
    const [farine, ricette, esperimenti, passi, settings, fotoGrezze] = await Promise.all([
      db.getAll('farine'), db.getAll('ricette'), db.getAll('esperimenti'),
      db.getAll('passi'), db.getAll('settings'), db.getAll('foto'),
    ]);
    const foto = await Promise.all(fotoGrezze.map(async (f) => ({
      id: f.id, esperimento_id: f.esperimento_id, tipo: f.tipo, creato_il: f.creato_il,
      dati_base64: await blobABase64(f.blob),
    })));
    return {
      app: 'pizzaiolo', versione: 1, esportato_il: new Date().toISOString(),
      farine, ricette, esperimenti, passi, settings, foto,
    };
  }

  function scaricaBackup(oggetto) {
    const testo = JSON.stringify(oggetto);
    const blob = new Blob([testo], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const data = oggetto.esportato_il.slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pizzaiolo-backup-${data}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function validaFormato(dati) {
    if (!dati || dati.app !== 'pizzaiolo' || typeof dati.versione !== 'number') {
      throw new Error('File non riconosciuto: non è un backup di Pizzaiolo.');
    }
    for (const chiave of [...STORE_SEMPLICI, 'foto']) {
      if (!Array.isArray(dati[chiave])) {
        throw new Error(`File incompleto: manca l'elenco "${chiave}".`);
      }
    }
  }

  /**
   * @param {Object} dati backup già parsato (validaFormato viene chiamata qui)
   * @param {'sostituisci'|'unisci'} modo
   * @returns {Promise<{avvisiOrfani: Object<string,number>}>}
   */
  async function importaBackup(dati, modo) {
    validaFormato(dati);
    const foto = await Promise.all(dati.foto.map(async (f) => ({
      id: f.id, esperimento_id: f.esperimento_id, tipo: f.tipo, creato_il: f.creato_il,
      blob: await base64ABlob(f.dati_base64),
    })));

    await db.transazione([...STORE_SEMPLICI, 'foto'], 'readwrite', (tx) => {
      if (modo === 'sostituisci') {
        [...STORE_SEMPLICI, 'foto'].forEach((s) => tx.objectStore(s).clear());
      }
      STORE_SEMPLICI.forEach((s) => {
        dati[s].forEach((record) => tx.objectStore(s).put(record));
      });
      foto.forEach((record) => tx.objectStore('foto').put(record));
    });

    if (modo === 'sostituisci') {
      return { avvisiOrfani: {} }; // il backup è per costruzione coerente al suo interno
    }
    return { avvisiOrfani: await trovaRiferimentiOrfani() };
  }

  /** Dopo un "unisci": conta (non rimuove) i riferimenti che puntano a righe assenti
   * su questo device — non si rimappano gli id (vedi piano): caso limite, si segnala. */
  async function trovaRiferimentiOrfani() {
    const [farine, ricette, esperimenti] = await Promise.all([
      db.getAll('farine'), db.getAll('ricette'), db.getAll('esperimenti'),
    ]);
    const idFarine = new Set(farine.map((f) => f.id));
    const idRicette = new Set(ricette.map((r) => r.id));
    const idEsperimenti = new Set(esperimenti.map((e) => e.id));

    const [passi, foto] = await Promise.all([db.getAll('passi'), db.getAll('foto')]);

    const conta = (lista, chiave, insieme, includiNull) => lista.filter((r) => {
      const v = r[chiave];
      if (v === null || v === undefined) return false;
      return !insieme.has(v);
    }).length;

    return {
      esperimenti_con_farina_mancante: conta(esperimenti, 'farina_id', idFarine),
      esperimenti_con_ricetta_mancante: conta(esperimenti, 'ricetta_id', idRicette),
      esperimenti_con_riferimento_confronto_mancante: conta(esperimenti, 'rif_esperimento_id', idEsperimenti),
      passi_con_esperimento_mancante: conta(passi, 'esperimento_id', idEsperimenti),
      foto_con_esperimento_mancante: conta(foto, 'esperimento_id', idEsperimenti),
    };
  }

  global.PizzaioloBackup = { esportaBackup, scaricaBackup, importaBackup, validaFormato };
})(typeof window !== 'undefined' ? window : globalThis);
