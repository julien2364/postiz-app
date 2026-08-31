'use client';

import { MultiSelectFilter } from '@gitroom/frontend/components/filters/multi.select.filter';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';

type Metric = 'total' | 'scheduled' | 'published' | 'imported' | 'error';

type Overview = {
  summary: Record<Metric | 'draft', number>;
  granularity: 'day' | 'week' | 'month';
  series: Array<Record<Metric, number> & { date: string }>;
  matrix: Array<{
    customerId: string;
    customer: string;
    providers: Record<string, number>;
    total: number;
  }>;
  providerTotals: Record<string, number>;
  providers: string[];
};

const PERIODS = [7, 30, 90, 365];
const EMPTY_INTEGRATIONS: any[] = [];
const METRICS: Array<{ key: Metric; label: string; color: string }> = [
  { key: 'total', label: 'Total', color: '#612bd3' },
  { key: 'scheduled', label: 'Programmées', color: '#1d9bf0' },
  { key: 'published', label: 'Publiées', color: '#32d583' },
  { key: 'imported', label: 'App native', color: '#f79009' },
  { key: 'error', label: 'Erreurs', color: '#f04438' },
];

const providerLabel = (provider: string) =>
  provider
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const OverviewDashboard = () => {
  const fetch = useFetch();
  const router = useRouter();
  const [period, setPeriod] = useState(30);
  const [metric, setMetric] = useState<Metric>('total');
  const [customers, setCustomers] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);

  const load = useCallback(
    async (path: string) => (await fetch(path)).json(),
    [fetch]
  );
  const { data: integrationData } = useSWR('/integrations/list', load, {
    revalidateOnFocus: false,
  });
  const integrations = integrationData?.integrations || EMPTY_INTEGRATIONS;
  const customerOptions = useMemo(() => {
    const unique = new Map<string, string>();
    integrations.forEach((integration: any) => {
      if (integration.customer?.id && integration.customer?.name) {
        unique.set(integration.customer.id, integration.customer.name);
      }
    });
    return Array.from(unique, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label)
    );
  }, [integrations]);
  const providerOptions = useMemo(() => {
    const unique = new Set<string>(
      integrations.map((integration: any) => integration.identifier)
    );
    return Array.from(unique)
      .sort()
      .map((value) => ({ value, label: providerLabel(value) }));
  }, [integrations]);

  const dateRange = useMemo(() => {
    const endDate = dayjs().endOf('day');
    return {
      startDate: endDate.subtract(period - 1, 'day').startOf('day'),
      endDate,
    };
  }, [period]);
  const overviewPath = useMemo(() => {
    const params = new URLSearchParams({
      startDate: dateRange.startDate.toISOString(),
      endDate: dateRange.endDate.toISOString(),
      customers: customers.join(','),
      providers: providers.join(','),
      sources: sources.join(','),
      states: states.join(','),
    });
    return `/analytics/overview?${params.toString()}`;
  }, [customers, dateRange, providers, sources, states]);
  const { data, isLoading } = useSWR<Overview>(overviewPath, load, {
    revalidateOnFocus: false,
  });

  const providerColumns = useMemo(() => {
    if (providers.length) return providers;
    return providerOptions.map((option) => option.value);
  }, [providerOptions, providers]);
  const matrixRows = useMemo(() => {
    const rows = new Map(
      data?.matrix.map((row) => [row.customerId, row]) || []
    );
    customerOptions
      .filter((option) => !customers.length || customers.includes(option.value))
      .forEach((option) => {
        if (!rows.has(option.value)) {
          rows.set(option.value, {
            customerId: option.value,
            customer: option.label,
            providers: {},
            total: 0,
          });
        }
      });
    return Array.from(rows.values()).sort((a, b) =>
      a.customer.localeCompare(b.customer)
    );
  }, [customerOptions, customers, data?.matrix]);
  const maxValue = Math.max(
    1,
    ...(data?.series || []).map((point) => point[metric] || 0)
  );
  const activeMetric = METRICS.find((item) => item.key === metric)!;

  const openCalendar = (customerId?: string, provider?: string) => {
    const params = new URLSearchParams({
      display: 'list',
      startDate: dateRange.startDate.format('YYYY-MM-DD'),
      endDate: dateRange.endDate.format('YYYY-MM-DD'),
    });
    if (customerId && customerId !== 'unclassified') {
      params.set('customers', customerId);
    }
    if (provider) params.set('providers', provider);
    if (sources.length) params.set('sources', sources.join(','));
    if (states.length) params.set('states', states.join(','));
    router.push(`/launches?${params.toString()}`);
  };

  if (isLoading || !data) return <LoadingComponent />;

  const cards = [
    ['Total', data.summary.total],
    ['Programmées', data.summary.scheduled],
    ['Publiées', data.summary.published],
    ['Brouillons', data.summary.draft],
    ['Erreurs', data.summary.error],
    ['App native', data.summary.imported],
  ];

  return (
    <div className="flex flex-1 flex-col gap-[18px] overflow-auto p-[20px]">
      <div className="flex flex-wrap items-center gap-[8px]">
        <div className="flex rounded-[8px] border border-newTableBorder p-[3px]">
          {PERIODS.map((days) => (
            <button
              type="button"
              key={days}
              onClick={() => setPeriod(days)}
              className={`rounded-[6px] px-[12px] py-[7px] text-[13px] ${
                period === days ? 'bg-boxFocused text-textItemFocused' : ''
              }`}
            >
              {days === 365 ? '1 an' : `${days} jours`}
            </button>
          ))}
        </div>
        <MultiSelectFilter
          label="Clients"
          allLabel="Tous les clients"
          values={customers}
          options={customerOptions}
          onChange={setCustomers}
        />
        <MultiSelectFilter
          label="Réseaux"
          allLabel="Tous les réseaux"
          values={providers}
          options={providerOptions}
          onChange={setProviders}
        />
        <MultiSelectFilter
          label="Source"
          allLabel="Toutes les sources"
          values={sources}
          options={[
            { value: 'postiz', label: 'Postiz' },
            { value: 'imported', label: 'App native' },
          ]}
          onChange={setSources}
        />
        <MultiSelectFilter
          label="État"
          allLabel="Tous les états"
          values={states}
          options={[
            { value: 'scheduled', label: 'Programmé' },
            { value: 'published', label: 'Publié' },
            { value: 'draft', label: 'Brouillon' },
            { value: 'error', label: 'Erreur' },
          ]}
          onChange={setStates}
        />
      </div>

      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="rounded-[10px] border border-newTableBorder bg-newTableHeader p-[16px]"
          >
            <div className="text-[12px] text-textColor/60">{label}</div>
            <div className="mt-[4px] text-[30px] font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[12px] border border-newTableBorder bg-newTableHeader p-[16px]">
        <div className="mb-[14px] flex flex-wrap items-center justify-between gap-[8px]">
          <div>
            <h2 className="text-[17px] font-semibold">
              Publications par période
            </h2>
            <div className="text-[12px] text-textColor/50">
              Regroupement par{' '}
              {data.granularity === 'day'
                ? 'jour'
                : data.granularity === 'week'
                ? 'semaine'
                : 'mois'}
            </div>
          </div>
          <div className="flex flex-wrap gap-[4px]">
            {METRICS.map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => setMetric(item.key)}
                className={`rounded-[6px] px-[9px] py-[6px] text-[12px] ${
                  metric === item.key ? 'bg-boxFocused' : 'bg-newBgColorInner'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {data.series.length ? (
          <div className="flex h-[230px] items-end gap-[6px] overflow-x-auto border-b border-newTableBorder pb-[24px] pt-[12px]">
            {data.series.map((point) => {
              const value = point[metric] || 0;
              return (
                <div
                  key={point.date}
                  className="relative flex h-full min-w-[34px] flex-1 flex-col items-center justify-end"
                  title={`${point.date}: ${value}`}
                >
                  <span className="mb-[4px] text-[11px] font-semibold">
                    {value}
                  </span>
                  <div
                    className="w-full max-w-[44px] rounded-t-[5px] transition-all"
                    style={{
                      height: `${Math.max(
                        value ? 8 : 2,
                        (value / maxValue) * 155
                      )}px`,
                      backgroundColor: activeMetric.color,
                      opacity: value ? 1 : 0.2,
                    }}
                  />
                  <span className="absolute mt-[190px] whitespace-nowrap text-[9px] text-textColor/50">
                    {dayjs(point.date).format(
                      data.granularity === 'month' ? 'MMM YY' : 'DD/MM'
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-[60px] text-center text-textColor/50">
            Aucune publication pour ces filtres.
          </div>
        )}
      </div>

      <div className="overflow-auto rounded-[12px] border border-newTableBorder bg-newTableHeader">
        <div className="p-[16px]">
          <h2 className="text-[17px] font-semibold">Clients × réseaux</h2>
          <div className="text-[12px] text-textColor/50">
            Cliquez sur un nombre pour ouvrir le calendrier filtré.
          </div>
        </div>
        <table className="w-full min-w-[700px] border-collapse text-[13px]">
          <thead className="bg-newBgColorInner">
            <tr>
              <th className="p-[10px] text-left">Client</th>
              {providerColumns.map((provider) => (
                <th key={provider} className="p-[10px] text-right">
                  {providerLabel(provider)}
                </th>
              ))}
              <th className="p-[10px] text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.map((row) => (
              <tr
                key={row.customerId}
                className="border-t border-newTableBorder"
              >
                <td className="p-[10px] font-medium">{row.customer}</td>
                {providerColumns.map((provider) => (
                  <td key={provider} className="p-[10px] text-right">
                    <button
                      type="button"
                      className="min-w-[28px] rounded-[5px] px-[6px] py-[4px] hover:bg-boxFocused"
                      onClick={() => openCalendar(row.customerId, provider)}
                    >
                      {row.providers[provider] || 0}
                    </button>
                  </td>
                ))}
                <td className="p-[10px] text-right font-semibold">
                  <button
                    type="button"
                    className="rounded-[5px] px-[6px] py-[4px] hover:bg-boxFocused"
                    onClick={() => openCalendar(row.customerId)}
                  >
                    {row.total}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-newTableBorder bg-newBgColorInner font-semibold">
            <tr>
              <td className="p-[10px]">Total</td>
              {providerColumns.map((provider) => (
                <td key={provider} className="p-[10px] text-right">
                  {data.providerTotals[provider] || 0}
                </td>
              ))}
              <td className="p-[10px] text-right">{data.summary.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
