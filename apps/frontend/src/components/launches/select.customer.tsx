'use client';

import { FC, useMemo } from 'react';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { MultiSelectFilter } from '@gitroom/frontend/components/filters/multi.select.filter';

export const SelectCustomer: FC<{
  onChange: (value: string) => void;
  integrations: Integrations[];
  customer?: string;
}> = ({ onChange, integrations, customer }) => {
  const t = useT();
  const { setCurrent } = useLaunchStore(
    useShallow((state) => ({ setCurrent: state.setCurrent }))
  );
  const options = useMemo(() => {
    const customers = new Map<string, string>();
    integrations.forEach((integration) => {
      if (integration.customer?.id && integration.customer.name) {
        customers.set(integration.customer.id, integration.customer.name);
      }
    });
    return Array.from(customers, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label)
    );
  }, [integrations]);
  const values = useMemo(
    () => (customer || '').split(',').filter(Boolean),
    [customer]
  );

  if (options.length <= 1) return null;

  return (
    <MultiSelectFilter
      label={t('customers', 'Clients')}
      allLabel={t('all_customers', 'Tous les clients')}
      values={values}
      options={options}
      onChange={(next) => {
        onChange(next.join(','));
        setCurrent('global');
      }}
    />
  );
};
