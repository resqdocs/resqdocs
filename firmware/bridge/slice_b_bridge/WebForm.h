/*
  WebForm.h — minimal Composer form served by the bridge over its WLAN-AP.
  accept-charset=UTF-8 so umlauts/special chars reach the firmware as UTF-8.
*/
#pragma once
#include <Arduino.h>

static const char RESQ_FORM_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ResQDocs Bridge</title>
<style>
 body{font-family:system-ui,sans-serif;margin:0;padding:1rem;background:#0f172a;color:#e2e8f0}
 h1{font-size:1.1rem} textarea{width:100%;height:9rem;font-size:1rem;padding:.5rem;box-sizing:border-box}
 select,button{font-size:1rem;padding:.5rem} button{background:#2563eb;color:#fff;border:0;border-radius:.4rem;width:100%;margin-top:.6rem}
 label{display:block;margin:.6rem 0 .2rem} .row{display:flex;gap:.5rem;align-items:center}
</style></head><body>
<h1>ResQDocs Bridge &rarr; tippt in NIDA / iPad</h1>
<form method="POST" action="/type" accept-charset="UTF-8">
 <label for="t">Text</label>
 <textarea id="t" name="text" autofocus>ä ö ü Ä Ö Ü ß € § µ ° @ \ { } [ ] | ~</textarea>
 <div class="row">
   <label for="os" style="margin:0">Ziel-OS</label>
   <select id="os" name="os">
     <option value="win">win_de (NIDA/Windows)</option>
     <option value="mac">mac_de (macOS)</option>
     <option value="ios">ios (iPad)</option>
   </select>
 </div>
 <button type="submit">In Zielgerät tippen</button>
</form>
</body></html>)HTML";
