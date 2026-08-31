'use client';

import { OverviewDashboard } from '@gitroom/frontend/components/analytics/overview.dashboard';
import { PlatformAnalytics } from '@gitroom/frontend/components/platform-analytics/platform.analytics';
import { useState } from 'react';

export const AnalyticsWorkspace = () => {
  const [view, setView] = useState<'overview' | 'channel'>('overview');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex gap-[4px] border-b border-newTableBorder bg-newBgColorInner px-[20px] pt-[12px]">
        <button
          type="button"
          onClick={() => setView('overview')}
          className={`rounded-t-[8px] px-[16px] py-[10px] text-[13px] ${
            view === 'overview' ? 'bg-boxFocused text-textItemFocused' : ''
          }`}
        >
          Vue cumulée
        </button>
        <button
          type="button"
          onClick={() => setView('channel')}
          className={`rounded-t-[8px] px-[16px] py-[10px] text-[13px] ${
            view === 'channel' ? 'bg-boxFocused text-textItemFocused' : ''
          }`}
        >
          Par canal
        </button>
      </div>
      {view === 'overview' ? <OverviewDashboard /> : <PlatformAnalytics />}
    </div>
  );
};
