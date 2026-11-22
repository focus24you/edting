/* Shared helpers for every scene template. Deterministic: no clocks, no randomness, no fetches. */
window.__timelines = window.__timelines || {};
window.EDIT = (function () {
  var EASE = "power4.out";
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  /* Fill `el` with masked words. Wrap words in *stars* to color them with the accent. Returns the word nodes. */
  function words(el, text) {
    var hl = false, html = "";
    String(text == null ? "" : text).split(/\s+/).forEach(function (word) {
      if (!word) return;
      var inner = "";
      word.split("*").forEach(function (part, i) {
        if (i > 0) hl = !hl;
        if (part) inner += hl ? '<span class="hl">' + esc(part) + "</span>" : esc(part);
      });
      if (inner) html += '<span class="wm"><span class="w">' + inner + "</span></span>";
    });
    el.innerHTML = html;
    return el.querySelectorAll(".w");
  }
  /* Signature move: words rise out of their masks, staggered. */
  function rise(tl, nodes, at, stagger) {
    if (!nodes || !nodes.length) return tl;
    return tl.fromTo(nodes, { yPercent: 115 }, { yPercent: 0, duration: 0.6, ease: EASE, stagger: stagger == null ? 0.06 : stagger }, at);
  }
  /* Fill a scene's timeline. Called from the template's inline script (see the note there).
     build(v, tl, dur, q, root): q = querySelector inside this scene instance. */
  function scene(v, root, tl, build) {
    v = v || {};
    var dur = Number(v.duration) || 4;
    build(v, tl, dur, function (sel) { return root.querySelector(sel); }, root);
    if (Number(v.duration)) tl.set({}, {}, dur);
    return tl;
  }
  /* Standard exit: quick fade of the whole scene content just before the end. */
  function out(tl, target, dur, len) {
    len = len || 0.3;
    return tl.to(target, { opacity: 0, duration: len, ease: "power2.in" }, Math.max(0, dur - len));
  }
  return { esc: esc, words: words, rise: rise, scene: scene, out: out, EASE: EASE };
})();
