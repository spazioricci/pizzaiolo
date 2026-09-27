'use strict';

/* Pizzaiolo Amici — elenco esperimenti (diario.php): schede "polaroid", filtro
 * per farina, eliminazione con conferma. Markup ricalcato da design/diario.html. */

(function () {
  const db = window.PizzaioloDB;
  const repo = window.PizzaioloRepo;
  const CAMPI_VOTO = ['cornicione', 'leopardatura', 'sottopizza', 'estensibilita', 'digeribilita'];

  function votoMedio(esperimento) {
    const valori = CAMPI_VOTO.map((c) => esperimento[`voto_${c}`]).filter((v) => v != null);
    if (valori.length === 0) return 0;
    return Math.round(valori.reduce((a, b) => a + b, 0) / valori.length);
  }

  function formattaDataBreve(data) {
    if (!data) return '';
    const d = new Date(`${data}T12:00:00`);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  }

  async function popolaFiltro() {
    const select = document.getElementById('d-farina');
    const farine = (await db.getAll('farine')).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    farine.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = String(f.id);
      opt.textContent = f.nome;
      select.appendChild(opt);
    });
  }

  function creaScheda(esperimento) {
    const col = document.createElement('div');
    col.className = 'col-6 col-md-4 col-lg-3';

    const a = document.createElement('a');
    a.className = 'cp-polaroid';
    a.href = `esperimento.html?id=${esperimento.id}`;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = `Esperimento ${esperimento.id}`;
    if (esperimento.foto_copertina) {
      img.src = URL.createObjectURL(esperimento.foto_copertina.blob);
      img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
    } else {
      img.src = 'assets/svg/pizza.svg';
    }
    const didascalia = document.createElement('span');
    didascalia.className = 'cp-polaroid-didascalia';
    const forte = document.createElement('strong');
    forte.textContent = `#${esperimento.id} · ${formattaDataBreve(esperimento.data)}`;
    const farinaSpan = document.createElement('span');
    farinaSpan.textContent = esperimento.farina_nome || 'Senza farina';
    const voto = votoMedio(esperimento);
    const votoSpan = document.createElement('span');
    votoSpan.className = 'cp-voto';
    votoSpan.dataset.voto = String(voto);
    votoSpan.setAttribute('role', 'img');
    votoSpan.setAttribute('aria-label', voto > 0 ? `Voto medio ${voto} su 5` : 'Non ancora votato');
    didascalia.append(forte, farinaSpan, votoSpan);
    a.append(img, didascalia);

    const form = document.createElement('form');
    form.className = 'text-center mt-2';
    form.dataset.conferma = `Eliminare l'esperimento #${esperimento.id}? Si perdono passi, foto e voti.`;
    const bElimina = document.createElement('button');
    bElimina.type = 'submit';
    bElimina.className = 'cp-btn cp-btn-pericolo cp-btn-piccolo';
    bElimina.textContent = 'Elimina';
    bElimina.setAttribute('aria-label', `Elimina l'esperimento #${esperimento.id}`);
    form.appendChild(bElimina);
    // Il form è creato dinamicamente DOPO il DOMContentLoaded: lo scanner generico di
    // data-conferma in assets/app.js gira una sola volta all'avvio e non lo vede mai,
    // quindi qui la conferma va chiesta direttamente (non con lo stesso pattern usato
    // in js/pagina-esperimento.js, valido solo per gli elementi già presenti in pagina).
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!window.confirm(form.dataset.conferma)) return;
      await db.eliminaEsperimento(esperimento.id);
      await render();
    });

    col.append(a, form);
    return col;
  }

  async function render() {
    const filtro = document.getElementById('d-farina').value;
    const esperimenti = await repo.elencoDiario(filtro || undefined);
    document.getElementById('conteggio').textContent = esperimenti.length === 0 ? ''
      : `${esperimenti.length} esperiment${esperimenti.length === 1 ? 'o' : 'i'}, dal più recente.`;

    const griglia = document.getElementById('griglia-diario');
    griglia.replaceChildren(...esperimenti.map(creaScheda));
    document.getElementById('stato-vuoto').hidden = esperimenti.length > 0;
  }

  document.getElementById('d-farina').addEventListener('change', render);

  document.addEventListener('DOMContentLoaded', async () => {
    await popolaFiltro();
    await render();
  });
})();
