# Simulatore costo stampa 3D

Pagina che calcola peso, tempo e prezzo di una stampa 3D da uno o più file STL.
È collegata al sito principale https://ifeldr.github.io ma vive in questo repository separato,
all'indirizzo https://ifeldr.github.io/simulatore-3d/.

## Modificare prezzi e parametri

Apri `_data/calcolatore_3d.yml`, cambia i valori (email, costi, materiali, qualità, sconti)
e fai commit: GitHub Pages aggiorna la pagina in un paio di minuti.

## File

- `index.html`: la pagina (intestazione, testi, domande frequenti)
- `_includes/calcolatore-3d.html`: il calcolatore
- `assets/calcolatore-3d/`: logica e stile del calcolatore
- `assets/pagina.css`: stile della pagina
- `_config.yml`: indirizzo, nome e link del sito principale

## Pubblicazione

Settings → Pages → Source: **Deploy from a branch**, branch `main`, cartella `/ (root)`.
Non serve nessuna GitHub Action: la pagina usa il Jekyll integrato di GitHub Pages.
