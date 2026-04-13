"use client";

import { useEffect, useRef, useCallback } from "react";
import Matter from "matter-js";

const { Engine, World, Bodies, Runner } = Matter;

// ---------------------------------------------------------------------------
// SudoRmRf — captures every visible character on the page, clones them into
// a fixed overlay, then drops them one-by-one into a matter.js physics world.
// The rate of falling characters increases over time.
// ---------------------------------------------------------------------------

type CharEntry = {
  span: HTMLSpanElement;
  body: Matter.Body | null;
  x: number;
  y: number;
};

export function SudoRmRf({ onDone }: { onDone?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const frameRef = useRef<number>(0);
  const entriesRef = useRef<CharEntry[]>([]);
  const droppedRef = useRef(0);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef(0);
  const doneCalledRef = useRef(false);

  // Collect every visible character using Range-based measurement (no DOM mutation)
  const collectChars = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const entries: CharEntry[] = [];
    const range = document.createRange();

    // Walk the DOM and find all text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const el = node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          if (el.closest("[data-sudo-overlay]")) return NodeFilter.FILTER_REJECT;
          if (el.tagName === "SCRIPT" || el.tagName === "STYLE")
            return NodeFilter.FILTER_REJECT;
          if (node.textContent?.trim() === "") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    const textNodes: Text[] = [];
    let current: Node | null;
    while ((current = walker.nextNode())) {
      textNodes.push(current as Text);
    }

    // For each text node, measure each character with a Range
    for (const textNode of textNodes) {
      const text = textNode.textContent || "";
      const parentEl = textNode.parentElement;
      if (!parentEl) continue;

      const style = window.getComputedStyle(parentEl);

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === " " || ch === "\n" || ch === "\t") continue;

        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);
        const rects = range.getClientRects();
        if (rects.length === 0) continue;
        const rect = rects[0];

        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

        const clone = document.createElement("span");
        clone.textContent = ch;
        clone.style.position = "absolute";
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.fontSize = style.fontSize;
        clone.style.fontFamily = style.fontFamily;
        clone.style.fontWeight = style.fontWeight;
        clone.style.color = style.color;
        clone.style.lineHeight = "1";
        clone.style.pointerEvents = "none";
        clone.style.willChange = "transform";
        container.appendChild(clone);

        entries.push({
          span: clone,
          body: null,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
    }

    // Shuffle the entries so characters drop randomly
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }

    entriesRef.current = entries;
  }, []);

  // Drop characters into the physics world progressively
  const dropChars = useCallback(() => {
    const entries = entriesRef.current;
    const engine = engineRef.current;
    if (!engine || droppedRef.current >= entries.length) return;

    // Rate increases over time: starts at 1 per tick, grows quadratically
    const elapsed = elapsedRef.current;
    const rate = Math.max(1, Math.floor(1 + elapsed * elapsed * 0.3));
    const toDropCount = Math.min(rate, entries.length - droppedRef.current);

    for (let i = 0; i < toDropCount; i++) {
      const idx = droppedRef.current;
      const entry = entries[idx];
      if (!entry) break;

      const rect = entry.span.getBoundingClientRect();
      const w = rect.width || 8;
      const h = rect.height || 14;

      const body = Bodies.rectangle(entry.x, entry.y, w, h, {
        restitution: 0.3,
        friction: 0.5,
        density: 0.002,
        angle: 0,
      });

      // Small random horizontal velocity for visual interest
      Matter.Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 2,
        y: 0,
      });

      World.add(engine.world, body);
      entry.body = body;
      droppedRef.current += 1;
    }
  }, []);

  // Sync DOM positions to physics bodies
  const syncPositions = useCallback(() => {
    const entries = entriesRef.current;
    for (let i = 0; i < droppedRef.current; i++) {
      const entry = entries[i];
      if (!entry?.body) continue;
      const { x, y } = entry.body.position;
      const angle = entry.body.angle;
      entry.span.style.transform = `translate(${x - entry.x}px, ${y - entry.y}px) rotate(${angle}rad)`;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initialize matter.js engine
    const engine = Engine.create();
    engine.gravity.y = 1.5;
    engineRef.current = engine;

    const runner = Runner.create();
    runnerRef.current = runner;

    // Walls: floor, left, right
    const thickness = 60;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const floor = Bodies.rectangle(w / 2, h + thickness / 2, w * 2, thickness, {
      isStatic: true,
    });
    const leftWall = Bodies.rectangle(-thickness / 2, h / 2, thickness, h * 3, {
      isStatic: true,
    });
    const rightWall = Bodies.rectangle(w + thickness / 2, h / 2, thickness, h * 3, {
      isStatic: true,
    });
    World.add(engine.world, [floor, leftWall, rightWall]);

    // Small delay to let React paint the command output, then start the effect
    const startDelay = setTimeout(() => {
      // Collect characters from the page
      collectChars();

      // Hide original page content (everything except our overlay)
      document.body.style.overflow = "hidden";
      const mainContent = document.querySelector("main");
      const header = document.querySelector("header");
      if (mainContent) (mainContent as HTMLElement).style.visibility = "hidden";
      if (header) (header as HTMLElement).style.visibility = "hidden";

      // Start the physics engine
      Runner.run(runner, engine);

      // Animation loop
      const startTime = performance.now();
      lastTickRef.current = 0;

      const animate = (time: number) => {
        const dt = (time - startTime) / 1000;
        elapsedRef.current = dt;

        // Drop new characters at ~30fps rate
        const tickNumber = Math.floor(dt * 30);
        if (tickNumber > lastTickRef.current) {
          lastTickRef.current = tickNumber;
          dropChars();
        }

        syncPositions();

        // Check if all characters are done and settled
        const allDropped = droppedRef.current >= entriesRef.current.length;
        if (allDropped && !doneCalledRef.current) {
          const bodies = entriesRef.current
            .filter((e) => e.body)
            .map((e) => e.body!);
          const maxSpeed = bodies.reduce(
            (max, b) => Math.max(max, b.speed),
            0,
          );
          if (maxSpeed < 0.5 && dt > 3) {
            doneCalledRef.current = true;
            setTimeout(() => onDone?.(), 1500);
            return;
          }
        }

        frameRef.current = requestAnimationFrame(animate);
      };

      frameRef.current = requestAnimationFrame(animate);
    }, 100);

    // Cleanup
    return () => {
      clearTimeout(startDelay);
      cancelAnimationFrame(frameRef.current);
      Runner.stop(runner);
      World.clear(engine.world, false);
      Engine.clear(engine);
      const mainContent = document.querySelector("main");
      const header = document.querySelector("header");
      if (mainContent) (mainContent as HTMLElement).style.visibility = "";
      if (header) (header as HTMLElement).style.visibility = "";
      document.body.style.overflow = "";
    };
  }, [collectChars, dropChars, syncPositions, onDone]);

  return (
    <div
      ref={containerRef}
      data-sudo-overlay
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    />
  );
}
