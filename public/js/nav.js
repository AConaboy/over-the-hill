/* The phone-size menu button: opens and closes the navigation. (A file
   rather than an inline script, so the Content Security Policy needn't
   allow inline scripts for it.) */
(function () {
  var header = document.querySelector('.site-header');
  var menuButton = header && header.querySelector('.menu-button');
  var navigation = header && header.querySelector('.main-navigation');
  if (!menuButton || !navigation) return;

  menuButton.addEventListener('click', function () {
    var isOpen = navigation.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });

  navigation.addEventListener('click', function (event) {
    if (event.target instanceof HTMLAnchorElement) {
      navigation.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
    }
  });
})();
