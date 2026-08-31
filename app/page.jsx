import AppSwitcher from './AppSwitcher.jsx';
import { config } from '../lib/server/config.js';

export default function Page() {
  return <AppSwitcher showBatchJobMonitorTab={config.showBatchJobMonitorTab} />;
}
