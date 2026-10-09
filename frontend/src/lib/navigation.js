import { LayoutGrid, Activity, ScrollText, ChartNoAxesCombined, Settings2 } from 'lucide-react';

export const navigation = [
  { path: '/', label: 'Overview', icon: LayoutGrid },
  { path: '/activity', label: 'Live Agent Activity', icon: Activity },
  { path: '/audit', label: 'Audit Trail', icon: ScrollText },
  { path: '/usage', label: 'Token Usage', icon: ChartNoAxesCombined },
  { path: '/settings', label: 'Settings', icon: Settings2 },
];