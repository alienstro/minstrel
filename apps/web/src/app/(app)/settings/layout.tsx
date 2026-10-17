import { SettingsTabs } from '@/components/settings-tabs';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <SettingsTabs />
      {children}
    </div>
  );
}
