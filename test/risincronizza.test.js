'use strict';

// Verifica risincronizza() e pesoLievitoTipo() (porting di Pianificatore::risincronizza()
// e Impasto::pesoLievitoTipo(), SPEC §8.2/§7.1). Uso: node test/risincronizza.test.js

const path = require('path');
const { risincronizza, pesoLievitoTipo } = require(path.join(__dirname, '..', 'assets', 'calcolo.js'));

let falliti = 0;
function verifica(descrizione, condizione) {
  if (!condizione) {
    falliti++;
    console.error('FALLITO:', descrizione);
  }
}

// pesoLievitoTipo
verifica('fresco resta invariato', pesoLievitoTipo(2.01, 'fresco') === 2.01);
verifica('secco è fresco/3 a 2 decimali', pesoLievitoTipo(2.01, 'secco') === 0.67);

// risincronizza: nessuna tappa fatta -> nessun aggiornamento
{
  const passi = [
    { id: 1, tipo: 'impasto', previsto_il: '2026-09-27T20:00:00', fatto_il: null },
    { id: 2, tipo: 'staglio', previsto_il: '2026-09-28T16:00:00', fatto_il: null },
  ];
  verifica('nessuna tappa fatta -> nessun aggiornamento', Object.keys(risincronizza(passi)).length === 0);
}

// risincronizza: impasto fatto 10 minuti dopo -> le tappe successive slittano di 10 min
{
  const passi = [
    { id: 1, tipo: 'impasto', previsto_il: '2026-09-27T20:00:00', fatto_il: '2026-09-27T20:10:00' },
    { id: 2, tipo: 'staglio', previsto_il: '2026-09-28T16:00:00', fatto_il: null },
    { id: 3, tipo: 'infornata', previsto_il: '2026-09-28T20:00:00', fatto_il: null },
  ];
  const r = risincronizza(passi);
  verifica('impasto (già fatto) non è tra gli aggiornamenti', r[1] === undefined);
  verifica('staglio slitta di 10 min', r[2].toISOString() === new Date('2026-09-28T16:10:00').toISOString());
  verifica('infornata slitta di 10 min', r[3].toISOString() === new Date('2026-09-28T20:10:00').toISOString());
}

// risincronizza: un secondo scostamento sovrascrive il primo per le tappe successive
{
  const passi = [
    { id: 1, tipo: 'impasto', previsto_il: '2026-09-27T20:00:00', fatto_il: '2026-09-27T20:10:00' },
    { id: 2, tipo: 'staglio', previsto_il: '2026-09-28T16:10:00', fatto_il: '2026-09-28T16:40:00' },
    { id: 3, tipo: 'infornata', previsto_il: '2026-09-28T20:10:00', fatto_il: null },
  ];
  const r = risincronizza(passi);
  verifica('infornata segue lo scostamento più recente (+30 min dal previsto aggiornato)',
    r[3].toISOString() === new Date('2026-09-28T20:40:00').toISOString());
}

if (falliti > 0) {
  console.error(`\n${falliti} verifiche fallite.`);
  process.exit(1);
}
console.log('risincronizza() e pesoLievitoTipo(): tutte le verifiche superate.');
