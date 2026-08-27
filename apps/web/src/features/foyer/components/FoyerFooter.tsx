import Link from "next/link";

const productLinks = [
  { href: "/insight", label: "Insight" },
  { href: "/insight#platform", label: "Platform" },
  { href: "/insight#workflows", label: "Workflows" },
  { href: "/teams", label: "Team experience" },
];

const companyLinks = [
  { href: "/company", label: "Company" },
  { href: "/company-owner", label: "For operators" },
  { href: "/commercial/agreements", label: "Agreements" },
  { href: "/privacy", label: "Privacy" },
  { href: "/support", label: "Support" },
  { href: "/sign-in", label: "Sign in" },
];

export default function FoyerFooter() {
  return (
    <footer className="brand-footer">
      <div className="brand-footer__lead">
        <Link href="/" className="brand-footer__wordmark">Team Optix</Link>
        <p>
          Operational software shaped by the people responsible for keeping real work moving.
        </p>
      </div>

      <nav aria-label="Product links">
        <strong>Product</strong>
        {productLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>

      <nav aria-label="Company links">
        <strong>Team Optix</strong>
        {companyLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>

      <div className="brand-footer__access">
        <span>Already using Insight?</span>
        <Link href="/sign-in">Enter your workspace →</Link>
      </div>
    </footer>
  );
}
