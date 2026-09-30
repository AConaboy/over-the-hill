/* Admin pages' small behaviours, from data attributes rather than inline
   onchange/onsubmit handlers (which the Content Security Policy blocks):
   - data-autosubmit on a select: submit its form when it changes;
   - data-select-on-click on an input: select its text when clicked;
   - data-confirm="…" on a form: ask first, and only submit on OK;
   - data-copy-invite="…" on a button: copy that message, then mark the
     invite sent (POST to its data-sent-url) and say so in the row;
   - the Sent tick box (.sent-toggle-form): saved in the background and
     shown in place, so the page doesn't reload and jump back to the top.
     Without JavaScript it's a normal form that comes back to the row. */
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

  function today() {
    return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  // Show a guest's invite as sent or not, in their row (or on their page).
  function showSent(cell, sent) {
    if (!cell) return;
    var status = cell.querySelector('[data-invite-status]');
    if (status) {
      if (status.classList.contains('badge')) {
        status.textContent = sent ? 'Sent ' + today() : 'Not sent';
        status.className = sent ? 'badge badge-sent' : 'badge badge-muted';
      } else {
        status.textContent = sent ? 'Sent ' + today() : 'Not sent yet';
      }
    }
    var input = cell.querySelector('.sent-toggle-form input[name="sent"]');
    if (!input) return;
    input.value = sent ? '0' : '1';                    // what pressing it next will do
    var toggle = input.form.querySelector('.sent-toggle');
    toggle.classList.toggle('is-on', sent);
    toggle.setAttribute('aria-pressed', sent ? 'true' : 'false');
    toggle.title = sent
      ? 'Invite sent. Press to mark it as not sent.'
      : "Press when you've sent their invite (e.g. by message).";
  }

  function postSent(url, sent, how) {
    var body = new FormData();
    body.append('sent', sent ? '1' : '0');
    if (how) body.append('how', how);
    return fetch(url, { method: 'POST', body: body, headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (response) { if (!response.ok) throw new Error('not saved'); });
  }

  document.querySelectorAll('.sent-toggle-form').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var button = form.querySelector('.sent-toggle');
      if (button.disabled) return;
      var sent = form.querySelector('input[name="sent"]').value === '1';
      var cell = form.closest('[data-invite-cell]');
      button.disabled = true;
      showSent(cell, sent);                            // straight away; put back if it fails
      postSent(form.action, sent).catch(function () {
        showSent(cell, !sent);
        window.alert("That didn't save. Check your connection and try again.");
      }).then(function () { button.disabled = false; });
    });
  });

  document.querySelectorAll('[data-copy-invite]').forEach(function (button) {
    var label = button.textContent.trim();
    function say(text) {
      button.textContent = text;
      setTimeout(function () { button.textContent = label; }, 2500);
    }
    button.addEventListener('click', function () {
      var message = button.getAttribute('data-copy-invite');
      var copied = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(message)
        : Promise.reject(new Error('no clipboard'));
      copied.then(function () {
        say('Copied!');
        return postSent(button.getAttribute('data-sent-url'), true, 'copied').then(function () {
          showSent(button.closest('[data-invite-cell]'), true);
        });
      }, function () {
        // no clipboard (an old browser, or not allowed): show it to copy by hand
        window.prompt('Copy this message:', message);
      }).catch(function () { /* copied, but not marked sent: the tick box still works */ });
    });
  });
})();
