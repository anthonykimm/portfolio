import {
  Terminal,
  type ContactItem,
  type Dotfile,
  type Project,
  type Role,
} from "@/components/terminal";

// ---------------------------------------------------------------------------
// Content. Same source-of-truth as CONTENT_PLAN.md — the terminal renders
// these arrays in response to commands. Server component delivers them to
// the client component as props.
// ---------------------------------------------------------------------------

const NAME = "Anthony Kim";

const BIO =
  "Full stack engineer building software at the seam between product and customer. Currently embedded with Silicon Valley teams as a Forward Deployed Engineer at Lyra.";

const EXPERIENCE: Role[] = [
  {
    index: "01",
    title: "Forward Deployed Engineer",
    company: "Lyra",
    blurb: "Powering Silicon Valley with engineering.",
  },
  {
    index: "02",
    title: "Software Engineer",
    company: "Rovi Health (YC F25)",
    blurb:
      "Providing text-based healthcare for employees, slashing costs along the way.",
  },
  {
    index: "03",
    title: "Founding Engineer",
    company: "AutoDoc",
    blurb:
      "Cut documentation time and increased compliance for the automotive industry.",
  },
];

const PROJECTS: Project[] = [
  {
    index: "01",
    name: "Lyroom",
    context: "internal · Lyra",
    blurb:
      "A Loom clone built for internal distribution at Lyra. Async screen recording with one-click sharing for teams that move fast.",
  },
  {
    index: "02",
    name: "Inventory Management System",
    context: "open source",
    blurb:
      "Inventory management for student engineering teams. Parts, kits, and checkouts without the spreadsheet sprawl.",
  },
];

const DOTFILES: Dotfile[] = [
  {
    name: "nvim",
    description: "neovim configuration",
    href: "https://github.com/anthonykimm/nvim-config",
  },
  {
    name: "dotfiles",
    description: "shell, tmux, git, the rest of it",
    href: "https://github.com/anthonykimm/dotfiles",
  },
];

const CONTACT: ContactItem[] = [
  {
    label: "email",
    value: "anthonykim030@gmail.com",
    href: "mailto:anthonykim030@gmail.com",
  },
  {
    label: "github",
    value: "@anthonykimm",
    href: "https://github.com/anthonykimm",
  },
  {
    label: "linkedin",
    value: "/in/anthony-kim-776975269",
    href: "https://www.linkedin.com/in/anthony-kim-776975269/",
  },
];

export default function Home() {
  return (
    <Terminal
      name={NAME}
      bio={BIO}
      experience={EXPERIENCE}
      projects={PROJECTS}
      dotfiles={DOTFILES}
      contact={CONTACT}
    />
  );
}
