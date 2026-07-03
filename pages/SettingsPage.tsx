import React from 'react';
import Layout from '../components/Layout';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import * as authService from '../services/authService';

const SettingsRow: React.FC<{icon: string, title: string, subtitle?: string, children: React.ReactNode}> = ({icon, title, subtitle, children}) => {
    return (
        <div className="flex items-center justify-between p-4 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
            <div className="flex items-center gap-4">
                <i className={`${icon} w-6 text-center text-xl text-[var(--primary)]`}></i>
                <div>
                    <h3 className="font-semibold text-white">{title}</h3>
                    {subtitle && <p className="text-sm text-[var(--text-dark)]">{subtitle}</p>}
                </div>
            </div>
            <div>
                {children}
            </div>
        </div>
    )
}

const SettingsPage: React.FC = () => {
  const { isDarkMode, setDarkMode, clearAllData, activeProfile, updateProfile } = useProfile();
  const { t, language, setLanguage } = useTranslation();
  const navigate = useNavigate();
  const [authUser, setAuthUser] = React.useState<authService.AuthUser | null>(authService.getCachedUser());

  React.useEffect(() => {
    authService.fetchMe().then(setAuthUser).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await authService.logout();
    setAuthUser(null);
  };

  const handleClearData = () => {
    if (window.confirm(t('clearAllDataConfirm'))) {
      clearAllData();
      window.location.hash = '#/';
    }
  };

  return (
    <Layout>
      <div className="p-4 pt-24 max-w-2xl mx-auto">
        <h1 className="mb-8 text-3xl font-bold">{t('settings')}</h1>

        <div className="space-y-8">
          {/* Active Profile Custom Gemini Key Section */}
          {activeProfile && (
            <section className="space-y-4">
              <div className="p-4 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                <div className="flex items-center gap-4 mb-3">
                  <i className="fa-solid fa-key w-6 text-center text-xl text-[var(--primary)]"></i>
                  <div>
                    <h3 className="font-semibold text-white">{t('geminiApiKeyLabel')}</h3>
                  </div>
                </div>
                <input
                  type="text"
                  value={activeProfile.geminiApiKey || ''}
                  onChange={(e) => updateProfile(activeProfile.id, { geminiApiKey: e.target.value })}
                  placeholder={t('geminiApiKeyPlaceholder')}
                  className="w-full bg-black/30 border border-[var(--border)] px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none rounded-lg focusable"
                />
              </div>
            </section>
          )}

          {/* Account Section */}
          <section className="space-y-4">
            {authUser ? (
              <>
                <SettingsRow icon="fa-solid fa-user" title={authUser.username} subtitle={authUser.role === 'admin' ? 'Administrator' : 'Member'}>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-1.5 text-sm font-bold text-red-400 bg-red-500/10 rounded-lg transition-colors focusable"
                    tabIndex={0}
                  >
                    <i className="fa-solid fa-right-from-bracket mr-2"></i>Log Out
                  </button>
                </SettingsRow>
                {authUser.role === 'admin' && (
                  <SettingsRow icon="fa-solid fa-shield-halved" title="Admin Panel" subtitle="Manage users and accounts">
                    <button
                      onClick={() => navigate('/admin')}
                      className="px-4 py-1.5 text-sm font-bold text-amber-400 bg-amber-500/10 rounded-lg transition-colors focusable"
                      tabIndex={0}
                    >
                      Open
                    </button>
                  </SettingsRow>
                )}
              </>
            ) : (
              <SettingsRow icon="fa-solid fa-user" title="Account" subtitle="Sign in or create an account">
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-1.5 text-sm font-bold text-white bg-[var(--primary)] rounded-lg transition-colors focusable"
                  tabIndex={0}
                >
                  Sign In
                </button>
              </SettingsRow>
            )}
          </section>

          {/* App Settings Section */}
          <section className="space-y-4">
             <SettingsRow icon="fa-solid fa-language" title={t('language')}>
                 <div className="flex gap-2">
                    <button
                        onClick={() => setLanguage('en')}
                        className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors ${language === 'en' ? 'bg-[var(--primary)] text-white' : 'bg-white/10 text-gray-300'}`}
                    >
                        English
                    </button>
                    <button
                        onClick={() => setLanguage('ar')}
                        className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors ${language === 'ar' ? 'bg-[var(--primary)] text-white' : 'bg-white/10 text-gray-300'}`}
                    >
                        العربية
                    </button>
                </div>
             </SettingsRow>
             <SettingsRow icon="fa-solid fa-circle-half-stroke" title={t('appearance')}>
                <div className="flex items-center justify-between">
                  <label htmlFor="dark-mode-toggle-settings" className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      id="dark-mode-toggle-settings"
                      checked={isDarkMode}
                      onChange={(e) => setDarkMode(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
                  </label>
                </div>
             </SettingsRow>
          </section>
          
          {/* Data Management Section */}
          <section className='space-y-4'>
            <SettingsRow icon="fa-solid fa-database" title={t('dataManagement')}>
                <button
                    onClick={handleClearData}
                    className="px-4 py-1.5 text-sm font-bold text-red-400 bg-red-500/10 rounded-lg transition-colors"
                >
                    {t('clearAllData')}
                </button>
            </SettingsRow>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default SettingsPage;
