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

// ---------------------------------------------------------------------------
// Public types — kept here so page.tsx can import them without dragging the
// client bundle into its own module graph.
// ---------------------------------------------------------------------------

export type Role = {
  index: string;
  title: string;
  company: string;
  blurb: string;
};

export type Project = {
  index: string;
  name: string;
  context: string;
  blurb: string;
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
}: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  const idRef = useRef(0);
  const bootedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
        description: "about me",
        handler: () => whoamiOutput(name, bio),
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
      ls: {
        description: "list sections",
        handler: () => [
          <div key="ls" className="flex flex-wrap gap-x-6 gap-y-1">
            {[
              "experience/",
              "projects/",
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
    [name, bio, experience, projects, dotfiles, contact, resetToBoot],
  );

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

      const [cmdName, ...args] = trimmed.split(/\s+/);
      const entry = commands[cmdName.toLowerCase()];

      if (!entry) {
        addLines([
          echo,
          <div key="err" className="text-error">
            command not found: {cmdName}
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
      const partial = input.toLowerCase();
      if (!partial) return;
      const matches = Object.keys(commands).filter((c) => c.startsWith(partial));
      if (matches.length === 1) {
        setInput(matches[0]);
      } else if (matches.length > 1) {
        addLines([
          <PromptEcho key={`tab-${idRef.current}`}>
            <span className="text-fg-bright">{input}</span>
          </PromptEcho>,
          <div
            key={`tab-list-${idRef.current}`}
            className="flex flex-wrap gap-x-4 gap-y-1"
          >
            {matches.map((m) => (
              <span key={m} className="text-prompt">
                {m}
              </span>
            ))}
          </div>,
          <Spacer key={`tab-sp-${idRef.current}`} />,
        ]);
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

  return (
    <div className="relative flex min-h-screen flex-col">
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
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-rule bg-bg/80 px-4 py-2 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-1.5">
        <span className="size-3 rounded-full bg-error/80 shadow-[0_0_6px_rgba(255,123,114,0.5)]" />
        <span className="size-3 rounded-full bg-link/80 shadow-[0_0_6px_rgba(255,166,87,0.45)]" />
        <span className="size-3 rounded-full bg-prompt/80 shadow-[0_0_6px_rgba(126,231,135,0.5)]" />
      </div>

      <div className="flex-1 text-center text-[11px] tracking-[0.12em] text-fg-dim uppercase">
        {USER}@{HOST} <span className="text-muted">·</span> /portfolio{" "}
        <span className="text-muted">·</span> zsh
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
    ["help",       "list available commands"],
    ["whoami",     "about me"],
    ["experience", "work history"],
    ["projects",   "selected projects"],
    ["config",     "dotfiles & system config"],
    ["contact",    "how to reach me"],
    ["clear",      "clear the screen"],
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

function experienceOutput(roles: Role[]): ReactNode[] {
  return [
    <SectionHeader key="e-h">{"// experience"}</SectionHeader>,
    ...roles.flatMap((role) => [
      <div key={`${role.index}-h`} className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg-dim tabular-nums">[{role.index}]</span>
        <span className="text-fg-bright font-medium">{role.title}</span>
        <span className="text-fg-dim">@</span>
        <span className="text-prompt">{role.company}</span>
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
        <span className="text-fg-bright font-medium">{p.name}</span>
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

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-heading">
      {children}
    </div>
  );
}
