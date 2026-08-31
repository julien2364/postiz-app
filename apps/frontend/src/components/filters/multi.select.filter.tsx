'use client';

import { useClickOutside } from '@mantine/hooks';
import clsx from 'clsx';
import { FC, useMemo, useState } from 'react';

export type MultiSelectOption = {
  value: string;
  label: string;
};

export const MultiSelectFilter: FC<{
  label: string;
  allLabel: string;
  values: string[];
  options: MultiSelectOption[];
  onChange: (values: string[]) => void;
}> = ({ label, allLabel, values, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const selectedLabels = useMemo(
    () =>
      options
        .filter((option) => values.includes(option.value))
        .map((option) => option.label),
    [options, values]
  );

  const displayValue =
    selectedLabels.length === 0
      ? allLabel
      : selectedLabels.length === 1
      ? selectedLabels[0]
      : `${selectedLabels.length} sélectionnés`;

  return (
    <div className="relative z-[450]" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          'h-[42px] min-w-[150px] max-w-[220px] rounded-[8px] border px-[12px] text-left text-[13px] transition-colors',
          open ? 'border-[#612BD3]' : 'border-newColColor'
        )}
      >
        <span className="block text-[10px] uppercase text-textColor/50">
          {label}
        </span>
        <span className="block truncate">{displayValue}</span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute right-0 top-[46px] z-[600] min-w-[230px] rounded-[8px] border border-newTableBorder bg-newBgColorInner p-[6px] menu-shadow"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-[8px] rounded-[6px] px-[10px] py-[8px] text-left text-[13px] hover:bg-boxHover"
          >
            <span className="w-[18px] text-center">
              {values.length === 0 ? '✓' : ''}
            </span>
            {allLabel}
          </button>
          {options.map((option) => {
            const selected = values.includes(option.value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                key={option.value}
                onClick={() =>
                  onChange(
                    selected
                      ? values.filter((value) => value !== option.value)
                      : [...values, option.value]
                  )
                }
                className="flex w-full items-center gap-[8px] rounded-[6px] px-[10px] py-[8px] text-left text-[13px] hover:bg-boxHover"
              >
                <span className="w-[18px] text-center">
                  {selected ? '✓' : ''}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
