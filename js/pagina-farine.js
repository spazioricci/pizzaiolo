'use strict';

/* Pizzaiolo Amici — CRUD farine (farine.php), con precompilazione dal catalogo
 * Caputo/Garofalo (data/farine-catalogo.json, statico, SPEC §7 punto 3). */

(function () {
  const db = window.PizzaioloDB;
  let catalogo = [];

  function mostraMessaggio(testo, ok) {
    const el = document.getElementById('msg-farina');
    el.textContent = testo;
    el.hidden = false;
    el.classList.toggle('is-ok', ok !== false);
    el.classList.toggle('is-errore', ok === false);
  }

  async function caricaCatalogo() {
    try {
      const res = await fetch('data/farine-catalogo.json');
      if (!res.ok) return;
      const dati = await res.json();
      catalogo = dati.farine || [];
      const select = document.getElementById('f-catalogo');
      catalogo.forEach((f, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${f.marca} — ${f.nome}`;
        select.appendChild(opt);
      });
    } catch (_) {
      // catalogo assente/non leggibile: il form resta compilabile a mano.
    }
  }

  function precompilaDaCatalogo(indice) {
    const f = catalogo[indice];
    if (!f) return;
    document.getElementById('f-nome').value = f.nome || '';
    document.getElementById('f-marca').value = f.marca || '';
    document.getElementById('f-w').value = f.w != null ? String(f.w) : (f.w_testo || '');
    document.getElementById('f-proteine').value = f.proteine != null ? String(f.proteine) : '';
    let note = f.note || '';
    if (f.proteine == null && f.proteine_testo) note = `Proteine ${f.proteine_testo}. ${note}`;
    if (f.tipo) note = `Tipo ${f.tipo}. ${note}`;
    document.getElementById('f-note').value = note.trim();
    document.getElementById('f-fonte').value = f.fonte || '';
  }

  function svuotaForm() {
    document.getElementById('f-id').value = '';
    document.getElementById('form-farina').reset();
    document.getElementById('f-catalogo').value = '';
    document.getElementById('titolo-form').textContent = 'Aggiungi farina';
    const bAnnulla = document.getElementById('b-annulla');
    bAnnulla.hidden = true;
    bAnnulla.style.display = 'none'; // .cp-btn forza display:inline-flex, l'attributo hidden da solo non basta
  }

  function popolaFormPerModifica(farina) {
    document.getElementById('f-id').value = farina.id;
    document.getElementById('f-nome').value = farina.nome || '';
    document.getElementById('f-marca').value = farina.marca || '';
    document.getElementById('f-w').value = farina.w || '';
    document.getElementById('f-proteine').value = farina.proteine != null ? farina.proteine : '';
    document.getElementById('f-note').value = farina.note || '';
    document.getElementById('f-fonte').value = farina.fonte || '';
    document.getElementById('titolo-form').textContent = `Modifica «${farina.nome}»`;
    const bAnnulla = document.getElementById('b-annulla');
    bAnnulla.hidden = false;
    bAnnulla.style.display = '';
    document.getElementById('f-nome').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function renderTabella() {
    const farine = (await db.getAll('farine')).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    const corpo = document.querySelector('#tabella-farine tbody');
    corpo.replaceChildren();
    document.getElementById('nessuna-farina').hidden = farine.length > 0;

    farine.forEach((f) => {
      const tr = document.createElement('tr');

      const tdNome = document.createElement('td');
      tdNome.textContent = f.nome;
      const tdMarca = document.createElement('td');
      tdMarca.textContent = f.marca || '';
      const tdW = document.createElement('td');
      tdW.textContent = f.w || '';
      const tdProteine = document.createElement('td');
      tdProteine.textContent = f.proteine != null ? f.proteine : '';
      const tdFonte = document.createElement('td');
      if (f.fonte) {
        const a = document.createElement('a');
        a.href = f.fonte;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'scheda';
        tdFonte.appendChild(a);
      }

      const tdAzioni = document.createElement('td');
      tdAzioni.className = 'text-nowrap';
      const bModifica = document.createElement('button');
      bModifica.type = 'button';
      bModifica.className = 'cp-btn cp-btn-secondario';
      bModifica.textContent = 'Modifica';
      bModifica.addEventListener('click', () => popolaFormPerModifica(f));
      const bElimina = document.createElement('button');
      bElimina.type = 'button';
      bElimina.className = 'cp-btn cp-btn-secondario';
      bElimina.dataset.conferma = `Eliminare la farina «${f.nome}»?`;
      bElimina.textContent = 'Elimina';
      bElimina.addEventListener('click', async () => {
        if (!window.confirm(bElimina.dataset.conferma)) return;
        try {
          await db.eliminaFarina(f.id);
          await renderTabella();
        } catch (errore) {
          mostraMessaggio(errore.message, false);
        }
      });
      tdAzioni.append(bModifica, ' ', bElimina);

      tr.append(tdNome, tdMarca, tdW, tdProteine, tdFonte, tdAzioni);
      corpo.appendChild(tr);
    });
  }

  document.getElementById('f-catalogo').addEventListener('change', (ev) => {
    if (ev.target.value !== '') precompilaDaCatalogo(Number(ev.target.value));
  });

  document.getElementById('b-annulla').addEventListener('click', svuotaForm);

  document.getElementById('form-farina').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nome = document.getElementById('f-nome').value.trim();
    if (!nome) return;
    const idTesto = document.getElementById('f-id').value;
    const proteineTesto = document.getElementById('f-proteine').value;

    const farina = {
      nome,
      marca: document.getElementById('f-marca').value.trim() || null,
      w: document.getElementById('f-w').value.trim() || null,
      proteine: proteineTesto !== '' ? parseFloat(proteineTesto) : null,
      note: document.getElementById('f-note').value.trim() || null,
      fonte: document.getElementById('f-fonte').value.trim() || null,
      creato_il: new Date().toISOString(),
    };
    if (idTesto) farina.id = Number(idTesto);

    await db.put('farine', farina);
    mostraMessaggio(idTesto ? 'Farina aggiornata.' : 'Farina aggiunta.', true);
    svuotaForm();
    await renderTabella();
  });

  document.addEventListener('DOMContentLoaded', async () => {
    await caricaCatalogo();
    await renderTabella();
  });
})();
