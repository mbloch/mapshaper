// Tiny client-side helpers for the docs site.
//
// 1. Rewrites "Open in the web app" links so they target the current
//    origin. At build time, build-docs.mjs renders the link with `href`
//    pointing at https://mapshaper.org/?files=https%3A%2F%2Fmapshaper.org%2F...
//    and a `data-open-snapshot="/docs/.../foo.msx"` attribute holding the
//    snapshot's site-root-relative path. On page load we recompute href
//    against `location.origin` so the link works when the docs are
//    previewed locally (typically via `mapshaper-gui`, which serves www/
//    on localhost:NNNN), and continues to do the right thing on the
//    production site.
//
// 2. Adds a "Copy" button to every code block on individual example-map
//    pages (body.is-example-map). Skipped on the Basics index, whose code
//    blocks are short snippets where the buttons would be visual noise.
//    Falls back gracefully if the Clipboard API is unavailable.
//
// 3. Makes figure images (an image alone in its paragraph) open in a
//    full-screen overlay when clicked. A click anywhere, or Escape, closes it.
//    Images inside links and small UI screenshots are left alone.
(function () {
  initMobileNavToggle();
  rewriteOpenInWebAppLinks();
  initImageOverlay();
  if (document.body.classList.contains('is-example-map')) {
    addCopyButtons();
  }

  function initMobileNavToggle() {
    var btn = document.querySelector('.docs-nav-toggle');
    var label = btn && btn.querySelector('.docs-nav-toggle-label');
    var mql = window.matchMedia('(max-width: 720px)');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var open = document.body.classList.toggle('docs-nav-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (label) label.textContent = open ? 'Close menu' : 'Menu';
    });
    mql.addEventListener('change', function (e) {
      if (!e.matches) {
        document.body.classList.remove('docs-nav-open');
        btn.setAttribute('aria-expanded', 'false');
        if (label) label.textContent = 'Menu';
      }
    });
  }

  function initImageOverlay() {
    var imgs = document.querySelectorAll('.docs-article p > img:only-child');
    var overlay = null;
    var opener = null;
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].closest('a') || imgs[i].classList.contains('ui-screenshot')) continue;
      makeZoomable(imgs[i]);
    }

    function makeZoomable(img) {
      img.classList.add('zoomable');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.addEventListener('click', function () { open(img); });
      img.addEventListener('keydown', function (e) {
        if (e.key == 'Enter' || e.key == ' ') {
          e.preventDefault();
          open(img);
        }
      });
    }

    function open(img) {
      if (overlay) return;
      opener = img;
      overlay = document.createElement('div');
      overlay.className = 'image-overlay';
      var big = document.createElement('img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      overlay.appendChild(big);
      overlay.addEventListener('click', close);
      document.addEventListener('keydown', onKey);
      document.body.classList.add('image-overlay-open');
      document.body.appendChild(overlay);
    }

    function close() {
      if (!overlay) return;
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('image-overlay-open');
      overlay.remove();
      overlay = null;
      if (opener) opener.focus();
      opener = null;
    }

    function onKey(e) {
      if (e.key == 'Escape') close();
    }
  }

  function rewriteOpenInWebAppLinks() {
    var links = document.querySelectorAll('a[data-open-snapshot]');
    if (!links.length) return;
    var origin = location.origin;
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var path = a.getAttribute('data-open-snapshot') || '';
      if (!path) continue;
      var absUrl = origin + path;
      a.href = origin + '/?files=' + encodeURIComponent(absUrl) + '&q';
    }
  }

  function addCopyButtons() {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    var blocks = document.querySelectorAll('.docs-article pre');
    for (var i = 0; i < blocks.length; i++) {
      attachCopyButton(blocks[i]);
    }
  }

  function attachCopyButton(pre) {
    if (pre.querySelector(':scope > .copy-btn')) return; // already wired
    pre.classList.add('has-copy-btn');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.textContent = 'Copy';
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code') || pre;
      var text = code.innerText.replace(/\n$/, '');
      navigator.clipboard.writeText(text).then(function () {
        flash(btn, 'Copied');
      }, function () {
        flash(btn, 'Copy failed');
      });
    });
    pre.appendChild(btn);
  }

  var flashTimer = null;
  function flash(btn, label) {
    var original = 'Copy';
    btn.textContent = label;
    btn.classList.add('is-flashing');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      btn.textContent = original;
      btn.classList.remove('is-flashing');
    }, 1400);
  }
})();
