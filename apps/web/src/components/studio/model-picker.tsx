'use client';

import type { ModelOption } from '@minstrel/shared';
import Link from 'next/link';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface ModelGroup {
  connectionId: string;
  connectionLabel: string;
  models: ModelOption[];
}

export interface ModelValue {
  connectionId: string;
  modelId: string;
}

interface Entry extends ModelValue {
  model: ModelOption;
  connectionLabel: string;
}

export const RECENT_KEY = 'minstrel.recentModels';
export const HELPER_RECENT_KEY = 'minstrel.recentHelperModels';
const RECENT_SIZE = 3;

// localStorage can be missing or blocked. The picker then works without the Recent group.
function readRecent(key: string): ModelValue[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveRecent(key: string, pick: ModelValue) {
  try {
    const rest = readRecent(key).filter((r) => r.connectionId !== pick.connectionId || r.modelId !== pick.modelId);
    localStorage.setItem(key, JSON.stringify([pick, ...rest].slice(0, RECENT_SIZE)));
  } catch {
    // Recent is a convenience. A storage failure changes nothing else.
  }
}

const sameModel = (a: ModelValue, b: ModelValue) => a.connectionId === b.connectionId && a.modelId === b.modelId;

// Spec §10.2: an ARIA 1.2 combobox, because a provider can list hundreds of models.
export function ModelPicker({
  groups,
  value,
  onPick,
  errorId,
  label = 'Model',
  recentKey = RECENT_KEY,
}: {
  groups: ModelGroup[];
  value: ModelValue | null;
  onPick: (value: ModelValue) => void;
  /** The visible name of the picker. Each picker on a page needs its own name. */
  label?: string;
  /** The localStorage key of the Recent group, so that each picker keeps its own Recent list. */
  recentKey?: string;
  /** The ID of the error text below the picker, when the model has an error (spec §10.3). */
  errorId?: string;
}) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<ModelValue[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const all: Entry[] = useMemo(
    () =>
      groups.flatMap((g) =>
        g.models.map((model) => ({ connectionId: g.connectionId, modelId: model.id, model, connectionLabel: g.connectionLabel })),
      ),
    [groups],
  );

  const needle = query.trim().toLowerCase();
  const matches = (e: Entry) =>
    !needle ||
    [e.model.label, e.model.id, e.connectionLabel, e.model.note ?? ''].some((t) => t.toLowerCase().includes(needle));

  const recentEntries = recent
    .map((r) => all.find((e) => sameModel(e, r)))
    .filter((e): e is Entry => e !== undefined && matches(e));
  const grouped = groups
    .map((g) => ({ group: g, entries: all.filter((e) => e.connectionId === g.connectionId && matches(e)) }))
    .filter((g) => g.entries.length > 0);
  // One flat list for the arrow keys: Recent first, then each connection.
  const flat = [...recentEntries, ...grouped.flatMap((g) => g.entries)];
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const selected = value ? all.find((e) => sameModel(e, value)) : undefined;

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen]);

  function openPanel() {
    setRecent(readRecent(recentKey));
    setQuery('');
    setActive(-1);
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function pick(entry: Entry) {
    const choice = { connectionId: entry.connectionId, modelId: entry.modelId };
    saveRecent(recentKey, choice);
    onPick(choice);
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = flat[active];
      if (entry) pick(entry);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  // The index of an option in `flat`, which the keyboard highlight uses. Recent options come first.
  const groupStarts = grouped.map(
    (_, g) => recentEntries.length + grouped.slice(0, g).reduce((n, x) => n + x.entries.length, 0),
  );
  const renderOption = (entry: Entry, i: number) => {
    const isSelected = value ? sameModel(entry, value) : false;
    return (
      <li
        key={`${i}-${entry.connectionId}-${entry.modelId}`}
        id={optionId(i)}
        role="option"
        aria-selected={i === active}
        className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 ${i === active ? 'bg-cream' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(entry)}
        onMouseEnter={() => setActive(i)}
      >
        <span className="flex min-w-0 flex-auto flex-col">
          <span className="font-medium">{entry.model.label}</span>
          <span className="mono mu text-[11px]">
            {entry.connectionLabel}
            {entry.model.note ? ` · ${entry.model.note}` : null}
          </span>
        </span>
        {isSelected ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M3 8.5l3.2 3L13 4.5" />
          </svg>
        ) : null}
      </li>
    );
  };

  const groupHeader = 'mono mu flex justify-between gap-3 px-2.5 pt-2.5 pb-1 text-[10px] tracking-[0.04em] uppercase';
  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-col gap-2">
      <span id={`${baseId}-label`} className="lbl">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className={`flex min-h-11 w-full items-center gap-3 rounded-[40px] py-2.5 pr-[18px] pl-5 text-left text-[14px] ${
          isOpen ? 'bg-white outline-2 outline-ink' : 'bg-cream2 hover:bg-cream3'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={`${baseId}-label ${baseId}-value`}
        aria-describedby={errorId}
        onClick={() => (isOpen ? setIsOpen(false) : openPanel())}
      >
        <span id={`${baseId}-value`} className="flex min-w-0 flex-auto items-baseline gap-2.5 overflow-hidden whitespace-nowrap">
          {selected ? (
            <>
              <span className="font-medium">{selected.model.label}</span>{' '}
              <span className="mono mu text-[11px]">· {selected.connectionLabel}</span>
            </>
          ) : (
            'Choose a model'
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M3.5 6l4.5 4.5 4.5-4.5" />
        </svg>
      </button>
      {isOpen ? (
        <div className="absolute top-[calc(100%+8px)] left-0 z-20 w-[min(440px,calc(100vw-32px))] overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/8%),0_24px_48px_-20px_rgb(0_0_0/40%)]">
          <div className="relative px-2.5 pt-2.5 pb-1.5">
            <svg
              className="mu pointer-events-none absolute top-1/2 left-6 -translate-y-1/2"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            <input
              autoFocus
              role="combobox"
              aria-label="Search models"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 && flat[active] ? optionId(active) : undefined}
              placeholder="Search models"
              className="min-h-10 w-full rounded-full border-none bg-cream py-2 pr-3.5 pl-[38px] text-[14px] focus:outline-2 focus:outline-ink"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(-1);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul id={listboxId} role="listbox" aria-label="Models" className="m-0 max-h-[300px] list-none overflow-auto px-1.5 pt-0.5 pb-1.5">
            {recentEntries.length > 0 ? (
              <li role="presentation">
                <ul role="group" aria-labelledby={`${baseId}-recent`} className="m-0 list-none p-0">
                  <li role="presentation" id={`${baseId}-recent`} className={groupHeader}>
                    Recent
                  </li>
                  {recentEntries.map((entry, j) => renderOption(entry, j))}
                </ul>
              </li>
            ) : null}
            {grouped.map(({ group, entries }, g) => (
              <li role="presentation" key={group.connectionId}>
                <ul role="group" aria-labelledby={`${baseId}-group-${group.connectionId}`} className="m-0 list-none p-0">
                  <li role="presentation" id={`${baseId}-group-${group.connectionId}`} className={groupHeader}>
                    {group.connectionLabel}
                  </li>
                  {entries.map((entry, j) => renderOption(entry, groupStarts[g]! + j))}
                </ul>
              </li>
            ))}
          </ul>
          {flat.length === 0 ? <p className="mono mu m-0 px-4 py-4 text-[11px]">No models match</p> : null}
          <div className="mono mu flex items-center justify-between gap-3 border-t border-dotted border-black/10 px-4 py-2.5 text-[11px]">
            <span>
              {all.length} {all.length === 1 ? 'model' : 'models'}
            </span>
            <Link href="/settings/connections" className="dotted text-ink">
              Add a key
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
