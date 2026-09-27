/* Admin pages' small behaviours, from data attributes rather than inline
   onchange/onsubmit handlers (which the Content Security Policy blocks):
   - data-autosubmit on a select: submit its form when it changes;
   - data-select-on-click on an input: select its text when clicked;
   - data-confirm="…" on a form: ask first, and only submit on OK. */
(function () {
  document.querySelectorAll('select[data-autosubmit]').forEach(function (select) {
    select.addEventListener('change', function () { if (select.form) select.form.submit(); });
  });
  document.querySelectorAll('[data-select-on-click]').forEach(function (input) {
    input.addEventListener('click', function () { input.select(); });
  });
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
    });
  });
})();
