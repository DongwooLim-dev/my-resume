'use strict';
(() => {
  const toggle = document.getElementById('site-menu-toggle');
  const drawer = document.getElementById('site-sidebar');
  const close = document.getElementById('site-menu-close');
  if (!toggle || !drawer || !close) return;
  let closing = false;
  function finishClose() {
    if (!closing) return;
    closing = false;
    drawer.classList.remove('site-sidebar-closing');
    drawer.close();
  }
  function hide() {
    if (!drawer.open || closing) return;
    closing = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishClose();
    } else {
      drawer.classList.add('site-sidebar-closing');
      window.setTimeout(finishClose, 200);
    }
  }
  toggle.addEventListener('click', () => {
    if (drawer.open) return hide();
    drawer.showModal();
    document.body.classList.add('site-menu-is-open');
    toggle.setAttribute('aria-expanded', 'true');
    close.focus();
  });
  close.addEventListener('click', hide);
  drawer.addEventListener('cancel', (event) => {
    event.preventDefault();
    hide();
  });
  drawer.addEventListener('click', (event) => {
    if (event.target !== drawer) return;
    const bounds = drawer.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) hide();
  });
  drawer.addEventListener('close', () => {
    closing = false;
    drawer.classList.remove('site-sidebar-closing');
    document.body.classList.remove('site-menu-is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  });
})();
