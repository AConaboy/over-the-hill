/* Songs for the playlist, on a guest's page (once they've paid): turns
   the boxes for Spotify links into a search. What they pick goes back into
   those same boxes (as the track's id), so the form sends exactly what it
   would without this script. Searches go through our own
   /api/rsvp/songs/search, with the guest's token, never straight to
   Spotify. */
(function () {
  var fieldset = document.querySelector('.song-picks');
  if (!fieldset || !window.fetch) return;
  var token = fieldset.getAttribute('data-token');
  var max = Number(fieldset.getAttribute('data-max')) || 3;
  var manual = fieldset.querySelector('.song-manual');
  var inputs = Array.prototype.slice.call(fieldset.querySelectorAll('input[name="songs"]'));
  if (!manual || inputs.length === 0) return;

  // What's picked already, from the boxes the page filled in.
  var chosen = inputs
    .filter(function (input) { return input.getAttribute('data-track'); })
    .map(function (input) {
      return {
        id: input.getAttribute('data-track'),
        title: input.getAttribute('data-title') || '',
        artist: input.getAttribute('data-artist') || '',
        imageUrl: input.getAttribute('data-image') || null,
      };
    });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function art(track) {
    if (track.imageUrl && track.imageUrl.indexOf('https://i.scdn.co/') === 0) {
      var img = el('img', 'song-art');
      img.src = track.imageUrl;
      img.alt = '';
      img.width = 48;
      img.height = 48;
      img.loading = 'lazy';
      return img;
    }
    var blank = el('span', 'song-art song-art-blank', '♪');
    blank.setAttribute('aria-hidden', 'true');
    return blank;
  }

  function trackText(track) {
    var text = el('span', 'song-text');
    text.appendChild(el('strong', null, track.title));
    text.appendChild(el('span', null, track.artist));
    return text;
  }

  // The search, built here (it needs this script to work at all).
  var chooser = el('div', 'song-chooser');
  var list = el('ol', 'song-chosen');
  list.setAttribute('aria-label', 'Your songs');
  var searchField = el('div', 'form-field song-search');
  var label = el('label', null, 'Search for a song or artist');
  label.htmlFor = 'song-search';
  var search = el('input');
  search.id = 'song-search';
  search.type = 'search';
  search.autocomplete = 'off';
  search.setAttribute('aria-describedby', 'songs-note song-status');
  search.setAttribute('aria-controls', 'song-results');
  searchField.appendChild(label);
  searchField.appendChild(search);
  var status = el('p', 'song-status');
  status.id = 'song-status';
  status.setAttribute('role', 'status');
  var results = el('ul', 'song-results');
  results.id = 'song-results';
  results.setAttribute('aria-label', 'Search results');
  chooser.appendChild(list);
  chooser.appendChild(searchField);
  chooser.appendChild(status);
  chooser.appendChild(results);
  manual.hidden = true;
  manual.after(chooser);

  function save() {
    inputs.forEach(function (input, i) {
      input.value = chosen[i] ? chosen[i].id : '';
    });
  }

  function say(message) {
    status.textContent = message;
  }

  function full() {
    return chosen.length >= max;
  }

  function renderChosen() {
    list.replaceChildren();
    chosen.forEach(function (track, i) {
      var item = el('li', 'song-item');
      item.appendChild(art(track));
      item.appendChild(trackText(track));
      var remove = el('button', 'link-button song-remove', 'Remove');
      remove.type = 'button';
      remove.appendChild(el('span', 'visually-hidden', ' ' + track.title));
      remove.addEventListener('click', function () {
        chosen.splice(i, 1);
        save();
        renderChosen();
        say('Removed ' + track.title + '. ' + countText());
        search.focus();
      });
      item.appendChild(remove);
      list.appendChild(item);
    });
    list.hidden = chosen.length === 0;
    search.disabled = full();
    label.textContent = full() ? 'You’ve picked ' + max + ' songs. Remove one to choose another.' : 'Search for a song or artist';
  }

  function countText() {
    return chosen.length + ' of ' + max + ' songs picked.';
  }

  function renderResults(tracks) {
    results.replaceChildren();
    tracks.forEach(function (track) {
      var already = chosen.some(function (c) { return c.id === track.id; });
      var item = el('li');
      var button = el('button', 'song-result');
      button.type = 'button';
      button.disabled = already;
      button.appendChild(art(track));
      button.appendChild(trackText(track));
      button.appendChild(el('span', 'song-add', already ? 'Picked' : 'Add'));
      button.addEventListener('click', function () {
        if (full()) return;
        chosen.push(track);
        save();
        renderChosen();
        results.replaceChildren();
        search.value = '';
        say('Added ' + track.title + ' by ' + track.artist + '. ' + countText());
        if (!full()) search.focus();
      });
      item.appendChild(button);
      results.appendChild(item);
    });
  }

  var timer = null;
  var latest = 0;

  function runSearch() {
    var query = search.value.trim();
    if (query.length < 2) {
      renderResults([]);
      say('');
      return;
    }
    var ask = ++latest;
    var body = new URLSearchParams();
    body.set('token', token);
    body.set('q', query);
    fetch('/api/rsvp/songs/search', { method: 'POST', body: body })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (ask !== latest) return;
        if (data.error) {
          renderResults([]);
          say('Song search isn’t working right now. Try again in a minute.');
          return;
        }
        renderResults(data.tracks || []);
        say(data.tracks && data.tracks.length
          ? data.tracks.length + ' songs found. Choose Add to pick one.'
          : 'No songs found. Try different words.');
      })
      .catch(function () {
        if (ask !== latest) return;
        say('Song search isn’t working right now. Try again in a minute.');
      });
  }

  search.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 350);
  });
  // Enter searches; it mustn't send the whole form.
  search.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(timer);
      runSearch();
    }
  });

  save();
  renderChosen();
})();
