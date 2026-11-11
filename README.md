# Simulatore costo stampa 3D

Pagina che calcola peso, tempo e costo reale di una stampa 3D da uno o più file STL.
È collegata al sito principale https://ifeldr.github.io ma vive in questo repository separato,
all'indirizzo https://ifeldr.github.io/simulatore-3d/, in due lingue:

- italiano: https://ifeldr.github.io/simulatore-3d/it/
- inglese: https://ifeldr.github.io/simulatore-3d/en/

L'indirizzo principale porta alla versione giusta: quella scelta in precedenza con il selettore
IT | EN oppure, alla prima visita, quella della lingua del browser (italiano o, altrimenti, inglese).

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

## Lingue e valuta

- I testi delle pagine sono in `_data/testi/it.yml` e `_data/testi/en.yml`: per correggere una parola
  basta modificarli. Le parole tra graffe, come `{name}`, vanno lasciate come sono.
- Nomi di materiali e qualità e note delle stampanti hanno la versione inglese nei campi `nome_en`
  e `note_en` di `_data/calcolatore_3d.yml`; se mancano si usa il testo italiano.
- Il visitatore sceglie tra euro e dollari in entrambe le lingue. Tutti gli importi del file sono in
  euro e vengono convertiti con `cambio_eur_usd` (1 € = X $): aggiornalo ogni tanto.

## File supportati

- **STL** (binario e ASCII): la stima si calcola dalla geometria, con materiale, riempimento, supporti e qualità scelti nella pagina.
- **3MF di progetto** (Bambu Studio, OrcaSlicer, PrusaSlicer e altri): si leggono tutti gli oggetti da stampare con le loro
  posizioni e l'unità di misura del file, poi la stima è come per l'STL. Se il progetto indica stampante e filamento,
  vengono proposti in automatico.
- **3MF già processato** (`.gcode.3mf` di Bambu Studio e Orca) e **G-code** (`.gcode`, `.gco`, `.g`, `.bgcode` di Prusa):
  tempo e filamento sono quelli calcolati dallo slicer, per tutti i piatti del file. Scala, riempimento e supporti
  sono già decisi nello slicer e non si modificano; si possono cambiare stampante (per usura ed energia), materiale
  (per il prezzo) e numero di pezzi. Sono riconosciuti i commenti di PrusaSlicer, Bambu Studio, OrcaSlicer,
  SuperSlicer, Cura, Simplify3D e ideaMaker. Se il G-code ha una miniatura, appare al posto dell'anteprima 3D.
- Del G-code si leggono solo il primo e l'ultimo MB, dove gli slicer scrivono i dati riassuntivi, quindi anche file
  molto grandi si aprono subito. Il 3MF si apre nel browser con `DecompressionStream`, senza librerie esterne.
- I formati delle stampanti a resina già processati (`.ctb`, `.goo`, `.pwmx` e simili) non sono supportati: per la resina si usano STL o 3MF.

## Prezzo dei materiali

- Accanto al materiale c'è il campo **Prezzo bobina** (o **Prezzo resina**) in €/kg o $/kg: chi usa il simulatore
  mette quello che paga davvero. Vale per tutti i file con quel materiale.
- Il prezzo viene ricordato nel browser del visitatore (chiave `c3d-prezzi`, in euro, indicato per nome del materiale)
  e finisce anche nel file Excel, quindi si ripristina con "Importa impostazioni". **Ripristina** torna al prezzo predefinito.
- I prezzi predefiniti restano quelli di `prezzo_kg` in `_data/calcolatore_3d.yml`.

## Confronto rapido

Sotto il totale, il riquadro **Confronto rapido** prende il file selezionato nell'anteprima e mostra
peso, tempo e costo a pezzo con tutti i materiali compatibili con la sua stampante, oppure con il suo
materiale su tutte le stampanti che lo supportano (dalla più economica, prime 8 e poi "Mostra tutte").
Toccando una riga la scelta passa al file. Il costo è quello del file stampato da solo, senza riscaldamento.

## Excel

- **Scarica Excel** crea un file `.xlsx` con un foglio per i file (una riga per STL, con impostazioni,
  peso, tempo e costi), un foglio di riepilogo e un foglio nascosto con le impostazioni generali.
- **Importa impostazioni** rilegge quel file: le righe vengono abbinate ai file STL con lo stesso nome.
  Se gli STL non sono ancora caricati, ricevono le impostazioni quando li carichi.
  Le modifiche fatte in Excel a pezzi, scala, riempimento, interno, supporti, materiale e stampante vengono riprese.
- Tutto avviene nel browser con [SheetJS](https://sheetjs.com) (licenza Apache 2.0), salvato in
  `assets/calcolatore-3d/vendor/` e caricato solo al primo clic.

## Domande frequenti

Le domande sotto il simulatore sono in `_data/testi/it.yml` e `_data/testi/en.yml`, alla voce `faq`:
ogni domanda ha `d` (domanda) e `r` (risposta, in Markdown). La pagina genera anche i dati strutturati
`FAQPage` per i motori di ricerca. Se cambi un valore in `_data/calcolatore_3d.yml` (scarto, pareti,
riscaldamento, supporti), aggiorna anche la risposta che lo cita.

## File

- `it/index.html`, `en/index.html`: le due versioni della pagina (usano `_layouts/simulatore.html`)
- `index.html`: porta alla versione nella lingua giusta
- `_includes/calcolatore-3d.html`: il calcolatore
- `assets/calcolatore-3d/`: logica e stile del calcolatore (in `vendor/` la libreria per i file Excel)
- `assets/pagina.css`: stile della pagina
- `_config.yml`: indirizzo, nome e link del sito principale

## Pubblicazione

Settings → Pages → Source: **Deploy from a branch**, branch `main`, cartella `/ (root)`.
Non serve nessuna GitHub Action: la pagina usa il Jekyll integrato di GitHub Pages.
