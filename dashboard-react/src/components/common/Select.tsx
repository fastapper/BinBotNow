import React from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = "", ...props }) => {
  return (
    <div className="flex flex-col space-y-1">
      {label && <label className="text-sm font-semibold text-[var(--text)]">{label}</label>}
      <select
        {...props}
        className={`w-full p-2 rounded bg-[var(--panel)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] ${className}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
