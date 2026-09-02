const navItems = [
  { href: "about.html", label: "About" },
  { href: "camping.html", label: "Camping" },
  { href: "food.html", label: "Food" },
  { href: "activities.html", label: "Activities" },
  { href: "travel.html", label: "Travel" },
  { href: "faq.html", label: "FAQs" },
  { href: "game.html", label: "Game" },
  { href: "ticket.html", label: "Tickets" },
  { href: "rsvp.html", label: "RSVP", className: "nav-rsvp" }
];

function buildNavigationMarkup(currentPage) {
  const links = navItems
    .map(({ href, label, className }) => {
      const isCurrentPage = currentPage && href === `${currentPage}.html`;
      const classes = className ? `class="${className}${isCurrentPage ? " is-current" : ""}"` : "";
      const ariaCurrent = isCurrentPage ? ' aria-current="page"' : "";

      return `<a href="${href}" ${classes}${ariaCurrent}>${label}</a>`;
    })
    .join("");

  return `
    <header class="site-header">
      <div class="nav-container">
        <div class="brand-group">
          <a class="site-logo" href="index.html" aria-label="Go to the homepage">
            <img src="images/over-the-hill-artwork-1.jpeg" alt="Over the Hill artwork icon">
          </a>
          <a class="site-name" href="index.html">Over the Hill</a>
        </div>

        <button
          class="menu-button"
          type="button"
          aria-expanded="false"
          aria-controls="main-navigation"
        >
          Menu
        </button>

        <nav id="main-navigation" class="main-navigation" aria-label="Main navigation">
          ${links}
        </nav>
      </div>
    </header>
  `;
}

function attachMenuToggle(menuButton, navigation) {
  if (!menuButton || !navigation) {
    return;
  }

  menuButton.addEventListener("click", () => {
    const isOpen = navigation.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  navigation.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      navigation.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
    }
  });
}

function initialiseHeader() {
  const placeholders = document.querySelectorAll("[data-site-header]");

  placeholders.forEach((placeholder) => {
    const pageName = (placeholder.dataset.page || "index").replace(/\.html$/i, "");
    placeholder.innerHTML = buildNavigationMarkup(pageName);

    const menuButton = placeholder.querySelector(".menu-button");
    const navigation = placeholder.querySelector(".main-navigation");
    attachMenuToggle(menuButton, navigation);
  });
}

initialiseHeader();