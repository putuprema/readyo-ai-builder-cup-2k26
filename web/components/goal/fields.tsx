"use client";

import { formatRupiahInput, parseRupiahInput } from "@adidi/shared";
import type { ReactNode } from "react";

// Form primitives shared by the goal forms: labelled inputs, chip radio groups and the rupiah
// input with dot separators. All real <label>, <input>, <select> and <fieldset> elements.

const INPUT =
  "h-11 w-full rounded-[10px] border border-[#C9CFC9] bg-surface px-3.5 text-[15px] text-ink disabled:bg-page";
const INPUT_ERROR = "border-blocked";

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold text-[13px]">
        {label}
      </label>
      {children}
      {error ? (
        <span id={`${id}-error`} className="text-[12px] text-blocked">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-[12px] text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  error,
  placeholder,
  inputMode,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal";
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type="text"
      inputMode={inputMode}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT} ${error ? INPUT_ERROR : ""}`}
    />
  );
}

/**
 * Rupiah text input: shows dot thousands separators while typing ("1.350.000.000"), reports
 * the plain text so the form keeps what was typed; `parseRupiahInput` reads it back.
 */
export function RupiahInput({
  id,
  value,
  onChange,
  error,
  placeholder,
  disabled,
  size = "normal",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "normal" | "large";
}) {
  function handle(text: string) {
    const parsed = parseRupiahInput(text);
    onChange(parsed === null ? text.replace(/[^\d.]/g, "") : formatRupiahInput(parsed));
  }
  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-[10px] border ${
        error ? INPUT_ERROR : "border-[#C9CFC9]"
      } ${size === "large" ? "h-[52px]" : "h-11"}`}
    >
      <span className="inline-flex items-center border-[#C9CFC9] border-r bg-page px-3.5 font-semibold text-muted">
        Rp
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => handle(e.target.value)}
        className={`min-w-0 flex-1 border-0 bg-surface px-3.5 text-ink tabular-nums disabled:bg-page ${
          size === "large" ? "font-bold text-[22px]" : "text-[15px]"
        }`}
      />
    </div>
  );
}

export function SelectInput<T extends string | number>({
  id,
  value,
  options,
  onChange,
  error,
  disabled,
}: {
  id: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={String(value)}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(e) => {
        const next = options.find((o) => String(o.value) === e.target.value);
        if (next) onChange(next.value);
      }}
      className={`${INPUT} ${error ? INPUT_ERROR : ""}`}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)} disabled={o.value === ""}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Radio options drawn as chips; the chosen one gets the green border and tint. */
export function ChipGroup<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  hint,
  disabled,
  boxed,
  note,
}: {
  name: string;
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
  disabled?: boolean;
  /** The grey "How would you prefer to pay?" box from the design. */
  boxed?: boolean;
  note?: string;
}) {
  return (
    <fieldset
      className={`m-0 flex min-w-0 flex-col gap-2 border-0 ${
        boxed ? "rounded-xl bg-page p-5" : "p-0"
      }`}
    >
      <legend className={`mb-2 font-semibold text-[13px] ${boxed ? "-ml-2 px-2" : "p-0"}`}>
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] px-3.5 ${
                checked
                  ? "border-2 border-accent bg-accent-tint font-semibold"
                  : "border border-[#C9CFC9] bg-surface font-medium"
              } ${disabled ? "cursor-default opacity-70" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="m-0 accent-accent"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
      {note && <p className="m-0 text-[13px] text-muted">{note}</p>}
    </fieldset>
  );
}
