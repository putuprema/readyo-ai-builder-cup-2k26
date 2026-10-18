"use client";

import type { Profile } from "@adidi/shared";
import { parseRupiahInput } from "@adidi/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ChipGroup, Field, RupiahInput, TextInput } from "./fields";

// The profile asked once, before the first analysis (docs/product.md, "Profile"): the loan
// rules need the age, employment and income; the metrics need the household. Net monthly
// income is confirmed here and checked against the statements by the pipeline.

export function ProfileModal({
  open,
  defaultCity,
  busy,
  error,
  onSave,
  onCancel,
}: {
  open: boolean;
  defaultCity?: string;
  busy: boolean;
  error: string | null;
  onSave: (profile: Profile) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [age, setAge] = useState("");
  const [employment, setEmployment] = useState<Profile["employment"]>("permanent");
  const [income, setIncome] = useState("");
  const [marital, setMarital] = useState<Profile["maritalStatus"]>("single");
  const [dependents, setDependents] = useState("0");
  const [spouseIncome, setSpouseIncome] = useState("");
  const [city, setCity] = useState(defaultCity ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** A field's inline error clears as soon as the user edits that field. */
  function edit(field: string, set: (value: string) => void) {
    return (value: string) => {
      set(value);
      setErrors((current) => {
        if (!(field in current)) return current;
        const { [field]: _, ...rest } = current;
        return rest;
      });
    };
  }

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const ageN = Number(age);
    if (!Number.isInteger(ageN) || ageN < 17 || ageN > 80) next.age = "Enter your age in years.";
    const incomeN = parseRupiahInput(income);
    if (incomeN === null || incomeN <= 0) next.income = "Enter your net monthly income.";
    const depN = Number(dependents);
    if (!Number.isInteger(depN) || depN < 0) next.dependents = "Enter a whole number.";
    const spouseN = spouseIncome.trim() ? parseRupiahInput(spouseIncome) : 0;
    if (marital === "married" && (spouseN === null || spouseN < 0))
      next.spouseIncome = "Enter an amount, or 0.";
    if (!city.trim()) next.city = "Enter the city you live in.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave({
      age: ageN,
      employment,
      netMonthlyIncome: incomeN ?? 0,
      maritalStatus: marital,
      dependents: depN,
      ...(marital === "married" && spouseN ? { spouseMonthlyIncome: spouseN } : {}),
      city: city.trim(),
    });
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="profile-title"
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
    >
      <form onSubmit={submit} className="flex flex-col gap-5 p-6" aria-busy={busy}>
        <div className="flex flex-col gap-1">
          <h2 id="profile-title" className="m-0 font-bold text-[20px]">
            A few things about you
          </h2>
          <p className="m-0 text-[13px] text-muted">
            Asked once. The lending rules depend on your age, employment and income; your income is
            checked against your statements.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="profile-age" label="Age" error={errors.age}>
            <TextInput
              id="profile-age"
              inputMode="numeric"
              value={age}
              onChange={edit("age", setAge)}
              placeholder="e.g. 29"
              error={errors.age}
            />
          </Field>
          <Field id="profile-city" label="City you live in" error={errors.city}>
            <TextInput
              id="profile-city"
              value={city}
              onChange={edit("city", setCity)}
              placeholder="e.g. Tangerang Selatan"
              error={errors.city}
            />
          </Field>
        </div>

        <ChipGroup
          name="employment"
          legend="Employment"
          value={employment}
          options={[
            { value: "permanent", label: "Permanent" },
            { value: "contract", label: "Contract" },
            { value: "freelance", label: "Freelance" },
          ]}
          onChange={setEmployment}
        />

        <Field
          id="profile-income"
          label="Net monthly income (Rp)"
          hint="Take-home pay after tax, averaged if it varies."
          error={errors.income}
        >
          <RupiahInput
            id="profile-income"
            value={income}
            onChange={edit("income", setIncome)}
            placeholder="15.000.000"
            error={errors.income}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ChipGroup
            name="marital"
            legend="Marital status"
            value={marital}
            options={[
              { value: "single", label: "Single" },
              { value: "married", label: "Married" },
            ]}
            onChange={setMarital}
          />
          <Field id="profile-dependents" label="Dependents" error={errors.dependents}>
            <TextInput
              id="profile-dependents"
              inputMode="numeric"
              value={dependents}
              onChange={edit("dependents", setDependents)}
              error={errors.dependents}
            />
          </Field>
        </div>

        {marital === "married" && (
          <Field
            id="profile-spouse"
            label="Spouse's net monthly income (Rp)"
            error={errors.spouseIncome}
          >
            <RupiahInput
              id="profile-spouse"
              value={spouseIncome}
              onChange={edit("spouseIncome", setSpouseIncome)}
              placeholder="0"
              error={errors.spouseIncome}
            />
          </Field>
        )}

        {error && (
          <p role="alert" className="m-0 text-[13px] text-blocked">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3 border-line border-t pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-xl border border-[#C9CFC9] bg-surface px-4 font-semibold text-[15px] text-ink"
          >
            Not now
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-xl bg-accent px-5 font-bold text-[15px] text-white disabled:opacity-60"
          >
            {busy ? "Saving" : "Save and continue"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
