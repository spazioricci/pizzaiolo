'use strict';

/* Pizzaiolo Amici — logica di pagina di index.html: salva ricetta / avvia sessione
 * in IndexedDB. calcolo.js resta invariato (calcolo puro + validazione + timeline
 * dal vivo); qui si aggiunge solo la persistenza, come Impasto.php/Pianificatore.php
 * non toccano mai il database nell'app originale (ci pensano le pagine). */

(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-impasto');
    if (!form) return;

    const db = window.PizzaioloDB;
    const repo = window.PizzaioloRepo;
    const msg = document.getElementById('msg-impasto');

    function leggiCampo(nome, fallback) {
      const el = document.querySelector(`.cp-input[name="${nome}"]`);
      if (!el) return fallback !== undefined ? fallback : NaN;
      const v = String(el.value).trim().replace(',', '.');
      return v === '' ? (fallback !== undefined ? fallback : NaN) : parseFloat(v);
    }
    function leggiScelta(nome, fallback) {
      const el = document.querySelector(`input[name="${nome}"]:checked`);
      return el ? el.value : fallback;
    }
    function mostraMessaggio(testo, ok) {
      if (!msg) return;
      msg.textContent = testo;
      msg.hidden = false;
      msg.classList.toggle('is-ok', ok !== false);
      msg.classList.toggle('is-errore', ok === false);
    }

    function costruisciRicetta(input, r, infornataVal) {
      return {
        panetti: input.n, peso_panetto: input.peso, temperatura: input.temp,
        ore_totali: input.ore, ore_frigo: input.frigo, idratazione: input.H,
        tipo_lievito: r.tipoLievito, sale_per_litro: 50,
        farina_g: r.farina, acqua_g: r.acqua, sale_g: r.sale, lievito_g: r.lievito, w: r.w,
        infornata_prevista: infornataVal ? infornataVal.toISOString() : null,
        creata_il: new Date().toISOString(),
      };
    }

    async function salvaDefault(ricetta, puntataMin, kodaPreriscaldoMin) {
      await Promise.all([
        db.put('settings', { chiave: 'idratazione', valore: String(ricetta.idratazione) }),
        db.put('settings', { chiave: 'tipo_lievito', valore: ricetta.tipo_lievito }),
        db.put('settings', { chiave: 'puntata_min', valore: String(puntataMin) }),
        db.put('settings', { chiave: 'koda_preriscaldo_min', valore: String(kodaPreriscaldoMin) }),
      ]);
    }

    /** Precompila idratazione/tipo lievito/tempi con gli ultimi valori usati (SPEC §7
     * punto 2): sovrascrive i default fissi nell'HTML, poi forza un ricalcolo. */
    async function caricaDefault() {
      const [idratazione, tipoLievito, puntataMin, kodaMin] = await Promise.all(
        ['idratazione', 'tipo_lievito', 'puntata_min', 'koda_preriscaldo_min'].map((k) => db.get('settings', k))
      );
      if (idratazione) {
        const el = document.querySelector('.cp-input[name="idratazione"]');
        if (el) el.value = idratazione.valore;
      }
      if (puntataMin) {
        const el = document.querySelector('.cp-input[name="puntata_min"]');
        if (el) el.value = puntataMin.valore;
      }
      if (kodaMin) {
        const el = document.querySelector('.cp-input[name="koda_preriscaldo_min"]');
        if (el) el.value = kodaMin.valore;
      }
      if (tipoLievito) {
        const radio = document.getElementById(tipoLievito.valore === 'secco' ? 'c-lievito-secco' : 'c-lievito-fresco');
        if (radio) radio.checked = true;
      }
      // Un solo evento per far ripartire calcolo.js (ascolta 'input' sui .cp-input e
      // 'change' sui radio di .cp-scelta): un input qualunque del form basta.
      document.querySelector('.cp-input[name="panetti"]').dispatchEvent(new Event('input', { bubbles: true }));
    }

    form.addEventListener('submit', async (ev) => {
      const azione = ev.submitter ? ev.submitter.value : '';
      if (!azione) return; // invio non da uno dei due bottoni (es. Invio da tastiera)

      const input = {
        n: leggiCampo('panetti'), peso: leggiCampo('peso'), temp: leggiCampo('temp'),
        ore: leggiCampo('ore'), frigo: leggiCampo('frigo'), H: leggiCampo('idratazione'),
        tipoLievito: leggiScelta('tipo_lievito', 'fresco'),
      };
      const r = calcolaImpasto(input);
      // Dati non validi o infornata mancante: calcolo.js (invariato) mostra già
      // l'alert corrispondente nel suo listener 'submit' separato; qui ci si ferma.
      if (!r.valido) return;

      const infornataEl = document.querySelector('[data-infornata]');
      const infornataVal = infornataEl && infornataEl.value ? new Date(infornataEl.value) : null;
      const ricetta = costruisciRicetta(input, r, infornataVal);
      const puntataMin = leggiCampo('puntata_min', 0);
      const kodaPreriscaldoMin = leggiCampo('koda_preriscaldo_min', 30);

      if (azione === 'salva_ricetta') {
        await repo.creaRicetta(ricetta);
        await salvaDefault(ricetta, puntataMin, kodaPreriscaldoMin);
        mostraMessaggio('Ricetta salvata.', true);
        return;
      }

      if (azione === 'avvia_sessione') {
        if (!infornataVal || Number.isNaN(infornataVal.getTime())) return; // alert già mostrato da calcolo.js
        const { tappe, errore } = pianifica({
          ore: input.ore, frigo: input.frigo, infornata: infornataVal,
          puntataMin, kodaPreriscaldoMin,
        });
        if (errore) { mostraMessaggio(errore, false); return; }
        await salvaDefault(ricetta, puntataMin, kodaPreriscaldoMin);
        const idEsperimento = await repo.avviaSessione(ricetta, tappe);
        window.location.href = `sessione.html?id=${idEsperimento}`;
      }
    });

    caricaDefault();
  });
})();
