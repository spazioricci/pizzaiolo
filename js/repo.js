'use strict';

/*
 * Pizzaiolo Amici — composizioni "senza JOIN" sopra js/db.js: qui vive
 * l'arricchimento dati che nel mondo SQL era un JOIN/subquery (SPEC vari §),
 * così ogni pagina non lo reinventa a modo suo. Espone window.PizzaioloRepo.
 */

(function (global) {
  const db = global.PizzaioloDB;

  // Stesso ordine di calcolo.js/risincronizza() (SPEC §8.1): i passi si mostrano
  // sempre in quest'ordine logico, MAI per previsto_il — una tappa segnata "fatta"
  // con un orario reale molto diverso dal previsto (o un previsto già risincronizzato)
  // può altrimenti scavalcare le altre nell'ordinamento e confondere la lista.
  const ORDINE_TAPPE = ['impasto', 'puntata', 'frigo_dentro', 'staglio', 'koda', 'infornata'];
  function ordinaPerTappa(passi) {
    const ordine = Object.fromEntries(ORDINE_TAPPE.map((t, i) => [t, i]));
    return [...passi].sort((a, b) => (ordine[a.tipo] ?? 99) - (ordine[b.tipo] ?? 99));
  }

  /** Diario (diario.php): esperimenti con nome farina e foto di copertina, più
   * recenti prima; filtro opzionale per farina. */
  async function elencoDiario(filtroFarinaId) {
    const esperimenti = filtroFarinaId
      ? await db.getAllByIndice('esperimenti', 'farina_id', Number(filtroFarinaId))
      : await db.getAll('esperimenti');
    esperimenti.sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.id - a.id);

    const farine = await db.getAll('farine');
    const nomeFarina = new Map(farine.map((f) => [f.id, f.nome]));

    for (const e of esperimenti) {
      e.farina_nome = e.farina_id ? (nomeFarina.get(e.farina_id) || null) : null;
      const foto = await db.getAllByIndice('foto', 'esperimento_id', e.id);
      e.foto_copertina = foto.find((f) => f.tipo === 'sopra') || foto[0] || null;
    }
    return esperimenti;
  }

  /** Dettaglio (esperimento.php/confronta.php/sessione.php): esperimento + ricetta
   * + farina + passi (ordinati) + foto, in un colpo solo. */
  async function dettaglioEsperimento(id) {
    const esperimento = await db.get('esperimenti', id);
    if (!esperimento) return null;
    const [ricetta, farina, passi, foto] = await Promise.all([
      db.get('ricette', esperimento.ricetta_id),
      esperimento.farina_id ? db.get('farine', esperimento.farina_id) : Promise.resolve(null),
      db.getAllByIndice('passi', 'esperimento_id', id),
      db.getAllByIndice('foto', 'esperimento_id', id),
    ]);
    return { esperimento, ricetta, farina, passi: ordinaPerTappa(passi), foto };
  }

  /** "Salva ricetta": solo la ricetta, nessun esperimento/diario associato. */
  function creaRicetta(ricetta) {
    return db.transazione('ricette', 'readwrite', (tx, ctx) => {
      tx.objectStore('ricette').put(ricetta).onsuccess = (ev) => { ctx.risultato = ev.target.result; };
    });
  }

  /** "Avvia la sessione": ricetta + esperimento (farina da scegliere più avanti,
   * come nell'app originale) + passi dalla pianificazione, in un'unica transazione.
   * @param {Object} ricetta campi di ricette (senza id)
   * @param {Array<{tipo:string, quando:Date}>} tappePianificate da pianifica()
   * @returns {Promise<number>} id dell'esperimento creato
   */
  function avviaSessione(ricetta, tappePianificate) {
    return db.transazione(['ricette', 'esperimenti', 'passi'], 'readwrite', (tx, ctx) => {
      const ricetteOs = tx.objectStore('ricette');
      const esperimentiOs = tx.objectStore('esperimenti');
      const passiOs = tx.objectStore('passi');

      ricetteOs.put(ricetta).onsuccess = (ev) => {
        const idRicetta = ev.target.result;
        const oggi = new Date().toISOString().slice(0, 10);
        esperimentiOs.put({ ricetta_id: idRicetta, farina_id: null, data: oggi }).onsuccess = (ev2) => {
          const idEsperimento = ev2.target.result;
          tappePianificate.forEach((t) => {
            passiOs.put({
              esperimento_id: idEsperimento,
              tipo: t.tipo,
              previsto_il: t.quando.toISOString(),
              fatto_il: null,
              temperatura: null,
            });
          });
          ctx.risultato = idEsperimento;
        };
      };
    });
  }

  /** Segna una tappa come fatta (ora e temperatura reali) e risincronizza le
   * tappe successive non ancora fatte (SPEC §8.2), in un'unica transazione. */
  function segnaTappaFatta(esperimentoId, passoId, fattoIl, temperatura) {
    return db.transazione('passi', 'readwrite', (tx, ctx) => {
      const os = tx.objectStore('passi');
      os.get(passoId).onsuccess = (ev) => {
        const passo = ev.target.result;
        if (!passo) return;
        passo.fatto_il = fattoIl;
        passo.temperatura = temperatura;
        os.put(passo);

        os.index('esperimento_id').getAll(esperimentoId).onsuccess = (ev2) => {
          const tutti = ev2.target.result.map((p) => (p.id === passoId ? passo : p));
          const aggiornamenti = global.risincronizza(tutti.map((p) => ({
            id: p.id, tipo: p.tipo, previsto_il: p.previsto_il, fatto_il: p.fatto_il,
          })));
          Object.entries(aggiornamenti).forEach(([id, nuovaData]) => {
            const p = tutti.find((x) => x.id === Number(id));
            if (p) {
              p.previsto_il = nuovaData.toISOString();
              os.put(p);
            }
          });
          ctx.risultato = aggiornamenti;
        };
      };
    });
  }

  global.PizzaioloRepo = {
    elencoDiario, dettaglioEsperimento, creaRicetta, avviaSessione, segnaTappaFatta,
  };
})(typeof window !== 'undefined' ? window : globalThis);
