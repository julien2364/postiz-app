import { useCallback, useState } from 'react';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const ImportScheduledPosts = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const { integrations, reloadCalendarView } = useCalendar();
  const [loading, setLoading] = useState(false);
  const hasSupportedIntegration = integrations.some(
    (integration) =>
      integration.nativeSchedulingImport &&
      !integration.disabled &&
      !integration.inBetweenSteps &&
      !integration.refreshNeeded
  );

  const importScheduled = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/posts/import-scheduled', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Import failed');
      }

      const result = await response.json();
      reloadCalendarView();
      toaster.show(
        result.errors
          ? t(
              'native_schedule_import_partial',
              `Native schedules synced with ${result.errors} error(s)`
            )
          : t(
              'native_schedule_imported',
              `${result.created} native schedule(s) imported`
            ),
        result.errors ? 'warning' : 'success'
      );
    } catch {
      toaster.show(
        t('native_schedule_import_failed', 'Native schedules import failed'),
        'warning'
      );
    } finally {
      setLoading(false);
    }
  }, [fetch, reloadCalendarView, t, toaster]);

  if (!hasSupportedIntegration) {
    return null;
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={importScheduled}
      aria-label={t('import_native_schedules', 'Import native schedules')}
      className="text-btnText flex-1 p-[10px] group-[.sidebar]:p-0 min-h-[44px] max-h-[44px] rounded-md bg-btnSimple flex justify-center items-center gap-[5px] outline-none disabled:opacity-60"
      data-tooltip-id="tooltip"
      data-tooltip-content={t(
        'import_native_schedules_tooltip',
        'Import read-only schedules from supported native apps'
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={loading ? 'animate-spin' : ''}
        aria-hidden="true"
      >
        <path d="M20 7h-5V2" />
        <path d="M4 17h5v5" />
        <path d="M5.1 9A8 8 0 0 1 18.4 5.6L20 7" />
        <path d="M18.9 15A8 8 0 0 1 5.6 18.4L4 17" />
      </svg>
      <div className="flex-1 text-start text-[14px] group-[.sidebar]:hidden">
        {t('import_native_schedules', 'Import native schedules')}
      </div>
    </button>
  );
};
