export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="brand-mark" href="/">
          <span className="brand-mark__kicker">TeamOptix</span>
          <span className="brand-mark__name">Insight</span>
        </a>

        <nav className="site-nav" aria-label="Primary">
          <a href="/sign-in">Sign in</a>
          <a href="/profile/setup">Profile</a>
          <a href="/company/setup">Company</a>
        </nav>
      </div>
    </header>
  );
}
