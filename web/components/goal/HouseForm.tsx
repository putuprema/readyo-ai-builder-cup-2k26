"use client";

import { HOUSE_CITIES } from "@/lib/cities";
import type { FormErrors, HouseFormValues } from "@/lib/house-form";
import { targetYears } from "@/lib/house-form";
import { ChipGroup, Field, RupiahInput, SelectInput, TextInput } from "./fields";

// 1 · New goal (house): the fields that change the price or the loan rules, the payment
// preference box, the collapsed Refine section and Calculate Estimate. Controlled by the page.

export function HouseForm({
  values,
  errors,
  onChange,
  onCalculate,
  calculating,
  disabled,
}: {
  values: HouseFormValues;
  errors: FormErrors;
  onChange: (patch: Partial<HouseFormValues>) => void;
  onCalculate: () => void;
  calculating: boolean;
  disabled?: boolean;
}) {
  const years = targetYears();
  const yearOptions = (years.includes(values.targetYear) ? years : [values.targetYear, ...years])
    .sort((a, b) => a - b)
    .map((y) => ({ value: y, label: String(y) }));
  const locked = disabled || calculating;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCalculate();
      }}
      className="flex min-w-0 flex-[999_1_560px] flex-col gap-6 rounded-2xl border border-line bg-surface p-5 sm:p-7"
      aria-busy={calculating}
    >
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-bold text-[20px]">House details</h2>
        <p className="m-0 text-[13px] text-muted">
          Only the fields that change the price or the loan rules. Takes about 30 seconds.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="area" label="City or area" error={errors.area}>
          <SelectInput
            id="area"
            value={values.area}
            options={[
              { value: "", label: "Choose a city" },
              ...HOUSE_CITIES.map((c) => ({ value: c.value, label: c.label })),
            ]}
            onChange={(area) => onChange({ area })}
            error={errors.area}
            disabled={locked}
          />
        </Field>
        <Field id="year" label="Target year">
          <SelectInput
            id="year"
            value={values.targetYear}
            options={yearOptions}
            onChange={(targetYear) => onChange({ targetYear })}
            disabled={locked}
          />
        </Field>
      </div>

      <ChipGroup
        name="propertyType"
        legend="Property type"
        value={values.propertyType}
        options={[
          { value: "landed", label: "Landed house" },
          { value: "apartment", label: "Apartment" },
        ]}
        onChange={(propertyType) => onChange({ propertyType })}
        disabled={locked}
      />

      {values.sizeMode === "size" ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field id="land" label="Land size (m²)" error={errors.landM2}>
              <TextInput
                id="land"
                inputMode="decimal"
                value={values.landM2}
                onChange={(landM2) => onChange({ landM2 })}
                placeholder="e.g. 90"
                error={errors.landM2}
                disabled={locked}
              />
            </Field>
            <Field id="building" label="Building size (m²)" error={errors.buildingM2}>
              <TextInput
                id="building"
                inputMode="decimal"
                value={values.buildingM2}
                onChange={(buildingM2) => onChange({ buildingM2 })}
                placeholder="e.g. 70"
                error={errors.buildingM2}
                disabled={locked}
              />
            </Field>
          </div>
          <p className="m-0 text-[13px] text-muted">
            Don't know the size?{" "}
            <button
              type="button"
              onClick={() => onChange({ sizeMode: "budget" })}
              disabled={locked}
              className="inline min-h-0 border-0 bg-transparent p-0 font-semibold text-[13px] text-accent-strong underline"
            >
              Enter a budget range instead
            </button>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field id="budget-low" label="Budget from (Rp)" error={errors.budgetLow}>
              <RupiahInput
                id="budget-low"
                value={values.budgetLow}
                onChange={(budgetLow) => onChange({ budgetLow })}
                placeholder="1.000.000.000"
                error={errors.budgetLow}
                disabled={locked}
              />
            </Field>
            <Field id="budget-high" label="Budget up to (Rp)" error={errors.budgetHigh}>
              <RupiahInput
                id="budget-high"
                value={values.budgetHigh}
                onChange={(budgetHigh) => onChange({ budgetHigh })}
                placeholder="1.500.000.000"
                error={errors.budgetHigh}
                disabled={locked}
              />
            </Field>
          </div>
          <p className="m-0 text-[13px] text-muted">
            Know the size?{" "}
            <button
              type="button"
              onClick={() => onChange({ sizeMode: "size" })}
              disabled={locked}
              className="inline min-h-0 border-0 bg-transparent p-0 font-semibold text-[13px] text-accent-strong underline"
            >
              Enter land and building size instead
            </button>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <ChipGroup
          name="market"
          legend="Market"
          value={values.market}
          options={[
            { value: "new", label: "New (developer)" },
            { value: "secondary", label: "Secondary" },
          ]}
          onChange={(market) => onChange({ market })}
          disabled={locked}
        />
        <ChipGroup
          name="firstHome"
          legend="Is this your first home?"
          value={values.firstHome ? "yes" : "no"}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          onChange={(v) => onChange({ firstHome: v === "yes" })}
          hint="Decides subsidized KPR (FLPP) eligibility and the DP floor."
          disabled={locked}
        />
      </div>

      <ChipGroup
        name="payPreference"
        legend="How would you prefer to pay?"
        value={values.payPreference}
        options={[
          { value: "cash", label: "Cash" },
          { value: "loan", label: "KPR (mortgage)" },
          { value: "none", label: "No preference" },
        ]}
        onChange={(payPreference) => onChange({ payPreference })}
        boxed
        note="We'll show both paths side by side either way. Your preference just picks which one leads."
        disabled={locked}
      />

      <details className="border-line border-t pt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[14px] text-accent-strong">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
          Refine (optional): planned down payment, joint application
        </summary>
        <div className="grid grid-cols-1 gap-5 pt-4 sm:grid-cols-2">
          <Field id="dp" label="Planned down payment (Rp)" error={errors.plannedDp}>
            <RupiahInput
              id="dp"
              value={values.plannedDp}
              onChange={(plannedDp) => onChange({ plannedDp })}
              placeholder="e.g. 280.000.000"
              error={errors.plannedDp}
              disabled={locked}
            />
          </Field>
          <Field id="joint" label="Apply jointly with spouse?">
            <SelectInput
              id="joint"
              value={values.joint}
              options={[
                { value: "not_married", label: "Not married" },
                { value: "joint", label: "Yes, joint income" },
                { value: "single_applicant", label: "No, single applicant" },
              ]}
              onChange={(joint) => onChange({ joint })}
              disabled={locked}
            />
          </Field>
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3 border-line border-t pt-5">
        <p className="m-0 max-w-[340px] text-[13px] text-muted">
          We search current listings and price lists for these details. Takes about 20 seconds; run
          it again after you change anything above.
        </p>
        <button
          type="submit"
          disabled={locked}
          className="inline-flex min-h-12 items-center gap-2.5 rounded-xl border-2 border-accent bg-accent-tint px-5 font-bold text-[15px] text-accent-strong disabled:opacity-60"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          {calculating ? "Searching prices" : "Calculate Estimate"}
        </button>
      </div>
    </form>
  );
}
