'use strict';

// Verifica che calcolaImpasto() di assets/calcolo.js dia gli stessi risultati del sito
// originale (casi raccolti in test/casi-originale.json, gemello di /mnt/dev/pizza).
// Uso: node test/confronto-formula.js

const path = require('path');
const { casi, fissi } = require('./casi-originale.json');
const { calcolaImpasto } = require(path.join(__dirname, '..', 'assets', 'calcolo.js'));

let falliti = 0;

for (const { input, atteso } of casi) {
  const r = calcolaImpasto({ ...input, H: fissi.H });

  if (atteso.farina === '-') {
    if (r.valido) {
      falliti++;
      console.error('FALLITO (atteso non valido, ottenuto valido):', input);
    }
    continue;
  }

  const attesoFarina = parseInt(atteso.farina, 10);
  const attesoAcqua = parseInt(atteso.acqua, 10);
  const attesoSale = parseInt(atteso.sale, 10);
  const attesoLievito = parseFloat(atteso.lievito.replace(',', '.'));

  const ok = r.valido
    && r.farina === attesoFarina
    && r.acqua === attesoAcqua
    && r.sale === attesoSale
    && Math.abs(r.lievito - attesoLievito) < 0.005;

  if (!ok) {
    falliti++;
    console.error('FALLITO:', input, 'atteso', atteso, 'ottenuto', r);
  }
}

if (falliti > 0) {
  console.error(`\n${falliti}/${casi.length} casi falliti.`);
  process.exit(1);
}
console.log(`Tutti i ${casi.length} casi corrispondono all'originale.`);
