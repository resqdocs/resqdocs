# packages/shared — geteilte Logik

Code, der **von mehreren Bereichen** genutzt wird (z. B. App und Tests). Hierher wandert u. a. der
**Protokoll-Renderer** (`render.mjs` aus Slice 2) samt Protokoll-Typen.

Daten (z. B. `standardprotokoll.json`) bleiben in [`../../protocols/`](../../protocols/); hier liegt
nur die wiederverwendbare Logik.

> Der Renderer wird beim App-Scaffolding hierher verschoben und typisiert.
