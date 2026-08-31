export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AnalyticsWorkspace } from '@gitroom/frontend/components/analytics/analytics.workspace';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} Analytics`,
  description: '',
};
export default async function Index() {
  return <AnalyticsWorkspace />;
}
