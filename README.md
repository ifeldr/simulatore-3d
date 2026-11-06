# Simulatore costo stampa 3D

Pagina che calcola peso, tempo e costo reale di una stampa 3D da uno o più file STL.
È collegata al sito principale https://ifeldr.github.io ma vive in questo repository separato,
all'indirizzo https://ifeldr.github.io/simulatore-3d/.

## Modificare prezzi e parametri

Apri `_data/calcolatore_3d.yml`, cambia i valori (email, costi, materiali, qualità, sconti, stampanti)
e fai commit: GitHub Pages aggiorna la pagina in un paio di minuti.

## Stampanti

In fondo a `_data/calcolatore_3d.yml` c'è la lista `stampanti`: ognuna ha area di stampa,
costo orario, velocità e materiali supportati. Si sceglie una stampante per i nuovi file e la si può
cambiare file per file nell'elenco: ogni file mantiene la sua scelta e il prezzo si ricalcola. Le stampanti presenti sono esempi: tieni solo le tue e correggi i valori.

## Resina

Oltre alle stampanti a filamento ci sono quelle a resina (`tecnologia: resina` in
`_data/calcolatore_3d.yml`), con le loro resine nell'elenco dei materiali. Per la resina il
simulatore calcola i millilitri di resina (pezzo pieno o svuotato), il tempo in base all'altezza
dei pezzi e ai `secondi_strato` della stampante (i pezzi sullo stesso piatto si stampano insieme)
e il costo di lavaggio e polimerizzazione per ogni stampa.

## File

- `index.html`: la pagina (intestazione e testi)
- `_includes/calcolatore-3d.html`: il calcolatore
- `assets/calcolatore-3d/`: logica e stile del calcolatore
- `assets/pagina.css`: stile della pagina
- `_config.yml`: indirizzo, nome e link del sito principale

## Pubblicazione

Settings → Pages → Source: **Deploy from a branch**, branch `main`, cartella `/ (root)`.
Non serve nessuna GitHub Action: la pagina usa il Jekyll integrato di GitHub Pages.
