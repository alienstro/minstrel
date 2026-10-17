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
const RECENT_SIZE = 3;

// localStorage can be missing or blocked. The picker then works without the Recent group.
function readRecent(): ModelValue[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveRecent(pick: ModelValue) {
  try {
    const rest = readRecent().filter((r) => r.connectionId !== pick.connectionId || r.modelId !== pick.modelId);
    localStorage.setItem(RECENT_KEY, JSON.stringify([pick, ...rest].slice(0, RECENT_SIZE)));
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
}: {
  groups: ModelGroup[];
  value: ModelValue | null;
  onPick: (value: ModelValue) => void;
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
    setRecent(readRecent());
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
    saveRecent(choice);
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
    return (
      <li
        key={`${i}-${entry.connectionId}-${entry.modelId}`}
        id={optionId(i)}
        role="option"
        aria-selected={i === active}
        className={`flex cursor-pointer flex-col rounded-[13px] px-3 py-2 ${i === active ? 'bg-action text-on-action' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(entry)}
        onMouseEnter={() => setActive(i)}
      >
        <span>{entry.model.label}</span>
        {entry.model.note ? <span className="type-label opacity-80">{entry.model.note}</span> : null}
      </li>
    );
  };

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <span id={`${baseId}-label`} className="type-label text-muted">
        Model
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="field flex items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={`${baseId}-label ${baseId}-value`}
        onClick={() => (isOpen ? setIsOpen(false) : openPanel())}
      >
        <span id={`${baseId}-value`}>{selected ? `${selected.model.label} · ${selected.connectionLabel}` : 'Choose a model'}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen ? (
        <div className="card absolute top-full z-20 mt-2 flex w-full min-w-72 flex-col gap-3 p-3">
          <input
            autoFocus
            role="combobox"
            aria-label="Search models"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 && flat[active] ? optionId(active) : undefined}
            placeholder="Search models"
            className="field"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
          />
          <ul id={listboxId} role="listbox" aria-label="Models" className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {recentEntries.length > 0 ? (
              <li role="presentation">
                <ul role="group" aria-labelledby={`${baseId}-recent`}>
                  <li role="presentation" id={`${baseId}-recent`} className="type-label px-3 py-1 text-muted">
                    Recent
                  </li>
                  {recentEntries.map((entry, j) => renderOption(entry, j))}
                </ul>
              </li>
            ) : null}
            {grouped.map(({ group, entries }, g) => (
              <li role="presentation" key={group.connectionId}>
                <ul role="group" aria-labelledby={`${baseId}-group-${group.connectionId}`}>
                  <li role="presentation" id={`${baseId}-group-${group.connectionId}`} className="type-label px-3 py-1 text-muted">
                    {group.connectionLabel}
                  </li>
                  {entries.map((entry, j) => renderOption(entry, groupStarts[g]! + j))}
                </ul>
              </li>
            ))}
          </ul>
          {flat.length === 0 ? <p className="px-3 text-muted">No models match</p> : null}
          <div className="type-label flex items-center justify-between px-3 text-muted">
            <span>
              {all.length} {all.length === 1 ? 'model' : 'models'}
            </span>
            <Link href="/settings/connections" className="underline">
              Add a key
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
