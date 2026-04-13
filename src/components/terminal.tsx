"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Fzf } from "fzf";
import { SudoRmRf } from "./sudo-rm-rf";

// ---------------------------------------------------------------------------
// Public types — kept here so page.tsx can import them without dragging the
// client bundle into its own module graph.
// ---------------------------------------------------------------------------

export type Role = {
  index: string;
  title: string;
  company: string;
  blurb: string;
  href?: string;
  dates?: string;
};

export type Project = {
  index: string;
  name: string;
  context: string;
  blurb: string;
  href?: string;
};

export type Education = {
  institution: string;
  degree: string;
  years: string;
};

export type Volunteering = {
  title: string;
  organization: string;
  dates: string;
};

export type Dotfile = {
  name: string;
  description: string;
  href: string;
};

export type ContactItem = {
  label: string;
  value: string;
  href: string;
};

type Props = {
  name: string;
  bio: string;
  experience: Role[];
  projects: Project[];
  dotfiles: Dotfile[];
  contact: ContactItem[];
  education: Education[];
  volunteering: Volunteering[];
};

// ---------------------------------------------------------------------------
// Constants — the prompt persona. visitor@anthonykim.dev:~$
// ---------------------------------------------------------------------------

const USER = "visitor";
const HOST = "anthonykim.dev";
const PWD = "~";

// ---------------------------------------------------------------------------
// Terminal — the whole interactive surface lives here. Server passes content
// in as props so this component owns nothing about identity, only behaviour.
// ---------------------------------------------------------------------------

type Line = { id: number; node: ReactNode };

export function Terminal({
  name,
  bio,
  experience,
  projects,
  dotfiles,
  contact,
  education,
  volunteering,
}: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [tabIdx, setTabIdx] = useState(-1);
  const [tabPartial, setTabPartial] = useState("");
  const [sudoRmRf, setSudoRmRf] = useState(false);

  const idRef = useRef(0);
  const bootedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const tabCyclingRef = useRef(false);

  // ---- imperative line API -------------------------------------------------

  const addLines = useCallback((nodes: ReactNode[]) => {
    setLines((prev) => {
      const next = [...prev];
      for (const n of nodes) {
        idRef.current += 1;
        next.push({ id: idRef.current, node: n });
      }
      return next;
    });
  }, []);

  const addLine = useCallback(
    (node: ReactNode) => addLines([node]),
    [addLines],
  );

  // ---- boot buffer ---------------------------------------------------------
  // The lines that appear on launch. `clear` doesn't wipe the screen — it
  // resets back to this so the headline is always present.

  const bootNodes = useMemo<ReactNode[]>(
    () => [
      <AsciiArt key="ascii" />,
      <div
        key="role"
        className="mt-3 ml-1 flex flex-wrap items-baseline gap-x-3 text-fg-bright"
      >
        <span className="text-prompt">›</span>
        <span className="text-[13px] font-medium uppercase tracking-[0.18em]">
          Software Engineer
        </span>
        <span className="text-fg-dim text-[12px] normal-case tracking-normal">
          — building at the seam between product and customer
        </span>
      </div>,
      <div key="hint" className="mt-6 ml-1 text-fg-dim">
        Welcome. Type <Kbd>help</Kbd> for the list of available commands.
      </div>,
      <Spacer key="bspace" />,
    ],
    [],
  );

  const resetToBoot = useCallback(() => {
    setLines(
      bootNodes.map((node) => {
        idRef.current += 1;
        return { id: idRef.current, node };
      }),
    );
  }, [bootNodes]);

  // ---- command table -------------------------------------------------------

  type Handler = (args: string[]) => ReactNode[] | null;

  const commands = useMemo<Record<string, { description: string; handler: Handler }>>(
    () => ({
      help: {
        description: "list available commands",
        handler: () => helpOutput(),
      },
      whoami: {
        description: "about me  [-l|--long for full CV]",
        handler: (args) => {
          const long = args.includes("-l") || args.includes("--long");
          if (long) {
            return whoamiLongOutput(name, bio, experience, projects, education, volunteering, contact);
          }
          return whoamiOutput(name, bio);
        },
      },
      experience: {
        description: "work history",
        handler: () => experienceOutput(experience),
      },
      work: {
        description: "alias for experience",
        handler: () => experienceOutput(experience),
      },
      projects: {
        description: "selected projects",
        handler: () => projectsOutput(projects),
      },
      config: {
        description: "dotfiles & system config",
        handler: () => configOutput(dotfiles),
      },
      dotfiles: {
        description: "alias for config",
        handler: () => configOutput(dotfiles),
      },
      contact: {
        description: "how to reach me",
        handler: () => contactOutput(contact),
      },
      education: {
        description: "where I studied",
        handler: () => educationOutput(education),
      },
      volunteering: {
        description: "community involvement",
        handler: () => volunteeringOutput(volunteering),
      },
      ls: {
        description: "list sections",
        handler: () => [
          <div key="ls" className="flex flex-wrap gap-x-6 gap-y-1">
            {[
              "experience/",
              "projects/",
              "education/",
              "volunteering/",
              "config/",
              "contact/",
            ].map((s) => (
              <span key={s} className="text-prompt">
                {s}
              </span>
            ))}
          </div>,
        ],
      },
      echo: {
        description: "print arguments",
        handler: (args) => [
          <div key="e" className="text-fg">
            {args.join(" ")}
          </div>,
        ],
      },
      "sudo rm -rf /*": {
        description: "...",
        handler: () => {
          setSudoRmRf(true);
          return [
            <div key="s" className="text-error font-bold">
              [sudo] rm -rf /*: destroying everything...
            </div>,
          ];
        },
      },
      sudo: {
        description: "...",
        handler: () => [
          <div key="s" className="text-error">
            [sudo] permission denied: nice try.
          </div>,
        ],
      },
      exit: {
        description: "leave the terminal",
        handler: () => [
          <div key="x" className="text-fg-dim">
            there is nowhere to go. you are home.
          </div>,
        ],
      },
      clear: {
        description: "clear the screen",
        handler: () => {
          resetToBoot();
          return null;
        },
      },
      cls: {
        description: "alias for clear",
        handler: () => {
          resetToBoot();
          return null;
        },
      },
    }),
    [name, bio, experience, projects, dotfiles, contact, education, volunteering, resetToBoot],
  );

  // ---- fuzzy suggestions ----------------------------------------------------

  const commandNames = useMemo(() => Object.keys(commands), [commands]);
  const fzf = useMemo(() => new Fzf(commandNames), [commandNames]);

  const fuzzyMatch = useCallback((partial: string) => {
    if (!partial || partial.includes(" ")) return [];
    return fzf.find(partial).map((r) => r.item);
  }, [fzf]);

  // Suggestions derived from tabPartial (while cycling) or current input
  const suggestions = useMemo(() => {
    const source = tabPartial || input.trim();
    return fuzzyMatch(source);
  }, [tabPartial, input, fuzzyMatch]);

  // Reset tab state when user types normally (not Tab cycling)
  useEffect(() => {
    if (tabCyclingRef.current) {
      tabCyclingRef.current = false;
      return;
    }
    setTabIdx(-1);
    setTabPartial("");
  }, [input]);

  // ---- runner --------------------------------------------------------------

  const runCommand = useCallback(
    (raw: string) => {
      const echo: ReactNode = (
        <PromptEcho>
          <span className="text-fg-bright">{raw}</span>
        </PromptEcho>
      );

      const trimmed = raw.trim();
      if (!trimmed) {
        addLine(echo);
        return;
      }

      // Check for multi-word commands first (e.g. "sudo rm -rf /*")
      const lower = trimmed.toLowerCase();
      let entry = Object.prototype.hasOwnProperty.call(commands, lower)
        ? commands[lower]
        : null;
      let args: string[] = [];
      const [firstWord, ...rest] = trimmed.split(/\s+/);

      if (!entry) {
        entry = commands[firstWord.toLowerCase()] ?? null;
        args = rest;
      }

      if (!entry) {
        addLines([
          echo,
          <div key="err" className="text-error">
            command not found: {firstWord}
          </div>,
          <div key="hint" className="text-fg-dim">
            try <Kbd>help</Kbd> for the list of commands.
          </div>,
          <Spacer key="sp" />,
        ]);
        return;
      }

      const result = entry.handler(args);
      if (result === null) return; // command handled state itself (e.g. clear)
      addLines([echo, ...result, <Spacer key={`sp-${idRef.current}`} />]);
    },
    [commands, addLine, addLines],
  );

  // ---- boot sequence -------------------------------------------------------

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    resetToBoot();
  }, [resetToBoot]);

  // ---- input handling ------------------------------------------------------

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runCommand(input);
    if (input.trim()) {
      setCmdHistory((h) => [...h, input]);
    }
    setInput("");
    setHistIdx(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const next =
        histIdx === -1 ? cmdHistory.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(cmdHistory[next]);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === -1) return;
      const next = histIdx + 1;
      if (next >= cmdHistory.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(next);
        setInput(cmdHistory[next]);
      }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      // Compute matches from the original partial (before any Tab cycling)
      const partial = tabPartial || input.trim();
      const matches = fuzzyMatch(partial);
      if (matches.length === 0) return;
      tabCyclingRef.current = true;
      if (!tabPartial) setTabPartial(partial);
      if (matches.length === 1) {
        setInput(matches[0]);
        setTabIdx(-1);
        setTabPartial("");
      } else {
        const next = e.shiftKey
          ? (tabIdx <= 0 ? matches.length - 1 : tabIdx - 1)
          : (tabIdx + 1) % matches.length;
        setTabIdx(next);
        setInput(matches[next]);
      }
      return;
    }

    if ((e.key === "l" || e.key === "L") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      resetToBoot();
      return;
    }

    if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      addLine(
        <PromptEcho>
          <span className="text-fg-bright">{input}</span>
          <span className="text-error">^C</span>
        </PromptEcho>,
      );
      setInput("");
      setHistIdx(-1);
    }
  };

  // ---- focus the prompt on mount (replaces autoFocus, which can confuse
  // hydration when the input element is touched by browser extensions) -----

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // ---- click anywhere → focus the prompt -----------------------------------

  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      // Don't snatch focus while the user is highlighting text…
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      // …or clicking on a real link.
      const target = e.target as HTMLElement | null;
      if (target?.closest("a")) return;
      inputRef.current?.focus();
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  // ---- auto-scroll: keep the prompt in view --------------------------------

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines]);

  // --------------------------------------------------------------------------

  const handleSudoRmRfDone = useCallback(() => {
    setSudoRmRf(false);
    resetToBoot();
  }, [resetToBoot]);

  return (
    <div className="relative flex min-h-screen flex-col">
      {sudoRmRf && <SudoRmRf onDone={handleSudoRmRfDone} />}
      <TitleBar />

      <main className="flex-1 px-4 pt-6 pb-16 sm:px-8">
        <div className="mx-auto max-w-[112ch] text-[13px] leading-[1.6] sm:text-[14px]">
          {lines.map((l) => (
            <div key={l.id} className="type-in">
              {l.node}
            </div>
          ))}

          {/* The live prompt — real <input> inside the line. */}
          <form onSubmit={onSubmit} className="flex items-baseline">
            <PromptGlyph />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              aria-label="terminal command input"
              className="term-input flex-1"
              suppressHydrationWarning
            />
          </form>

          {suggestions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-fg-dim">
              {suggestions.map((s, i) => (
                <span
                  key={s}
                  className={
                    i === tabIdx
                      ? "text-fg-bright bg-rule/40 px-1 rounded-sm"
                      : "text-prompt"
                  }
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          <div ref={bottomRef} aria-hidden className="h-6" />
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Title bar — traffic lights, session label, live clock. Gives the page the
// feel of a real terminal emulator window even though it fills the viewport.
// ---------------------------------------------------------------------------

function TitleBar() {
  return (
    <header className="sticky top-0 z-20 relative flex items-center justify-between border-b border-rule bg-bg/80 px-4 py-2 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-1.5">
        <span className="size-3 rounded-full bg-error/80 shadow-[0_0_6px_rgba(255,123,114,0.5)]" />
        <span className="size-3 rounded-full bg-link/80 shadow-[0_0_6px_rgba(255,166,87,0.45)]" />
        <span className="size-3 rounded-full bg-prompt/80 shadow-[0_0_6px_rgba(126,231,135,0.5)]" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[11px] tracking-[0.12em] text-fg-dim uppercase">
        {USER}@{HOST} <span className="text-muted">&nbsp;·&nbsp;</span> /portfolio{" "}
        <span className="text-muted">&nbsp;·&nbsp;</span> zsh
      </div>

      <div className="text-[11px] text-fg-dim tabular-nums">
        <Clock />
      </div>
    </header>
  );
}

function Clock() {
  // Mount-gate: render a stable placeholder during SSR + first hydration so
  // the live time can never disagree with the server-rendered string.
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setT(
        d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{t ?? "--:--:--"}</span>;
}

// ---------------------------------------------------------------------------
// Prompt primitives
// ---------------------------------------------------------------------------

function PromptGlyph() {
  return (
    <span className="select-none whitespace-pre">
      <span className="text-prompt">{USER}</span>
      <span className="text-fg-dim">@</span>
      <span className="text-prompt">{HOST}</span>
      <span className="text-fg-dim">:</span>
      <span className="text-link">{PWD}</span>
      <span className="text-fg-dim">$ </span>
    </span>
  );
}

function PromptEcho({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-baseline">
      <PromptGlyph />
      <span className="flex-1 break-words">{children}</span>
    </div>
  );
}

function Spacer() {
  return <div aria-hidden className="h-3" />;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-block rounded-[3px] border border-rule bg-bg-2 px-1.5 py-[1px] text-[0.85em] text-prompt">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ASCII headline
//
// "ANTHONY KIM" rendered in the ANSI Shadow figlet font for desktop, and a
// compact half-block alternate for narrow viewports. Each row is the exact
// same width per letter so columns line up across all six rows.
// ---------------------------------------------------------------------------

const ASCII_FULL = [
  "   ___        __  __                    __ ___     ",
  "  / _ | ___  / /_/ /  ___  ___  __ __  / //_(_)_ _ ",
  " / __ |/ _ \\/ __/ _ \\/ _ \\/ _ \\/ // / / ,< / /  ' \\",
  "/_/ |_/_//_/\\__/_//_/\\___/_//_/\\_, / /_/|_/_/_/_/_/",
  "                              /___/                ",
].join("\n");

const ASCII_MINI = [
  " ▄▀█ █▄ █▀█▀█ █ █ █▀█ █▄ █ █▄█    █ █ █ █▄▄█",
  " █▀█ █ ▀█  █  █▀█ █▄█ █ ▀█  █     █▀▄ █ █  █",
].join("\n");

function AsciiArt() {
  return (
    <div className="ascii-flicker text-prompt glow-strong select-none">
      <pre className="hidden font-bold leading-[1.05] text-[8px] sm:block sm:text-[9px] md:text-[10px] lg:text-[11px]">
        {ASCII_FULL}
      </pre>
      <pre className="block text-[12px] font-bold leading-[1.1] sm:hidden">
        {ASCII_MINI}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Command output renderers — each returns an array of ReactNodes that the
// runner stitches into the line buffer.
// ---------------------------------------------------------------------------

function helpOutput(): ReactNode[] {
  const rows: Array<[string, string]> = [
    ["help",         "list available commands"],
    ["whoami",       "about me  [-l for full CV]"],
    ["experience",   "work history"],
    ["projects",     "selected projects"],
    ["education",    "where I studied"],
    ["volunteering", "community involvement"],
    ["config",       "dotfiles & system config"],
    ["contact",      "how to reach me"],
    ["clear",        "clear the screen"],
  ];

  return [
    <div key="h-h" className="text-fg-dim">Available commands:</div>,
    <div
      key="h-g"
      className="mt-1 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-0.5"
    >
      {rows.map(([cmd, desc]) => (
        <div key={cmd} className="contents">
          <span className="text-prompt">{cmd}</span>
          <span className="text-fg-dim">{desc}</span>
        </div>
      ))}
    </div>,
    <div key="h-t" className="mt-3 text-[12px] text-fg-dim">
      tip: <Kbd>↑</Kbd> <Kbd>↓</Kbd> history <span className="text-muted">·</span>{" "}
      <Kbd>tab</Kbd> autocomplete <span className="text-muted">·</span>{" "}
      <Kbd>ctrl+l</Kbd> clear
    </div>,
  ];
}

function whoamiOutput(name: string, bio: string): ReactNode[] {
  return [
    <div key="w-n" className="text-heading text-base">
      {name}
    </div>,
    <div key="w-b" className="mt-1 max-w-[80ch] text-fg">
      {bio}
    </div>,
  ];
}

function whoamiLongOutput(
  name: string,
  bio: string,
  roles: Role[],
  projects: Project[],
  education: Education[],
  volunteering: Volunteering[],
  contact: ContactItem[],
): ReactNode[] {
  return [
    // ── header ──
    <div key="cv-rule-top" className="text-muted">{"─".repeat(60)}</div>,
    <div key="cv-name" className="text-heading text-base font-bold">{name}</div>,
    <div key="cv-bio" className="mt-1 max-w-[80ch] text-fg">{bio}</div>,
    <div key="cv-rule-1" className="mt-3 text-muted">{"─".repeat(60)}</div>,

    // ── experience ──
    <div key="cv-exp-h" className="mt-2 text-heading font-medium">EXPERIENCE</div>,
    ...roles.flatMap((role) => [
      <div key={`cv-e-${role.index}-h`} className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg-bright font-medium">{role.title}</span>
        <span className="text-fg-dim">@</span>
        {role.href ? (
          <a href={role.href} target="_blank" rel="noreferrer" className="text-prompt decoration-prompt/40 underline-offset-4 hover:underline">
            {role.company}
          </a>
        ) : (
          <span className="text-prompt">{role.company}</span>
        )}
        {role.dates && <span className="text-[12px] text-muted">| {role.dates}</span>}
      </div>,
      <div key={`cv-e-${role.index}-b`} className="ml-4 max-w-[80ch] text-fg-dim">{role.blurb}</div>,
    ]),

    // ── projects ──
    <div key="cv-rule-2" className="mt-3 text-muted">{"─".repeat(60)}</div>,
    <div key="cv-proj-h" className="mt-2 text-heading font-medium">PROJECTS</div>,
    ...projects.flatMap((p) => [
      <div key={`cv-p-${p.index}-h`} className="mt-2 flex flex-wrap items-baseline gap-x-2">
        {p.href ? (
          <a href={p.href} target="_blank" rel="noreferrer" className="text-fg-bright font-medium decoration-fg-bright/40 underline-offset-4 hover:underline">
            {p.name}
          </a>
        ) : (
          <span className="text-fg-bright font-medium">{p.name}</span>
        )}
        <span className="text-[12px] text-fg-dim">— {p.context}</span>
      </div>,
      <div key={`cv-p-${p.index}-b`} className="ml-4 max-w-[80ch] text-fg-dim">{p.blurb}</div>,
    ]),

    // ── education ──
    <div key="cv-rule-3" className="mt-3 text-muted">{"─".repeat(60)}</div>,
    <div key="cv-edu-h" className="mt-2 text-heading font-medium">EDUCATION</div>,
    ...education.map((item, i) => (
      <div key={`cv-ed-${i}`} className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg-bright font-medium">{item.degree}</span>
        <span className="text-fg-dim">@</span>
        <span className="text-prompt">{item.institution}</span>
        <span className="text-[12px] text-muted">| {item.years}</span>
      </div>
    )),

    // ── volunteering ──
    <div key="cv-rule-4" className="mt-3 text-muted">{"─".repeat(60)}</div>,
    <div key="cv-vol-h" className="mt-2 text-heading font-medium">VOLUNTEERING</div>,
    ...volunteering.map((item, i) => (
      <div key={`cv-vol-${i}`} className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg-bright font-medium">{item.title}</span>
        <span className="text-fg-dim">@</span>
        <span className="text-prompt">{item.organization}</span>
        <span className="text-[12px] text-muted">| {item.dates}</span>
      </div>
    )),

    // ── contact ──
    <div key="cv-rule-5" className="mt-3 text-muted">{"─".repeat(60)}</div>,
    <div key="cv-ct-h" className="mt-2 text-heading font-medium">CONTACT</div>,
    <div key="cv-ct-g" className="mt-1 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5">
      {contact.map((it) => (
        <div key={it.label} className="contents">
          <span className="text-fg-dim">{it.label}</span>
          <a href={it.href} target="_blank" rel="noreferrer" className="text-link decoration-link/40 underline-offset-4 hover:underline">
            {it.value}
          </a>
        </div>
      ))}
    </div>,
    <div key="cv-rule-bot" className="mt-3 text-muted">{"─".repeat(60)}</div>,
  ];
}

function experienceOutput(roles: Role[]): ReactNode[] {
  return [
    <SectionHeader key="e-h">{"// experience"}</SectionHeader>,
    ...roles.flatMap((role) => [
      <div key={`${role.index}-h`} className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg-dim tabular-nums">[{role.index}]</span>
        <span className="text-fg-bright font-medium">{role.title}</span>
        <span className="text-fg-dim">@</span>
        {role.href ? (
          <a
            href={role.href}
            target="_blank"
            rel="noreferrer"
            className="text-prompt decoration-prompt/40 underline-offset-4 hover:underline"
          >
            {role.company}
          </a>
        ) : (
          <span className="text-prompt">{role.company}</span>
        )}
        {role.dates && (
          <span className="text-[12px] text-muted">{role.dates}</span>
        )}
      </div>,
      <div
        key={`${role.index}-b`}
        className="ml-[3.25rem] max-w-[80ch] text-fg-dim"
      >
        {role.blurb}
      </div>,
    ]),
  ];
}

function projectsOutput(projects: Project[]): ReactNode[] {
  return [
    <SectionHeader key="p-h">{"// projects"}</SectionHeader>,
    ...projects.flatMap((p) => [
      <div
        key={`${p.index}-h`}
        className="mt-3 flex flex-wrap items-baseline gap-x-3"
      >
        <span className="text-fg-dim tabular-nums">[{p.index}]</span>
        {p.href ? (
          <a
            href={p.href}
            target="_blank"
            rel="noreferrer"
            className="text-fg-bright font-medium decoration-fg-bright/40 underline-offset-4 hover:underline"
          >
            {p.name}
          </a>
        ) : (
          <span className="text-fg-bright font-medium">{p.name}</span>
        )}
        <span className="text-[12px] text-fg-dim">— {p.context}</span>
      </div>,
      <div
        key={`${p.index}-b`}
        className="ml-[3.25rem] max-w-[80ch] text-fg-dim"
      >
        {p.blurb}
      </div>,
    ]),
  ];
}

function configOutput(files: Dotfile[]): ReactNode[] {
  return [
    <SectionHeader key="c-h">{"// dotfiles & system config"}</SectionHeader>,
    <div key="c-cmd" className="mt-2 text-fg-dim">
      <span className="text-muted">$</span> ls -la ~/.config
    </div>,
    <div
      key="c-list"
      className="mt-1 grid grid-cols-1 gap-y-1.5"
    >
      {files.map((d) => (
        <div
          key={d.name}
          className="flex flex-wrap items-baseline gap-x-3"
        >
          <span className="text-fg-dim text-[12px] tabular-nums">drwxr-xr-x</span>
          <span className="text-prompt">~/.{d.name}</span>
          <span className="text-fg-dim">→</span>
          <a
            href={d.href}
            target="_blank"
            rel="noreferrer"
            className="text-link decoration-link/40 underline-offset-4 hover:underline"
          >
            {d.href.replace(/^https?:\/\//, "")}
          </a>
          <span className="hidden text-[12px] text-fg-dim sm:inline">
            {"// "}{d.description}
          </span>
        </div>
      ))}
    </div>,
  ];
}

function contactOutput(items: ContactItem[]): ReactNode[] {
  return [
    <SectionHeader key="ct-h">{"// contact"}</SectionHeader>,
    <div
      key="ct-g"
      className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5"
    >
      {items.map((it) => (
        <div key={it.label} className="contents">
          <span className="text-fg-dim">{it.label}</span>
          <a
            href={it.href}
            target="_blank"
            rel="noreferrer"
            className="text-link decoration-link/40 underline-offset-4 hover:underline"
          >
            {it.value}
          </a>
        </div>
      ))}
    </div>,
  ];
}

function educationOutput(items: Education[]): ReactNode[] {
  return [
    <SectionHeader key="ed-h">{"// education"}</SectionHeader>,
    ...items.map((item, i) => (
      <div key={`ed-${i}`} className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg-bright font-medium">{item.degree}</span>
        <span className="text-fg-dim">@</span>
        <span className="text-prompt">{item.institution}</span>
        <span className="text-[12px] text-muted">{item.years}</span>
      </div>
    )),
  ];
}

function volunteeringOutput(items: Volunteering[]): ReactNode[] {
  return [
    <SectionHeader key="vol-h">{"// volunteering"}</SectionHeader>,
    ...items.map((item, i) => (
      <div key={`vol-${i}`} className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg-bright font-medium">{item.title}</span>
        <span className="text-fg-dim">@</span>
        <span className="text-prompt">{item.organization}</span>
        <span className="text-[12px] text-muted">{item.dates}</span>
      </div>
    )),
  ];
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-heading">
      {children}
    </div>
  );
}
