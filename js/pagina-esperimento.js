'use strict';

/* Pizzaiolo Amici — dettaglio/modifica di un esperimento (esperimento.php):
 * farina, tappe (sola lettura), foto (upload diretto via assets/app.js già
 * incluso per il resize+anteprima), voti, note, variabile cambiata, confronto,
 * eliminazione. Markup ricalcato da design/esperimento.html. */

(function () {
  const db = window.PizzaioloDB;
  const repo = window.PizzaioloRepo;
  const TIPI_FOTO_ETICHETTA = { sopra: 'Sopra', sotto: 'Sotto', cornicione: 'Cornicione', alveolatura: 'Alveolatura' };
  const CAMPI_VOTO = ['cornicione', 'leopardatura', 'sottopizza', 'estensibilita', 'digeribilita'];
  const TITOLI_TAPPA = {
    impasto: 'Impasto', puntata: 'Fine impastatura e puntata', frigo_dentro: 'In frigo',
    koda: 'Accensione Koda', infornata: 'Infornata',
  };

  let idCorrente = null;

  function idDaUrl() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    return id ? Number(id) : null;
  }
  function titoloTappa(tipo, oreFrigo) {
    if (tipo === 'staglio') return oreFrigo > 0 ? 'Fuori dal frigo e staglio a freddo' : 'Staglio';
    return TITOLI_TAPPA[tipo] || tipo;
  }
  function formattaOra(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    return `${d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' })} `
      + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  function formattaDataEstesa(data) {
    if (!data) return '';
    const d = new Date(`${data}T12:00:00`);
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function risultato(etichetta, valore) {
    const div = document.createElement('div');
    div.className = 'cp-risultato';
    const et = document.createElement('span');
    et.className = 'cp-risultato-etichetta';
    et.textContent = etichetta;
    const val = document.createElement('span');
    val.className = 'cp-risultato-valore';
    val.textContent = valore;
    div.append(et, val);
    return div;
  }

  function renderRiepilogo(esperimento, ricetta, farina) {
    const dataEstesa = formattaDataEstesa(esperimento.data);
    const farinaTesto = farina
      ? `${farina.nome}${farina.w ? ` (W ${farina.w}${farina.proteine != null ? `, ${farina.proteine}% proteine` : ''})` : ''}`
      : 'senza farina indicata';
    document.getElementById('riepilogo-data-farina').innerHTML = `<strong>${dataEstesa}</strong> · ${farinaTesto}`;

    const variabileEl = document.getElementById('riepilogo-variabile');
    if (esperimento.variabile_cambiata || esperimento.rif_esperimento_id) {
      let testo = '';
      if (esperimento.variabile_cambiata) testo += `Variabile cambiata: <strong>${esperimento.variabile_cambiata}</strong>`;
      if (esperimento.rif_esperimento_id) {
        testo += `${testo ? ' · ' : ''}rispetto a <a href="esperimento.html?id=${esperimento.rif_esperimento_id}">#${esperimento.rif_esperimento_id}</a>`;
      }
      variabileEl.innerHTML = testo;
      variabileEl.hidden = false;
    } else {
      variabileEl.hidden = true;
    }

    const blocco1 = document.getElementById('blocco-parametri');
    blocco1.replaceChildren(
      risultato('Panetti', String(ricetta.panetti)),
      risultato('Peso (g)', String(ricetta.peso_panetto)),
      risultato('Temp. (°C)', String(ricetta.temperatura)),
      risultato('Ore totali', String(ricetta.ore_totali)),
      risultato('Ore in frigo', String(ricetta.ore_frigo)),
      risultato('Idratazione', `${ricetta.idratazione}%`),
    );

    const etichettaLievito = ricetta.tipo_lievito === 'secco' ? 'Lievito di birra secco' : 'Lievito di birra fresco';
    const gLievito = ricetta.tipo_lievito === 'secco'
      ? pesoLievitoTipo(ricetta.lievito_g, 'secco') : ricetta.lievito_g;
    const lievitoMostrato = gLievito.toFixed(2).replace('.', ',');
    const blocco2 = document.getElementById('blocco-risultati');
    blocco2.replaceChildren(
      risultato('Farina', `${ricetta.farina_g} g`),
      risultato('Acqua', `${ricetta.acqua_g} g`),
      risultato('Sale', `${ricetta.sale_g} g`),
      risultato(etichettaLievito, `${lievitoMostrato} g`),
      risultato('W consigliata', String(ricetta.w)),
    );

    const cottura = document.getElementById('riepilogo-cottura');
    if (esperimento.pietra_finale_c != null && esperimento.cottura_secondi != null) {
      cottura.textContent = `Cottura: pietra ${esperimento.pietra_finale_c} °C, ${esperimento.cottura_secondi} secondi.`;
      cottura.hidden = false;
    } else {
      cottura.hidden = true;
    }
  }

  function renderTappe(passi, oreFrigo) {
    const corpo = document.getElementById('corpo-tappe');
    corpo.replaceChildren();
    passi.forEach((p) => {
      const tr = document.createElement('tr');
      const tdTappa = document.createElement('td');
      tdTappa.textContent = titoloTappa(p.tipo, oreFrigo);
      const tdPrevisto = document.createElement('td');
      tdPrevisto.dataset.etichetta = 'Previsto';
      tdPrevisto.textContent = formattaOra(p.previsto_il);
      const tdReale = document.createElement('td');
      tdReale.dataset.etichetta = 'Reale';
      tdReale.textContent = p.fatto_il ? formattaOra(p.fatto_il) : '–';
      const tdTemp = document.createElement('td');
      tdTemp.dataset.etichetta = 'Temp.';
      tdTemp.textContent = p.temperatura != null ? `${p.temperatura} °C` : '–';
      tr.append(tdTappa, tdPrevisto, tdReale, tdTemp);
      corpo.appendChild(tr);
    });
  }

  function renderFotoGriglia(foto) {
    const griglia = document.getElementById('griglia-foto');
    griglia.replaceChildren();
    foto.forEach((f) => {
      const fig = document.createElement('figure');
      fig.className = 'cp-foto';
      const url = URL.createObjectURL(f.blob);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      const img = document.createElement('img');
      img.src = url;
      img.alt = TIPI_FOTO_ETICHETTA[f.tipo] || f.tipo;
      img.loading = 'lazy';
      a.appendChild(img);
      const cap = document.createElement('figcaption');
      cap.textContent = TIPI_FOTO_ETICHETTA[f.tipo] || f.tipo;
      const bElimina = document.createElement('button');
      bElimina.type = 'button';
      bElimina.className = 'cp-btn cp-btn-pericolo cp-btn-piccolo';
      bElimina.textContent = 'Elimina';
      bElimina.addEventListener('click', async () => {
        if (!window.confirm('Eliminare questa foto?')) return;
        await db.elimina('foto', f.id);
        await ricarica();
      });
      fig.append(a, cap, bElimina);
      griglia.appendChild(fig);
    });
  }

  async function popolaSelectFarine(selezionata) {
    const select = document.getElementById('e-farina');
    select.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove());
    const farine = (await db.getAll('farine')).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    farine.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = String(f.id);
      opt.textContent = f.nome;
      if (selezionata === f.id) opt.selected = true;
      select.appendChild(opt);
    });
  }

  async function popolaSelectRiferimento(id, selezionato) {
    const select = document.getElementById('e-riferimento');
    select.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove());
    const [tutti, farine] = await Promise.all([db.getAll('esperimenti'), db.getAll('farine')]);
    const nomeFarina = new Map(farine.map((f) => [f.id, f.nome]));
    tutti.filter((e) => e.id !== id).sort((a, b) => (b.data || '').localeCompare(a.data || '')).forEach((e) => {
      const opt = document.createElement('option');
      opt.value = String(e.id);
      opt.textContent = `#${e.id} · ${e.data}${e.farina_id ? ` · ${nomeFarina.get(e.farina_id) || ''}` : ''}`;
      if (selezionato === e.id) opt.selected = true;
      select.appendChild(opt);
    });
  }

  async function renderListaConfronta(esperimento) {
    const lista = document.getElementById('lista-confronta');
    lista.replaceChildren();
    const [tutti, farine] = await Promise.all([db.getAll('esperimenti'), db.getAll('farine')]);
    const nomeFarina = new Map(farine.map((f) => [f.id, f.nome]));
    tutti.filter((e) => e.id !== esperimento.id)
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      .forEach((e) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'cp-lista-voce';
        a.href = `confronta.html?a=${esperimento.id}&b=${e.id}`;
        const forte = document.createElement('strong');
        forte.textContent = `#${e.id} · ${e.data}`;
        const piccolo = document.createElement('small');
        let testo = e.farina_id ? (nomeFarina.get(e.farina_id) || '') : 'senza farina';
        if (e.id === esperimento.rif_esperimento_id) testo += ' · riferimento';
        piccolo.textContent = testo;
        a.append(forte, piccolo);
        li.appendChild(a);
        lista.appendChild(li);
      });
  }

  function popolaVoti(esperimento) {
    CAMPI_VOTO.forEach((campo) => {
      document.querySelectorAll(`input[name="voto_${campo}"]`).forEach((r) => { r.checked = false; });
      const valore = esperimento[`voto_${campo}`];
      if (valore == null) return;
      const radio = document.querySelector(`input[name="voto_${campo}"][value="${valore}"]`);
      if (radio) radio.checked = true;
    });
  }

  async function render() {
    const dettaglio = await repo.dettaglioEsperimento(idCorrente);
    if (!dettaglio) {
      document.getElementById('contenuto').hidden = true;
      return;
    }
    const { esperimento, ricetta, farina, passi, foto } = dettaglio;
    document.getElementById('contenuto').hidden = false;
    document.getElementById('titolo-esperimento').textContent = `Esperimento #${esperimento.id}`;
    document.title = `Esperimento #${esperimento.id} — Pizzaiolo Amici`;

    renderRiepilogo(esperimento, ricetta, farina);
    renderTappe(passi, ricetta.ore_frigo);
    renderFotoGriglia(foto);
    await popolaSelectFarine(esperimento.farina_id);
    await popolaSelectRiferimento(esperimento.id, esperimento.rif_esperimento_id);
    await renderListaConfronta(esperimento);
    popolaVoti(esperimento);

    document.getElementById('e-variabile').value = esperimento.variabile_cambiata || '';
    document.getElementById('e-note').value = esperimento.note || '';
  }

  async function ricarica() {
    await render();
  }

  document.getElementById('e-farina').addEventListener('change', async (ev) => {
    const esperimento = await db.get('esperimenti', idCorrente);
    esperimento.farina_id = ev.target.value ? Number(ev.target.value) : null;
    await db.put('esperimenti', esperimento);
    await ricarica();
  });

  document.getElementById('form-esperimento').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const esperimento = await db.get('esperimenti', idCorrente);
    CAMPI_VOTO.forEach((campo) => {
      const el = document.querySelector(`input[name="voto_${campo}"]:checked`);
      esperimento[`voto_${campo}`] = el ? Number(el.value) : null;
    });
    esperimento.variabile_cambiata = document.getElementById('e-variabile').value.trim() || null;
    const rif = document.getElementById('e-riferimento').value;
    esperimento.rif_esperimento_id = rif ? Number(rif) : null;
    esperimento.note = document.getElementById('e-note').value.trim() || null;
    await db.put('esperimenti', esperimento);

    const msg = document.getElementById('msg-esperimento');
    msg.textContent = 'Voti e note salvati.';
    msg.hidden = false;
    msg.classList.add('is-ok');
    msg.classList.remove('is-errore');
    await ricarica();
  });

  // Registrati dentro DOMContentLoaded, DOPO i listener di assets/app.js (il suo script è
  // elencato prima nell'head): sullo stesso evento i listener girano nell'ordine in cui
  // sono stati collegati, quindi qui: (a) il file è già ridimensionato da app.js quando lo
  // leggo; (b) ev.defaultPrevented riflette la scelta dell'utente nel dialog di conferma.
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('e-foto-file').addEventListener('change', async (ev) => {
      const input = ev.target;
      const file = input.files && input.files[0];
      if (!file) return;
      const tipo = document.getElementById('e-foto-tipo').value;
      await db.put('foto', { esperimento_id: idCorrente, tipo, blob: file, creato_il: new Date().toISOString() });
      input.value = '';
      const anteprima = input.closest('.cp-foto-carica').querySelector('img.cp-foto-anteprima');
      if (anteprima) anteprima.remove();
      await ricarica();
    });

    document.getElementById('form-elimina').addEventListener('submit', async (ev) => {
      const annullato = ev.defaultPrevented; // true se l'utente ha annullato la conferma di assets/app.js
      ev.preventDefault(); // in ogni caso: nessun vero submit, non c'è backend
      if (annullato) return;
      await db.eliminaEsperimento(idCorrente);
      window.location.href = 'diario.html';
    });
  });

  document.addEventListener('DOMContentLoaded', async () => {
    idCorrente = idDaUrl();
    if (!idCorrente) {
      document.getElementById('contenuto').hidden = true;
      return;
    }
    await render();
  });
})();
