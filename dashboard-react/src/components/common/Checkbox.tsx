import React from "react";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, className = "", ...props }) => {
  return (
    <label className="flex items-center space-x-2 cursor-pointer">
      <input
        type="checkbox"
        {...props}
        className={`h-4 w-4 rounded border border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] ${className}`}
      />
      <span className="text-[var(--text)]">{label}</span>
    </label>
  );
};
