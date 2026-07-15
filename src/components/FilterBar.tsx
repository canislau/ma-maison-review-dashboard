import type { ReactNode } from "react";

interface FilterBarProps {
  children: ReactNode;
}

export function FilterBar({ children }: FilterBarProps) {
  return <div className="flex flex-wrap items-center gap-2.5 mb-5">{children}</div>;
}

interface SelectFilterProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function SelectFilter({ label, value, onChange, options }: SelectFilterProps) {
  return (
    <select
      aria-label={label}
      className="input w-auto min-w-[9rem]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchFilter({ value, onChange, placeholder = "Search reviews…" }: SearchFilterProps) {
  return (
    <input
      type="text"
      className="input w-auto min-w-[14rem] flex-1"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="month"
      aria-label="Month"
      className="input w-auto"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
